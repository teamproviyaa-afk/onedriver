import { mapPayoutMethod, mapPayoutTransfer, mapWallet } from '@/api/mappers';
import { DEMO_RETURNING_PHONE } from '@/demo/constants';
import {
  DEMO_PAYOUT_RULES,
  describePayoutStatus,
  maskPayoutDestination,
  matchNames,
  nextWeeklyPayoutAt,
  parseAmount,
  quickAmounts,
  withdrawalProblem,
} from '@/domain/payouts';
import { LocalDemoProvider } from '@/providers/localDemoProvider';
import type { WalletSummary } from '@/types';

const returningRider = async () => {
  const p = new LocalDemoProvider();
  await p.attachPhone(DEMO_RETURNING_PHONE);
  return p;
};

/** Moves the simulated bank past its answer time. */
const afterSettle = async <T,>(fn: () => Promise<T>): Promise<T> => {
  const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + (DEMO_PAYOUT_RULES.settleSeconds + 1) * 1000);
  try {
    return await fn();
  } finally {
    spy.mockRestore();
  }
};

const wallet = (over: Partial<WalletSummary['instant']> = {}, rest: Partial<WalletSummary> = {}): WalletSummary => ({
  balance: 1420,
  available: 1420,
  inFlight: 0,
  instant: { enabled: true, minAmount: 100, maxAmount: 5000, fee: 0, withdrawalsLeftToday: 3, ...over },
  weekly: { nextPayoutAt: new Date().toISOString(), description: '' },
  payoutMethod: { id: 'm', method: 'upi', vpa: 'rahul.sharma@ybl', status: 'verified', isPrimary: true },
  recent: [],
  ...rest,
});

describe('payout rules', () => {
  it('parses typed amounts and rejects anything that is not money', () => {
    expect(parseAmount('1,250.5')).toBe(1250.5);
    expect(parseAmount('₹ 500')).toBe(500);
    expect(parseAmount('12.345')).toBeNaN();
    expect(parseAmount('abc')).toBeNaN();
    expect(parseAmount('')).toBeNaN();
  });

  it('checks a withdrawal in the same order as the server', () => {
    expect(withdrawalProblem(500, wallet())).toBeNull();
    expect(withdrawalProblem(500, wallet({ enabled: false }))?.code).toBe('coming_soon');
    expect(withdrawalProblem(500, wallet({ blockedReason: 'Deposit cash first' }))).toEqual({ code: 'payout_blocked', message: 'Deposit cash first' });
    expect(withdrawalProblem(500, wallet({}, { payoutMethod: null }))?.code).toBe('no_payout_account');
    expect(withdrawalProblem(500, wallet({ withdrawalsLeftToday: 0 }))?.code).toBe('rate_limited');
    expect(withdrawalProblem(50, wallet())?.code).toBe('validation');
    expect(withdrawalProblem(2000, wallet())?.code).toBe('insufficient_balance');
    expect(withdrawalProblem(6000, wallet({}, { available: 9000 }))?.message).toMatch(/maximum/);
    expect(withdrawalProblem(100, wallet({ fee: 100 }))?.message).toMatch(/fee/);
  });

  it('offers round amounts below the limit, then everything', () => {
    expect(quickAmounts(wallet())).toEqual([
      { label: '₹500', value: 500 },
      { label: '₹1,000', value: 1000 },
      { label: 'All', value: 1420 },
    ]);
    expect(quickAmounts(wallet({}, { available: 9000 })).at(-1)).toEqual({ label: 'Max', value: 5000 });
    expect(quickAmounts(wallet({}, { available: 60 }))).toEqual([]);
  });

  it('never shows a full UPI ID or account number', () => {
    expect(maskPayoutDestination({ method: 'upi', vpa: 'rahul.sharma@ybl' })).toBe('UPI ra••••••@ybl');
    expect(maskPayoutDestination({ method: 'bank', accountLast4: '4521' })).toBe('A/C ****4521');
  });

  it('matches names like the server (initials and titles allowed)', () => {
    expect(matchNames('Rahul Sharma', 'MR RAHUL K SHARMA')).toBe('good');
    expect(matchNames('Rahul Sharma', 'R SHARMA')).toBe('good');
    expect(matchNames('Rahul Sharma', 'RAHUL VERMA')).toBe('partial');
    expect(matchNames('Rahul Sharma', 'SURESH PATIL')).toBe('poor');
  });

  it('pays weekly on Monday at 10:00', () => {
    const sunday = new Date(2026, 8, 27, 18, 0);
    expect(nextWeeklyPayoutAt(sunday)).toEqual(new Date(2026, 8, 28, 10, 0));
    const mondayLate = new Date(2026, 8, 28, 11, 0);
    expect(nextWeeklyPayoutAt(mondayLate)).toEqual(new Date(2026, 9, 5, 10, 0));
  });

  it('explains every status in plain words', () => {
    const base = { net: 500, destination: 'UPI ra•••@ybl' };
    expect(describePayoutStatus({ ...base, status: 'success', utr: '4261' })).toMatchObject({ label: 'Credited', tone: 'success' });
    expect(describePayoutStatus({ ...base, status: 'failed' }).body).toMatch(/back in your balance/);
    expect(describePayoutStatus({ ...base, status: 'unknown' }).body).toMatch(/not be sent twice/);
  });
});

describe('payout API mapping', () => {
  it('maps the wallet and transfers from snake_case', () => {
    const w = mapWallet({
      balance: 1420,
      available: 1000,
      in_flight: 420,
      instant: { enabled: true, min_amount: 100, max_amount: 5000, fee: 5, withdrawals_left_today: 2, blocked_reason: null },
      weekly: { next_payout_at: '2026-10-05T04:30:00Z', description: 'Every Monday' },
      payout_method: { method: 'upi', vpa: 'ra***@ybl', verified_name: 'RAHUL SHARMA', name_match: 'good', status: 'verified', provider: 'cashfree' },
      recent: [{ id: 'p1', kind: 'instant', mode: 'upi', amount: 420, fee: 5, status: 'processing', destination: 'UPI ra•••@ybl', created_at: '2026-09-28T10:00:00Z' }],
    });
    expect(w).toMatchObject({ balance: 1420, available: 1000, inFlight: 420, instant: { minAmount: 100, fee: 5, withdrawalsLeftToday: 2, blockedReason: undefined } });
    expect(w.payoutMethod).toMatchObject({ verifiedName: 'RAHUL SHARMA', nameMatch: 'good', provider: 'cashfree', isPrimary: true });
    expect(w.recent[0]).toMatchObject({ net: 415, utr: undefined });
    expect(mapPayoutTransfer({ id: 'p2', kind: 'weekly', mode: 'imps', amount: 3120, status: 'success', utr: 'U1', destination: 'A/C ****4521', created_at: 'x', completed_at: 'y' })).toMatchObject({ fee: 0, net: 3120, utr: 'U1', completedAt: 'y' });
    expect(mapPayoutMethod({ method: 'bank', account_last4: '4521', status: 'verified' }).id).toBe('payout-bank');
  });
});

describe('wallet & withdrawals (demo server)', () => {
  it('the returning rider has unpaid earnings since the last weekly payout and a verified UPI ID', async () => {
    const p = await returningRider();
    const w = await p.getWallet();
    expect(w.balance).toBe(1420); // yesterday after the 09:00 payout (₹640) + today (₹780)
    expect(w.available).toBe(1420);
    expect(w.inFlight).toBe(0);
    expect(w.instant).toMatchObject({ enabled: true, minAmount: 100, maxAmount: 5000, withdrawalsLeftToday: 3 });
    expect(w.instant.blockedReason).toBeUndefined();
    expect(w.payoutMethod).toMatchObject({ method: 'upi', status: 'verified', verifiedName: 'RAHUL SHARMA' });
    expect(w.recent[0]).toMatchObject({ kind: 'weekly', amount: 3120, status: 'success' });
  });

  it('a withdrawal is processing, then credited with a UTR; the rider is told on WhatsApp', async () => {
    const p = await returningRider();
    const t = await p.requestWithdrawal(500, 'wd-1');
    expect(t).toMatchObject({ kind: 'instant', mode: 'upi', amount: 500, net: 500, status: 'processing', destination: 'UPI ra••••••@ybl' });
    expect(t).not.toHaveProperty('idempotencyKey');
    let w = await p.getWallet();
    expect(w).toMatchObject({ balance: 920, available: 920, inFlight: 500 });
    expect(w.instant.withdrawalsLeftToday).toBe(2);

    const done = await afterSettle(() => p.getPayout(t.id));
    expect(done.status).toBe('success');
    expect(done.utr).toMatch(/^\d{12}$/);
    w = await p.getWallet();
    expect(w).toMatchObject({ balance: 920, inFlight: 0 });
    const notes = await p.listNotifications();
    expect(notes.items[0]).toMatchObject({ kind: 'payment_disbursed', title: 'Withdrawal credited' });
    const outbox = await p.getDemoOutbox();
    expect(outbox.find((m) => m.template === 'payout_sent')).toMatchObject({ channel: 'whatsapp', audience: 'rider' });
  });

  it('retrying with the same idempotency key never pays twice', async () => {
    const p = await returningRider();
    const a = await p.requestWithdrawal(500, 'wd-same');
    const b = await p.requestWithdrawal(500, 'wd-same');
    expect(b.id).toBe(a.id);
    expect((await p.getWallet()).balance).toBe(920);
    expect((await p.listPayouts()).items.filter((x) => x.kind === 'instant')).toHaveLength(1);
  });

  it('refuses amounts outside the limits and more than 3 withdrawals a day', async () => {
    const p = await returningRider();
    await expect(p.requestWithdrawal(50, 'a')).rejects.toMatchObject({ code: 'validation' });
    await expect(p.requestWithdrawal(1500, 'b')).rejects.toMatchObject({ code: 'insufficient_balance' });
    await p.requestWithdrawal(100, 'c');
    await p.requestWithdrawal(100, 'd');
    await p.requestWithdrawal(100, 'e');
    await expect(p.requestWithdrawal(100, 'f')).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
  });

  it('a failed transfer returns the amount to the balance', async () => {
    const p = await returningRider();
    await p.applyScenario('payout_failed');
    const t = await p.requestWithdrawal(300, 'wd-fail');
    expect((await p.getWallet()).balance).toBe(1120);
    const done = await afterSettle(() => p.getPayout(t.id));
    expect(done).toMatchObject({ status: 'failed' });
    expect(done.statusDescription).toBeTruthy();
    const w = await p.getWallet();
    expect(w).toMatchObject({ balance: 1420, inFlight: 0 });
    expect(w.instant.withdrawalsLeftToday).toBe(3);
    // Only the next one fails.
    const again = await p.requestWithdrawal(300, 'wd-ok');
    expect((await afterSettle(() => p.getPayout(again.id))).status).toBe('success');
  });

  it('cash in hand above the limit blocks withdrawals until it is deposited', async () => {
    const p = await returningRider();
    await p.applyScenario('cash_limit');
    const w = await p.getWallet();
    expect(w.instant.blockedReason).toMatch(/cash in hand/i);
    await expect(p.requestWithdrawal(500, 'x')).rejects.toMatchObject({ code: 'payout_blocked' });
    await p.recordDeposit(2400);
    expect((await p.getWallet()).instant.blockedReason).toBeUndefined();
  });

  it('a suspended rider cannot withdraw', async () => {
    const p = await returningRider();
    await p.applyScenario('suspended_rider');
    const w = await p.getWallet();
    expect(w.available).toBe(0);
    await expect(p.requestWithdrawal(500, 'x')).rejects.toMatchObject({ code: 'payout_blocked' });
  });
});

describe('payout account verification (demo server)', () => {
  it('UPI: inactive IDs and IDs in someone else\'s name are refused', async () => {
    const p = await returningRider();
    await expect(p.setPayout({ method: 'upi', vpa: 'invalid@ybl' })).rejects.toMatchObject({ code: 'account_invalid' });
    await expect(p.setPayout({ method: 'upi', vpa: 'mismatch@ybl' })).rejects.toMatchObject({ code: 'name_mismatch', detail: expect.stringContaining('SURESH PATIL') });
    const ok = await p.setPayout({ method: 'upi', vpa: 'Rahul.S@oksbi' });
    expect(ok).toMatchObject({ method: 'upi', vpa: 'rahul.s@oksbi', verifiedName: 'RAHUL SHARMA', nameMatch: 'good', status: 'verified', bankName: 'Google Pay · SBI' });
    expect((await p.getWallet()).payoutMethod?.vpa).toBe('rahul.s@oksbi');
  });

  it('bank: name must match the rider (partial allowed), closed accounts are refused', async () => {
    const p = await returningRider();
    await expect(p.setPayout({ method: 'bank', holder: 'Rahul Sharma', accountNo: '123456780000', ifsc: 'HDFC0000124' })).rejects.toMatchObject({ code: 'account_invalid' });
    await expect(p.setPayout({ method: 'bank', holder: 'Rahul Sharma', accountNo: '123456789999', ifsc: 'HDFC0000124' })).rejects.toMatchObject({ code: 'name_mismatch' });
    await expect(p.setPayout({ method: 'bank', holder: 'Suresh Patil', accountNo: '123456784521', ifsc: 'HDFC0000124' })).rejects.toMatchObject({ code: 'name_mismatch' });
    expect(await p.setPayout({ method: 'bank', holder: 'Rahul Verma', accountNo: '123456784521', ifsc: 'HDFC0000124' })).toMatchObject({ nameMatch: 'partial', status: 'verified' });
    const good = await p.setPayout({ method: 'bank', holder: 'Rahul K Sharma', accountNo: '123456784521', ifsc: 'hdfc0000124' });
    expect(good).toMatchObject({ accountLast4: '4521', ifsc: 'HDFC0000124', nameMatch: 'good' });
    expect(good).not.toHaveProperty('accountNo');
    const t = await p.requestWithdrawal(200, 'bank-1');
    expect(t).toMatchObject({ mode: 'imps', destination: 'A/C ****4521' });
  });
});
