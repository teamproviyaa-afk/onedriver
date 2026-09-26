/**
 * Offline-first queue engine (spec §8, Figma connectivity-states).
 *
 * Every state-changing operation becomes a QueueItem with an idempotency key and
 * the original recordedAt. When the network is available the item is executed
 * immediately; otherwise it waits. When the network returns the queue is replayed
 * IN ORDER: transient failures retry with backoff, version conflicts are surfaced
 * (server state wins) and persistent failures are marked `failed` for the UI.
 */
import { ApiError, type QueueItem, type QueueEntityType, type SyncReport } from '@/types';
import { getDataProvider } from '@/providers';
import type { RiderDataProvider } from '@/providers/types';
import { useConnectivityStore, selectEffectiveOnline } from '@/stores/useConnectivityStore';
import { useOfflineQueueStore } from '@/stores/useOfflineQueueStore';
import { newId, newIdempotencyKey } from '@/utils/ids';
import { log } from '@/utils/logger';

export type QueueResultListener = (item: QueueItem, result: { ok: true; value: unknown } | { ok: false; error: ApiError }) => void;

const listeners = new Set<QueueResultListener>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let backoffMs = 2000;
const MAX_BACKOFF = 60000;
const MAX_RETRIES = 8;

export const onQueueResult = (l: QueueResultListener): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const emit = (item: QueueItem, result: Parameters<QueueResultListener>[1]) => {
  for (const l of listeners) {
    try {
      l(item, result);
    } catch (e) {
      log.warn('queue listener failed', e);
    }
  }
};

/** Executes one queue item against the provider. */
export const executeQueueItem = async (provider: RiderDataProvider, item: QueueItem): Promise<unknown> => {
  const p = item.payload as never;
  const key = item.idempotencyKey;
  switch (`${item.entityType}.${item.action}`) {
    case 'availability.set':
      return provider.setAvailability(p, key);
    case 'heartbeat.send':
      return provider.heartbeat(p);
    case 'offer.accept':
      return provider.acceptOffer(item.entityId, key);
    case 'offer.decline':
      return provider.declineOffer(item.entityId, (p as { reason: never }).reason, key);
    case 'job.step':
      return provider.step(item.entityId, p, key);
    case 'pickup_verify.verify':
      return provider.verifyPickup(item.entityId, p, key);
    case 'track.batch':
      return provider.track(item.entityId, (p as { points: never }).points);
    case 'proof.submit':
      return provider.submitProof(item.entityId, p, key);
    case 'exception.raise':
      return provider.raiseException(item.entityId, p, key);
    case 'exception.resolve_wait': {
      const { kind, outcome } = p as { kind: 'not_ready' | 'unavailable'; outcome: 'continue' | 'escalate' };
      return provider.resolveWait(item.entityId, kind, outcome);
    }
    case 'sos.send':
      return provider.sos(p, key);
    case 'notification.read':
      return provider.markNotificationsRead((p as { ids: string[] }).ids);
    default:
      throw new ApiError({ code: 'unknown', detail: `Unknown queue action ${item.entityType}.${item.action}` });
  }
};

const isTransient = (e: unknown): boolean => ApiError.is(e) && (e.code === 'network' || (e.status !== undefined && e.status >= 500));

export const buildQueueItem = <T>(entityType: QueueEntityType, entityId: string, action: string, payload: T, recordedAt = new Date().toISOString()): QueueItem<T> => ({
  id: newId('q'),
  entityType,
  entityId,
  action,
  payload,
  idempotencyKey: newIdempotencyKey(entityType, entityId, action),
  recordedAt,
  createdAt: new Date().toISOString(),
  retryCount: 0,
  status: 'pending',
});

/**
 * Runs the operation now when online, otherwise queues it. Returns the server
 * result when executed immediately, or `{ queued: true }` when deferred.
 */
export const runOrQueue = async <T, R>(item: QueueItem<T>): Promise<{ queued: false; value: R } | { queued: true }> => {
  const online = selectEffectiveOnline(useConnectivityStore.getState());
  const queue = useOfflineQueueStore.getState();
  if (!online || queue.items.some((i) => i.status === 'pending' || i.status === 'failed')) {
    // Preserve ordering: if anything is already queued, this must follow it.
    queue.enqueue(item);
    syncConnectivity();
    if (online) void processQueue();
    return { queued: true };
  }
  try {
    const value = (await executeQueueItem(getDataProvider(), item)) as R;
    return { queued: false, value };
  } catch (e) {
    if (isTransient(e)) {
      queue.enqueue(item);
      syncConnectivity();
      scheduleRetry();
      return { queued: true };
    }
    throw e;
  }
};

/** Enqueue without attempting immediate execution (fire-and-forget batches such as track points). */
export const enqueue = (item: QueueItem): void => {
  useOfflineQueueStore.getState().enqueue(item);
  syncConnectivity();
  void processQueue();
};

const syncConnectivity = (syncing = false, error: string | null = null) => {
  const items = useOfflineQueueStore.getState().items;
  const pending = items.filter((i) => i.status === 'pending' || i.status === 'failed' || i.status === 'in_flight').length;
  useConnectivityStore.getState().setQueue(pending, syncing, error);
};

const scheduleRetry = () => {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void processQueue();
  }, backoffMs);
  backoffMs = Math.min(MAX_BACKOFF, backoffMs * 2);
};

let processing = false;

/** Replays the queue in order. Safe to call repeatedly. */
export const processQueue = async (): Promise<SyncReport> => {
  const report: SyncReport = { processed: 0, succeeded: 0, failed: 0, conflicts: 0 };
  if (processing) return report;
  const online = selectEffectiveOnline(useConnectivityStore.getState());
  if (!online) {
    syncConnectivity();
    return report;
  }
  processing = true;
  useOfflineQueueStore.getState().setProcessing(true);
  const provider = getDataProvider();
  try {
    // Snapshot ids; items may be appended while we run.
    for (;;) {
      const next = useOfflineQueueStore.getState().items.find((i) => i.status === 'pending' || i.status === 'failed');
      if (!next) break;
      if (!selectEffectiveOnline(useConnectivityStore.getState())) break;
      syncConnectivity(true);
      useOfflineQueueStore.getState().update(next.id, { status: 'in_flight' });
      report.processed += 1;
      try {
        const value = await executeQueueItem(provider, next);
        useOfflineQueueStore.getState().remove(next.id);
        report.succeeded += 1;
        backoffMs = 2000;
        emit(next, { ok: true, value });
      } catch (e) {
        const err = ApiError.is(e) ? e : new ApiError({ code: 'unknown', detail: e instanceof Error ? e.message : 'Sync failed' });
        if (err.code === 'version_conflict') {
          // Server state wins: drop the stale operation and let listeners refetch.
          useOfflineQueueStore.getState().remove(next.id);
          report.conflicts += 1;
          emit(next, { ok: false, error: err });
          continue;
        }
        if (isTransient(err) && next.retryCount < MAX_RETRIES) {
          useOfflineQueueStore.getState().update(next.id, { status: 'pending', retryCount: next.retryCount + 1, lastError: err.detail });
          syncConnectivity(false, err.detail);
          scheduleRetry();
          report.failed += 1;
          break; // keep order: stop here and retry later
        }
        // Persistent failure (4xx business error): surface and drop so the queue can proceed.
        useOfflineQueueStore.getState().remove(next.id);
        report.failed += 1;
        emit(next, { ok: false, error: err });
      }
    }
  } finally {
    processing = false;
    useOfflineQueueStore.getState().setProcessing(false);
    const remaining = useOfflineQueueStore.getState().items.length;
    if (remaining === 0) useConnectivityStore.getState().markSynced();
    else syncConnectivity(false, useConnectivityStore.getState().lastError);
  }
  return report;
};

/** Development helper: fail the next sync attempt to demonstrate "SYNC ERROR • RETRYING". */
export const simulateSyncError = (detail = 'Simulated server error') => {
  useConnectivityStore.getState().setQueue(useOfflineQueueStore.getState().items.length, false, detail);
  scheduleRetry();
};
