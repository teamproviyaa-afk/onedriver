import { useCallback } from 'react';
import { router } from 'expo-router';

import { toast } from '@/components/ui';
import { useJobActions } from '@/hooks';
import { routeForJob } from '@/state-machine/deliveryStateMachine';
import { ApiError, type Job, type StepTarget } from '@/types';
import { errorMessage } from '@/features/delivery/errors';
import type { RouteGuard } from './useJobRouteGuard';

export type GuardedStepResult = { ok: true; job: Job } | { ok: false; kind: 'too_far'; message: string } | { ok: false; kind: 'conflict' | 'error' };

export interface GuardedStepOptions {
  reason?: string;
  /** Route to replace with once the transition succeeds. */
  then?: string;
}

/**
 * Runs `useJobActions().step` with the recovery every arrival button needs:
 * `too_far` hands back a message so the screen can ask for a reason and retry,
 * `version_conflict` toasts "Job updated elsewhere", refreshes from the server and
 * routes to wherever the job is now. The route guard is locked for the duration so
 * the store update does not race our own `router.replace`.
 */
export const useGuardedStep = (guard: RouteGuard) => {
  const { step, refreshFromServer } = useJobActions();

  return useCallback(
    async (job: Job, to: StepTarget, opts: GuardedStepOptions = {}): Promise<GuardedStepResult> => {
      guard.lock();
      try {
        const next = await step(job, to, opts.reason ? { reason: opts.reason } : {});
        if (opts.then) router.replace(opts.then as never);
        return { ok: true, job: next };
      } catch (e) {
        if (ApiError.is(e, 'too_far')) {
          return { ok: false, kind: 'too_far', message: e.detail || 'You are too far from the pin. Add a reason to continue.' };
        }
        if (ApiError.is(e, 'version_conflict')) {
          toast.show('Job updated elsewhere', 'warning');
          const refreshed = await refreshFromServer(job.id);
          router.replace(routeForJob(refreshed ?? job) as never);
          return { ok: false, kind: 'conflict' };
        }
        toast.error(errorMessage(e));
        return { ok: false, kind: 'error' };
      } finally {
        guard.unlock();
      }
    },
    [guard, step, refreshFromServer],
  );
};
