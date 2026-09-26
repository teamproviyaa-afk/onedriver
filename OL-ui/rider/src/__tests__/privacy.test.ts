import { canCallCustomer, canSeeDropAddress, redactJobForDisplay, stripPii } from '@/domain/privacy';
import { makeJob } from './fixtures';

describe('privacy rules', () => {
  it('hides the full drop address before pickup verification', () => {
    for (const state of ['offered', 'accepted', 'to_pickup', 'at_pickup'] as const) {
      expect(canSeeDropAddress(state)).toBe(false);
      expect(redactJobForDisplay(makeJob({ state })).drop.address).toBeNull();
    }
    for (const state of ['pickup_verified', 'picked_up', 'to_drop', 'at_drop', 'handover', 'proof'] as const) {
      expect(canSeeDropAddress(state)).toBe(true);
      expect(redactJobForDisplay(makeJob({ state })).drop.address).toBe('Apt 4B');
    }
  });

  it('makes the customer phone unavailable after delivery', () => {
    expect(canCallCustomer('to_drop')).toBe(true);
    expect(canCallCustomer('proof')).toBe(true);
    expect(canCallCustomer('delivered')).toBe(false);
    expect(canCallCustomer('offered')).toBe(false);
  });

  it('strips PII for persistence', () => {
    const j = stripPii(makeJob({ state: 'to_drop', drop: { ...makeJob().drop, instructions: 'Gate code 1234', landmark: 'Temple' } }));
    expect(j.drop.address).toBeNull();
    expect(j.drop.instructions).toBeUndefined();
    expect(j.drop.landmark).toBeUndefined();
    expect(j.drop.area).toBe('Shanti Enclave');
  });
});
