import { useCallback, useEffect, useRef } from 'react';
import { router, useIsFocused } from 'expo-router';

import { useJob } from '@/hooks';
import { routeForJob } from '@/state-machine/deliveryStateMachine';
import type { Job, JobState } from '@/types';

export interface JobScreenResult {
  /** The job when it is in one of the states this screen handles, otherwise null. */
  job: Job | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  /**
   * Call before running a transition the screen navigates after itself, so the
   * guard does not also redirect when the store updates mid-action.
   */
  lockRedirect: () => void;
  unlockRedirect: () => void;
}

/**
 * Loads a job by id and keeps the screen honest about the state machine: when the
 * job is in a state the screen does not handle, the rider is sent to
 * `routeForJob(job)` instead of seeing a stale or invalid screen.
 */
export const useJobScreen = (id: string | undefined, allowed: readonly JobState[]): JobScreenResult => {
  const { job: raw, isLoading, error, refetch } = useJob(id);
  const locked = useRef(false);
  const matches = !!raw && allowed.includes(raw.state);
  const focused = useIsFocused();
  const jobId = raw?.id;
  const jobState = raw?.state;

  // Only the screen in front may redirect, and only when the job's state changes: earlier screens
  // stay mounted in the stack and must not react to updates such as a resent customer code.
  useEffect(() => {
    if (!focused || !jobId || !jobState || matches || locked.current) return;
    router.replace(routeForJob({ id: jobId, state: jobState }) as never);
  }, [focused, jobId, jobState, matches]);

  const lockRedirect = useCallback(() => {
    locked.current = true;
  }, []);
  const unlockRedirect = useCallback(() => {
    locked.current = false;
  }, []);

  return {
    job: matches ? raw : null,
    isLoading,
    error: (error as Error | null) ?? null,
    refetch: () => void refetch(),
    lockRedirect,
    unlockRedirect,
  };
};
