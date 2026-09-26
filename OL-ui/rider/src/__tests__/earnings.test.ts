import { computeEarnings, estimatePayout, waitCompensation } from '@/domain/earnings';
import { canGoOnlineWithCash, cashLedgerBalance } from '@/domain/cash';
import { DEMO_EARNINGS_RULE } from '@/demo/seed';

describe('earnings rules', () => {
  it('sums base + distance + peak + wait + tip and stores the rule version', () => {
    const e = computeEarnings({ ...DEMO_EARNINGS_RULE, base: 45, perKm: 5, peak: [{ from: '12:00', to: '14:00', amount: 15 }] }, { jobId: 'j', distanceKm: 5, pickupTime: '13:05', tip: 10, waitMinutes: 12 });
    expect(e.base).toBe(45);
    expect(e.distance).toBe(25);
    expect(e.peak).toBe(15);
    expect(e.wait).toBe(4); // 2 minutes over the 10-minute free window × ₹2
    expect(e.tip).toBe(10);
    expect(e.total).toBe(99);
    expect(e.ruleVersion).toBe(DEMO_EARNINGS_RULE.version);
  });

  it('passes 100 % of the tip to the rider', () => {
    const e = computeEarnings(DEMO_EARNINGS_RULE, { jobId: 'j', distanceKm: 1, tip: 73 });
    expect(e.tip).toBe(73);
    expect(e.total).toBe(e.base + e.distance + e.peak + e.wait + 73 + e.bonus);
  });

  it('applies surge to base + distance and does not charge wait inside the free window', () => {
    expect(waitCompensation(DEMO_EARNINGS_RULE, 9)).toBe(0);
    const est = estimatePayout({ ...DEMO_EARNINGS_RULE, peak: [] }, 4, 1.5);
    expect(est).toBe((45 + 24) * 1.5);
  });
});

describe('cash ledger', () => {
  it('is insert-only and balances collected minus deposited', () => {
    const entries = [
      { kind: 'collected' as const, amount: 320 },
      { kind: 'collected' as const, amount: 640 },
      { kind: 'deposited' as const, amount: 500 },
      { kind: 'adjustment' as const, amount: -40 },
    ];
    expect(cashLedgerBalance(entries)).toBe(420);
    expect(Object.isFrozen(entries)).toBe(false);
  });

  it('blocks going online at or above the city limit', () => {
    expect(canGoOnlineWithCash(1999, 2000)).toBe(true);
    expect(canGoOnlineWithCash(2000, 2000)).toBe(false);
    expect(canGoOnlineWithCash(2400, 2000)).toBe(false);
  });
});
