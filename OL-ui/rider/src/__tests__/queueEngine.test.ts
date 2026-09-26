/* eslint-disable import/first */
import { ApiError, type QueueItem } from '@/types';

const mockStep = jest.fn();
const mockGetDataProvider = jest.fn(() => ({ step: mockStep, track: jest.fn(async () => {}), setAvailability: jest.fn(async () => ({ online: true })) }));
jest.mock('@/providers', () => ({ getDataProvider: () => mockGetDataProvider() }));
const step = mockStep;
const getDataProvider = mockGetDataProvider;

import { buildQueueItem, executeQueueItem, onQueueResult, processQueue, runOrQueue } from '@/offline/queueEngine';
import { useConnectivityStore } from '@/stores/useConnectivityStore';
import { useOfflineQueueStore } from '@/stores/useOfflineQueueStore';

const stepItem = (version: number, recordedAt: string) => buildQueueItem('job', 'job-1', 'step', { to: 'at_pickup', version, lat: 1, lng: 2, accuracyM: 5 }, recordedAt);

beforeEach(() => {
  useOfflineQueueStore.getState().clearAll();
  useConnectivityStore.getState().setSimulatedOffline(false);
  useConnectivityStore.getState().setConnected(true);
  useConnectivityStore.getState().markSynced();
  step.mockReset();
});

describe('offline queue engine', () => {
  it('builds items with idempotency keys and preserved recordedAt', () => {
    const item = stepItem(3, '2026-09-26T10:00:00.000Z');
    expect(item.idempotencyKey).toMatch(/^job:job-1:step:/);
    expect(item.recordedAt).toBe('2026-09-26T10:00:00.000Z');
    expect(item.status).toBe('pending');
    expect(item.retryCount).toBe(0);
  });

  it('runs immediately when online', async () => {
    step.mockResolvedValue({ id: 'job-1', state: 'at_pickup', version: 4 });
    const r = await runOrQueue(stepItem(3, new Date().toISOString()));
    expect(r.queued).toBe(false);
    expect(step).toHaveBeenCalledWith('job-1', expect.objectContaining({ to: 'at_pickup', version: 3 }), expect.any(String));
    expect(useConnectivityStore.getState().state).toBe('online_heartbeat');
  });

  it('queues while offline and replays in order when the network returns', async () => {
    useConnectivityStore.getState().setSimulatedOffline(true);
    expect(useConnectivityStore.getState().state).toBe('offline');
    const a = await runOrQueue(stepItem(3, '2026-09-26T10:00:00.000Z'));
    const b = await runOrQueue(stepItem(4, '2026-09-26T10:00:05.000Z'));
    expect(a.queued && b.queued).toBe(true);
    expect(useOfflineQueueStore.getState().items).toHaveLength(2);
    const calls: number[] = [];
    step.mockImplementation(async (_id: string, input: { version: number }) => {
      calls.push(input.version);
      return { id: 'job-1', version: input.version + 1 };
    });
    useConnectivityStore.getState().setSimulatedOffline(false);
    const report = await processQueue();
    expect(report.succeeded).toBe(2);
    expect(calls).toEqual([3, 4]);
    expect(useOfflineQueueStore.getState().items).toHaveLength(0);
    expect(useConnectivityStore.getState().state).toBe('online_heartbeat');
  });

  it('drops conflicting items (server wins) and notifies listeners', async () => {
    useConnectivityStore.getState().setSimulatedOffline(true);
    await runOrQueue(stepItem(3, new Date().toISOString()));
    const seen: string[] = [];
    const off = onQueueResult((_item, result) => seen.push(result.ok ? 'ok' : result.error.code));
    step.mockRejectedValue(new ApiError({ code: 'version_conflict', detail: 'stale', status: 409 }));
    useConnectivityStore.getState().setSimulatedOffline(false);
    const report = await processQueue();
    off();
    expect(report.conflicts).toBe(1);
    expect(seen).toEqual(['version_conflict']);
    expect(useOfflineQueueStore.getState().items).toHaveLength(0);
  });

  it('keeps transient failures pending with a retry count and sync_error state', async () => {
    useConnectivityStore.getState().setSimulatedOffline(true);
    await runOrQueue(stepItem(3, new Date().toISOString()));
    step.mockRejectedValue(new ApiError({ code: 'network', detail: 'timeout' }));
    useConnectivityStore.getState().setSimulatedOffline(false);
    const report = await processQueue();
    expect(report.failed).toBe(1);
    const item = useOfflineQueueStore.getState().items[0]!;
    expect(item.status).toBe('pending');
    expect(item.retryCount).toBe(1);
    expect(useConnectivityStore.getState().state).toBe('sync_error');
  });

  it('executes the right provider method per action', async () => {
    const item: QueueItem = buildQueueItem('availability', 'rider', 'set', { online: true, lat: 0, lng: 0, accuracyM: 1 });
    const provider = getDataProvider() as unknown as Parameters<typeof executeQueueItem>[0];
    await expect(executeQueueItem(provider, item)).resolves.toEqual({ online: true });
    await expect(executeQueueItem(provider, { ...item, entityType: 'notification', action: 'unknown' })).rejects.toMatchObject({ code: 'unknown' });
  });
});
