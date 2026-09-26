import { useCallback, useEffect, useMemo, useRef } from 'react';
import { router } from 'expo-router';

import { isTerminal, routeForJob } from '@/state-machine/deliveryStateMachine';
import type { Job, JobState } from '@/types';

export interface RouteGuard {
  /** True when the job is in a state this screen renders itself. */
  handled: boolean;
  /** Suppress the redirect while the screen performs a transition it navigates after itself. */
  lock: () => void;
  unlock: () => void;
}

/**
 * Sends the rider to the screen that owns the job's state whenever it is not one of
 * `handled`: terminal jobs go to the task summary, everything else to `routeForJob`.
 * Screens never decide the next state themselves (spec R2).
 */
export const useJobRouteGuard = (job: Pick<Job, 'id' | 'state'> | null | undefined, handled: readonly JobState[]): RouteGuard => {
  const locked = useRef(false);
  const id = job?.id;
  const state = job?.state;
  const isHandled = !!state && handled.includes(state);

  useEffect(() => {
    if (!id || !state || isHandled || locked.current) return;
    router.replace((isTerminal(state) ? `/tasks/${id}` : routeForJob({ id, state })) as never);
  }, [id, state, isHandled]);

  const lock = useCallback(() => {
    locked.current = true;
  }, []);
  const unlock = useCallback(() => {
    locked.current = false;
  }, []);

  return useMemo(() => ({ handled: isHandled, lock, unlock }), [isHandled, lock, unlock]);
};
