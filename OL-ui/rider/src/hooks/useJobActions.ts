import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { ApiError, type ExceptionInput, type ExceptionKind, type ExceptionResponse, type Job, type PickupVerifyInput, type PickupVerifyResult, type ProofInput, type ProofResult, type StepTarget } from '@/types';
import { getDataProvider } from '@/providers';
import { transition, tryTransition } from '@/state-machine/deliveryStateMachine';
import { buildQueueItem, runOrQueue } from '@/offline/queueEngine';
import { useDeliveryStore } from '@/stores/useDeliveryStore';
import { useEarningsStore } from '@/stores/useEarningsStore';
import { queryKeys } from './queryClient';

const positionOrFallback = (job: Job) => {
  const p = useDeliveryStore.getState().position;
  return p ? { lat: p.lat, lng: p.lng, accuracyM: p.accuracyM } : { lat: job.pickup.lat, lng: job.pickup.lng, accuracyM: 999 };
};

/**
 * Every job mutation goes through here: builds an idempotent queue item, runs it
 * now or queues it offline (optimistic local transition via the state machine),
 * updates the delivery store and invalidates caches. Screens never call the
 * provider directly and never compute transitions themselves.
 */
export const useJobActions = () => {
  const qc = useQueryClient();
  const setJob = useDeliveryStore((s) => s.setJob);
  const setLastProof = useDeliveryStore((s) => s.setLastProof);
  const addDelivered = useEarningsStore((s) => s.addDelivered);

  const invalidate = useCallback(
    (jobId?: string) => {
      void qc.invalidateQueries({ queryKey: queryKeys.currentJob });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
      if (jobId) void qc.invalidateQueries({ queryKey: queryKeys.job(jobId) });
    },
    [qc],
  );

  /** Refresh from the server after a conflict — server state always wins. */
  const refreshFromServer = useCallback(
    async (jobId: string): Promise<Job | null> => {
      try {
        const current = await getDataProvider().getCurrentJob();
        if (current && current.id === jobId) {
          setJob(current);
          return current;
        }
        const job = await getDataProvider().getJob(jobId);
        setJob(job.state === 'delivered' || job.state === 'failed' || job.state === 'returned' || job.state === 'cancelled' ? null : job);
        return job;
      } catch {
        return null;
      } finally {
        invalidate(jobId);
      }
    },
    [invalidate, setJob],
  );

  const step = useCallback(
    async (job: Job, to: StepTarget, opts: { reason?: string } = {}): Promise<Job> => {
      const pos = positionOrFallback(job);
      const item = buildQueueItem('job', job.id, 'step', { to, version: job.version, ...pos, reason: opts.reason });
      try {
        const res = await runOrQueue<typeof item.payload, Job>(item);
        if (res.queued) {
          const local = transition(job, to, { expectedVersion: job.version });
          setJob(local, { pendingSync: true });
          return local;
        }
        setJob(res.value);
        invalidate(job.id);
        return res.value;
      } catch (e) {
        if (ApiError.is(e, 'version_conflict')) await refreshFromServer(job.id);
        throw e;
      }
    },
    [invalidate, refreshFromServer, setJob],
  );

  const verifyPickup = useCallback(
    async (job: Job, input: Omit<PickupVerifyInput, 'version'>): Promise<PickupVerifyResult> => {
      const item = buildQueueItem('pickup_verify', job.id, 'verify', { ...input, version: job.version });
      try {
        const res = await runOrQueue<typeof item.payload, PickupVerifyResult>(item);
        if (res.queued) {
          const r = tryTransition(job, 'pickup_verified', { expectedVersion: job.version });
          if (r.ok) setJob(r.job, { pendingSync: true });
          return { result: 'verified', job: r.ok ? r.job : job };
        }
        setJob(res.value.job);
        invalidate(job.id);
        return res.value;
      } catch (e) {
        if (ApiError.is(e, 'version_conflict')) await refreshFromServer(job.id);
        throw e;
      }
    },
    [invalidate, refreshFromServer, setJob],
  );

  const submitProof = useCallback(
    async (job: Job, input: Omit<ProofInput, 'version' | 'lat' | 'lng' | 'accuracyM'>): Promise<ProofResult | { queued: true }> => {
      const pos = positionOrFallback(job);
      const payload = { ...input, version: job.version, ...pos } as ProofInput;
      const item = buildQueueItem('proof', job.id, 'submit', payload);
      try {
        const res = await runOrQueue<ProofInput, ProofResult>(item);
        if (res.queued) {
          let local = job;
          if (local.state === 'handover') local = transition(local, 'proof', { expectedVersion: local.version });
          local = transition(local, 'delivered', { expectedVersion: local.version });
          setJob(local, { pendingSync: true });
          return { queued: true };
        }
        setLastProof(res.value);
        addDelivered(res.value.earnings);
        setJob(null);
        invalidate(job.id);
        void qc.invalidateQueries({ queryKey: ['earnings'] });
        void qc.invalidateQueries({ queryKey: queryKeys.history });
        void qc.invalidateQueries({ queryKey: queryKeys.notifications });
        void qc.invalidateQueries({ queryKey: queryKeys.cash });
        return res.value;
      } catch (e) {
        if (ApiError.is(e, 'version_conflict')) await refreshFromServer(job.id);
        if (ApiError.is(e) && (e.code === 'otp_invalid' || e.code === 'otp_locked')) {
          const updated = (e.meta as { job?: Job } | undefined)?.job;
          if (updated) setJob(updated);
        }
        throw e;
      }
    },
    [addDelivered, invalidate, qc, refreshFromServer, setJob, setLastProof],
  );

  const raiseException = useCallback(
    async (job: Job, kind: ExceptionKind, extra: Partial<Omit<ExceptionInput, 'kind' | 'version' | 'lat' | 'lng'>> = {}): Promise<ExceptionResponse | { queued: true }> => {
      const pos = positionOrFallback(job);
      const payload: ExceptionInput = { kind, version: job.version, lat: pos.lat, lng: pos.lng, ...extra };
      const item = buildQueueItem('exception', job.id, 'raise', payload);
      const res = await runOrQueue<ExceptionInput, ExceptionResponse>(item);
      if (res.queued) return { queued: true };
      if (res.value.jobState === 'failed' || res.value.jobState === 'returned' || res.value.jobState === 'cancelled') setJob(null);
      else await refreshFromServer(job.id);
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
      void qc.invalidateQueries({ queryKey: queryKeys.history });
      return res.value;
    },
    [qc, refreshFromServer, setJob],
  );

  const resolveWait = useCallback(
    async (job: Job, kind: 'not_ready' | 'unavailable', outcome: 'continue' | 'escalate'): Promise<ExceptionResponse | { queued: true }> => {
      const item = buildQueueItem('exception', job.id, 'resolve_wait', { kind, outcome });
      const res = await runOrQueue<typeof item.payload, ExceptionResponse>(item);
      if (res.queued) return { queued: true };
      if (res.value.jobState === 'returned' || res.value.jobState === 'failed') setJob(null);
      else await refreshFromServer(job.id);
      void qc.invalidateQueries({ queryKey: queryKeys.history });
      return res.value;
    },
    [qc, refreshFromServer, setJob],
  );

  const sos = useCallback(async (jobId?: string): Promise<void> => {
    const p = useDeliveryStore.getState().position;
    const item = buildQueueItem('sos', jobId ?? 'none', 'send', { jobId, lat: p?.lat ?? 0, lng: p?.lng ?? 0 });
    await runOrQueue(item);
    void qc.invalidateQueries({ queryKey: queryKeys.notifications });
  }, [qc]);

  const callCustomer = useCallback(async (job: Job): Promise<string> => {
    const r = await getDataProvider().getCallNumber(job.id);
    return r.number;
  }, []);

  return { step, verifyPickup, submitProof, raiseException, resolveWait, sos, callCustomer, refreshFromServer };
};
