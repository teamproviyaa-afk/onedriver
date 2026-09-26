import { FLOW_STATES, TransitionError, canRaiseException, canTransition, isTerminal, nextHappyState, routeForJob, stateOrdinal, transition, tryTransition } from '@/state-machine/deliveryStateMachine';
import type { JobState } from '@/types';
import { makeJob } from './fixtures';

describe('delivery state machine', () => {
  it('has exactly the 12 engine states in order', () => {
    expect(FLOW_STATES).toEqual(['available', 'offered', 'accepted', 'to_pickup', 'at_pickup', 'pickup_verified', 'picked_up', 'to_drop', 'at_drop', 'handover', 'proof', 'delivered']);
    expect(stateOrdinal('available')).toBe(1);
    expect(stateOrdinal('delivered')).toBe(12);
  });

  it('walks the happy path without skipping states', () => {
    let job = makeJob({ state: 'offered', version: 1 });
    const path: JobState[] = ['accepted', 'to_pickup', 'at_pickup', 'pickup_verified', 'picked_up', 'to_drop', 'at_drop', 'handover', 'proof', 'delivered'];
    for (const to of path) {
      expect(nextHappyState(job.state)).toBe(to);
      job = transition(job, to, { expectedVersion: job.version });
      expect(job.state).toBe(to);
    }
    expect(job.version).toBe(11);
    expect(isTerminal(job.state)).toBe(true);
  });

  it('rejects skipped states', () => {
    const job = makeJob({ state: 'to_pickup', version: 3 });
    expect(canTransition('to_pickup', 'to_drop')).toBe(false);
    expect(() => transition(job, 'to_drop', { expectedVersion: 3 })).toThrow(TransitionError);
    const r = tryTransition(job, 'picked_up', { expectedVersion: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_transition');
  });

  it('rejects repeated state advancement (double tap) via version', () => {
    const job = makeJob({ state: 'to_pickup', version: 3 });
    const first = transition(job, 'at_pickup', { expectedVersion: 3 });
    expect(first.version).toBe(4);
    expect(() => transition(first, 'at_pickup', { expectedVersion: 3 })).toThrow(/version_conflict/);
    expect(() => transition(first, 'at_pickup', { expectedVersion: 4 })).toThrow(/invalid_transition/);
  });

  it('never leaves a terminal state', () => {
    const job = makeJob({ state: 'delivered', version: 12 });
    expect(() => transition(job, 'to_pickup', { expectedVersion: 12 })).toThrow(/terminal_state/);
    expect(nextHappyState('delivered')).toBeNull();
  });

  it('does not mutate the input job', () => {
    const job = makeJob({ state: 'accepted', version: 2 });
    transition(job, 'to_pickup', { expectedVersion: 2 });
    expect(job.state).toBe('accepted');
    expect(job.version).toBe(2);
  });

  it('maps exactly one exception branch per state', () => {
    expect(canRaiseException('to_pickup', 'vehicle')).toBe(true);
    expect(canRaiseException('at_pickup', 'not_ready')).toBe(true);
    expect(canRaiseException('at_pickup', 'mismatch')).toBe(true);
    expect(canRaiseException('pickup_verified', 'mismatch')).toBe(true);
    expect(canRaiseException('pickup_verified', 'incomplete')).toBe(true);
    expect(canRaiseException('picked_up', 'safety')).toBe(true);
    expect(canRaiseException('to_drop', 'vehicle')).toBe(true);
    expect(canRaiseException('at_drop', 'unavailable')).toBe(true);
    expect(canRaiseException('at_drop', 'address')).toBe(true);
    expect(canRaiseException('handover', 'refused')).toBe(true);
    expect(canRaiseException('proof', 'proof_failed')).toBe(true);
    expect(canRaiseException('to_pickup', 'refused')).toBe(false);
    expect(canRaiseException('delivered', 'safety')).toBe(false);
    // SOS is available from any active state
    expect(canRaiseException('to_pickup', 'safety')).toBe(true);
  });

  it('routes every state to a screen', () => {
    expect(routeForJob({ id: 'j', state: 'offered' })).toBe('/offer/j');
    expect(routeForJob({ id: 'j', state: 'to_pickup' })).toBe('/job/j');
    expect(routeForJob({ id: 'j', state: 'at_pickup' })).toBe('/job/j/pickup');
    expect(routeForJob({ id: 'j', state: 'pickup_verified' })).toBe('/job/j/pickup/done');
    expect(routeForJob({ id: 'j', state: 'picked_up' })).toBe('/job/j/navigate');
    expect(routeForJob({ id: 'j', state: 'at_drop' })).toBe('/job/j/arrived');
    expect(routeForJob({ id: 'j', state: 'handover' })).toBe('/job/j/proof');
    expect(routeForJob({ id: 'j', state: 'delivered' })).toBe('/job/j/done');
    expect(routeForJob({ id: 'j', state: 'failed' })).toBe('/tasks/j');
  });
});
