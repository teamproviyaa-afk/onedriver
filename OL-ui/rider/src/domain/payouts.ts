import type { PayoutMethod, PayoutNameMatch, PayoutTransfer, PayoutTransferStatus, WalletSummary } from '@/types';
import { formatINR } from '@/utils/format';

/**
 * Payouts (Cashfree Payouts on the server — supabase/functions/_shared/payouts). The app never
 * talks to Cashfree: it asks the One Local server, which verifies the account, sends the money
 * and reports the status. Money is rounded to paise here only for display and validation.
 */

/** Local demo limits (the server sends the real ones in GET /rider/wallet). */
export const DEMO_PAYOUT_RULES = {
  minAmount: 100,
  maxAmount: 5000,
  fee: 0,
  withdrawalsPerDay: 3,
  /** Seconds before a demo transfer is credited (or fails). */
  settleSeconds: 5,
} as const;

/** Demo accounts that exercise the failure paths of account verification. */
export const DEMO_PAYOUT_TEST_ACCOUNTS = {
  /** UPI IDs starting with this are "not active". */
  invalidVpaPrefix: 'invalid',
  /** UPI IDs starting with this belong to someone else ("SURESH PATIL"). */
  mismatchVpaPrefix: 'mismatch',
  /** Bank account numbers ending with these digits. */
  invalidAccountSuffix: '0000',
  mismatchAccountSuffix: '9999',
  otherPersonName: 'SURESH PATIL',
} as const;

export const TERMINAL_PAYOUT_STATUSES: readonly PayoutTransferStatus[] = ['success', 'failed', 'reversed'];

export const isTerminalPayout = (status: PayoutTransferStatus): boolean => TERMINAL_PAYOUT_STATUSES.includes(status);

/** Money leaves the balance for these; failed / reversed amounts come back. */
export const holdsBalance = (status: PayoutTransferStatus): boolean => status === 'processing' || status === 'unknown' || status === 'success';

export const roundRupees = (n: number): number => Math.round(n * 100) / 100;

export interface PayoutStatusCopy {
  label: string;
  tone: 'progress' | 'success' | 'danger';
  body: string;
}

export const describePayoutStatus = (t: Pick<PayoutTransfer, 'status' | 'utr' | 'statusDescription' | 'net' | 'destination'>): PayoutStatusCopy => {
  switch (t.status) {
    case 'success':
      return { label: 'Credited', tone: 'success', body: `${formatINR(t.net, { decimals: 2 })} sent to ${t.destination}${t.utr ? ` · UTR ${t.utr}` : ''}` };
    case 'failed':
      return { label: 'Failed', tone: 'danger', body: `${t.statusDescription ?? 'The bank declined the transfer.'} The amount is back in your balance.` };
    case 'reversed':
      return { label: 'Reversed', tone: 'danger', body: `${t.statusDescription ?? 'The bank returned the money.'} The amount is back in your balance.` };
    case 'unknown':
      return { label: 'Confirming', tone: 'progress', body: 'We are confirming this transfer with the bank. It will not be sent twice.' };
    default:
      return { label: 'Processing', tone: 'progress', body: `Sending to ${t.destination}. UPI and IMPS usually arrive within minutes.` };
  }
};

/** Masked destination for lists and receipts — never the full account number or UPI ID. */
export const maskPayoutDestination = (m: Pick<PayoutMethod, 'method' | 'vpa' | 'accountLast4'>): string => {
  if (m.method === 'upi') {
    const [user = '', handle = ''] = (m.vpa ?? '').split('@');
    const head = user.slice(0, 2);
    return `UPI ${head}${'•'.repeat(Math.max(3, Math.min(6, user.length - head.length)))}${handle ? `@${handle}` : ''}`;
  }
  return `A/C ****${m.accountLast4 ?? '••••'}`;
};

/** Parses what the rider typed ("1,250.5" → 1250.5). NaN when it is not a number. */
export const parseAmount = (text: string): number => {
  const cleaned = text.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return Number.NaN;
  return roundRupees(Number(cleaned));
};

export type WithdrawalProblemCode = 'coming_soon' | 'payout_blocked' | 'no_payout_account' | 'rate_limited' | 'validation' | 'insufficient_balance';

/** Why this amount cannot be withdrawn (same order of checks as the server), or null when it can. */
export const withdrawalProblem = (amount: number, wallet: Pick<WalletSummary, 'available' | 'instant' | 'payoutMethod'>): { code: WithdrawalProblemCode; message: string } | null => {
  const { instant } = wallet;
  if (!instant.enabled) return { code: 'coming_soon', message: 'Instant withdrawal is not available yet. Your earnings are paid out weekly.' };
  if (instant.blockedReason) return { code: 'payout_blocked', message: instant.blockedReason };
  if (!wallet.payoutMethod || wallet.payoutMethod.status !== 'verified') return { code: 'no_payout_account', message: 'Add and verify a UPI ID or bank account first.' };
  if (instant.withdrawalsLeftToday <= 0) return { code: 'rate_limited', message: "You've reached today's withdrawal limit. Try again tomorrow." };
  if (!Number.isFinite(amount) || amount <= 0) return { code: 'validation', message: 'Enter an amount.' };
  if (amount < instant.minAmount) return { code: 'validation', message: `The minimum withdrawal is ${formatINR(instant.minAmount)}.` };
  if (amount > wallet.available) return { code: 'insufficient_balance', message: `You can withdraw up to ${formatINR(wallet.available, { decimals: 2 })}.` };
  if (amount > instant.maxAmount) return { code: 'validation', message: `The maximum per withdrawal is ${formatINR(instant.maxAmount)}.` };
  if (amount - instant.fee <= 0) return { code: 'validation', message: 'The amount must be more than the transfer fee.' };
  return null;
};

/** The most the rider can take out in one withdrawal right now. */
export const maxWithdrawable = (wallet: Pick<WalletSummary, 'available' | 'instant'>): number => roundRupees(Math.max(0, Math.min(wallet.available, wallet.instant.maxAmount)));

/** Quick-pick chips: round amounts below the limit, then "All". */
export const quickAmounts = (wallet: Pick<WalletSummary, 'available' | 'instant'>): { label: string; value: number }[] => {
  const max = maxWithdrawable(wallet);
  if (max < wallet.instant.minAmount) return [];
  const round = [500, 1000, 2000].filter((v) => v >= wallet.instant.minAmount && v < max);
  return [...round.slice(0, 2).map((v) => ({ label: formatINR(v), value: v })), { label: max === wallet.available ? 'All' : 'Max', value: max }];
};

// ── Name match (mirrors supabase/functions/_shared/payouts/names.ts) ────────────────
const TITLES = new Set(['MR', 'MRS', 'MS', 'MISS', 'SHRI', 'SMT', 'KUM', 'DR', 'SRI']);

const nameTokens = (name: string): string[] =>
  name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !TITLES.has(t));

const tokenMatches = (a: string, b: string): boolean => a === b || (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b));

/** good: every word of the shorter name is in the other (initials allowed); partial: at least half; poor: someone else. */
export const matchNames = (riderName: string, bankName: string): PayoutNameMatch => {
  const a = nameTokens(riderName);
  const b = nameTokens(bankName);
  if (!a.length || !b.length) return 'poor';
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const used = new Set<number>();
  let hits = 0;
  for (const t of short) {
    const i = long.findIndex((u, idx) => !used.has(idx) && tokenMatches(t, u));
    if (i >= 0) {
      used.add(i);
      hits += 1;
    }
  }
  const score = hits / short.length;
  return score >= 0.999 ? 'good' : score >= 0.5 ? 'partial' : 'poor';
};

/** Bank behind common UPI handles (display only). */
export const bankForVpa = (vpa: string): string | undefined => {
  const handle = vpa.split('@')[1]?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ybl: 'PhonePe · Yes Bank',
    ibl: 'PhonePe · ICICI Bank',
    axl: 'PhonePe · Axis Bank',
    okaxis: 'Google Pay · Axis Bank',
    oksbi: 'Google Pay · SBI',
    okhdfcbank: 'Google Pay · HDFC Bank',
    okicici: 'Google Pay · ICICI Bank',
    paytm: 'Paytm Payments Bank',
    ptsbi: 'Paytm · SBI',
    upi: 'BHIM UPI',
  };
  return map[handle];
};

/** Next weekly payout: Monday 10:00 local time. */
export const nextWeeklyPayoutAt = (from: Date = new Date()): Date => {
  const d = new Date(from);
  d.setHours(10, 0, 0, 0);
  const add = (8 - d.getDay()) % 7;
  d.setDate(d.getDate() + add);
  if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 7);
  return d;
};
