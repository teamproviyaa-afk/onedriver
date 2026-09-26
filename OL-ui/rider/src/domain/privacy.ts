import type { Job } from '@/types';
import { stateOrdinal } from '@/state-machine/deliveryStateMachine';

/** The full drop address appears only after pickup_verified and only while the job is active (spec §5.4 / §8). */
export const canSeeDropAddress = (state: Job['state']): boolean => {
  const ord = stateOrdinal(state);
  return ord >= stateOrdinal('pickup_verified') && ord <= stateOrdinal('proof');
};

/** The customer's phone is available only during the active job (accepted … proof). */
export const canCallCustomer = (state: Job['state']): boolean => {
  const ord = stateOrdinal(state);
  return ord >= stateOrdinal('accepted') && ord <= stateOrdinal('proof');
};

/** Redacts the job for display outside the permitted window. */
export const redactJobForDisplay = (job: Job): Job => {
  if (canSeeDropAddress(job.state)) return job;
  return { ...job, drop: { ...job.drop, address: null, flatFloor: undefined } };
};

/** Never persist customer PII in app caches or logs. */
export const stripPii = (job: Job): Job => ({
  ...job,
  drop: { ...job.drop, address: null, flatFloor: undefined, instructions: undefined, landmark: undefined },
});
