import { formatINR } from '@/utils/format';

/** Cash-in-hand rules (spec §4.3): going online is blocked above the city limit. */
export const canGoOnlineWithCash = (cashInHand: number, cashLimit: number): boolean => cashInHand < cashLimit;

export const cashHeadroom = (cashInHand: number, cashLimit: number): number => Math.max(0, cashLimit - cashInHand);

export const cashLedgerBalance = (entries: { kind: 'collected' | 'deposited' | 'adjustment'; amount: number }[]): number =>
  entries.reduce((sum, e) => {
    if (e.kind === 'collected') return sum + e.amount;
    if (e.kind === 'deposited') return sum - e.amount;
    return sum + e.amount;
  }, 0);

/** Cash deposit by UPI (Cashfree Payment Gateway): at least the minimum, never more than the cash in hand. */
export const upiDepositProblem = (amount: number, cash: { cashInHand: number; upiDeposit?: { enabled: boolean; minAmount: number; maxAmount: number } }): string | null => {
  const upi = cash.upiDeposit;
  if (!upi?.enabled) return 'UPI deposits are not available yet. Deposit at the store counter.';
  if (cash.cashInHand <= 0) return 'You have no cash to deposit.';
  if (!Number.isFinite(amount) || amount <= 0) return 'Enter an amount.';
  if (amount < upi.minAmount) return `The minimum deposit is ${formatINR(upi.minAmount)}.`;
  if (amount > cash.cashInHand) return `You hold ${formatINR(cash.cashInHand, { decimals: 2 })}; you can't deposit more than that.`;
  if (amount > upi.maxAmount) return `The maximum per UPI deposit is ${formatINR(upi.maxAmount)}.`;
  return null;
};
