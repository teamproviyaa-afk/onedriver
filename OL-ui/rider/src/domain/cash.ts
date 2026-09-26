/** Cash-in-hand rules (spec §4.3): going online is blocked above the city limit. */
export const canGoOnlineWithCash = (cashInHand: number, cashLimit: number): boolean => cashInHand < cashLimit;

export const cashHeadroom = (cashInHand: number, cashLimit: number): number => Math.max(0, cashLimit - cashInHand);

export const cashLedgerBalance = (entries: { kind: 'collected' | 'deposited' | 'adjustment'; amount: number }[]): number =>
  entries.reduce((sum, e) => {
    if (e.kind === 'collected') return sum + e.amount;
    if (e.kind === 'deposited') return sum - e.amount;
    return sum + e.amount;
  }, 0);
