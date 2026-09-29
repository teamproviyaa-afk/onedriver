import { mapCash, mapCashDeposit } from '@/api/mappers';
import { DEMO_CHECKOUT_PREFIX, DEMO_RETURNING_PHONE } from '@/demo/constants';
import { upiDepositProblem } from '@/domain/cash';
import { LocalDemoProvider } from '@/providers/localDemoProvider';

const HUB = { lat: 18.4062, lng: 76.5711, accuracyM: 10 };

const returningRider = async () => {
  const p = new LocalDemoProvider();
  await p.attachPhone(DEMO_RETURNING_PHONE);
  return p;
};

describe('UPI deposit rules', () => {
  const cash = { cashInHand: 2720, upiDeposit: { enabled: true, minAmount: 1, maxAmount: 50000 } };
  it('allows up to the cash in hand, never more', () => {
    expect(upiDepositProblem(2720, cash)).toBeNull();
    expect(upiDepositProblem(500, cash)).toBeNull();
    expect(upiDepositProblem(3000, cash)).toMatch(/can't deposit more/);
    expect(upiDepositProblem(0.5, cash)).toMatch(/minimum deposit is ₹1/);
    expect(upiDepositProblem(Number.NaN, cash)).toMatch(/Enter an amount/);
    expect(upiDepositProblem(100, { ...cash, cashInHand: 0 })).toMatch(/no cash/);
    expect(upiDepositProblem(100, { cashInHand: 100 })).toMatch(/not available/);
    expect(upiDepositProblem(100, { ...cash, upiDeposit: { ...cash.upiDeposit, maxAmount: 50 } })).toMatch(/maximum per UPI deposit is ₹50/);
  });
});

describe('cash API mapping', () => {
  it('maps the cash summary and deposits from snake_case', () => {
    const c = mapCash({
      cash_in_hand: 2720,
      cash_limit: 2000,
      ledger: [{ id: 'l1', kind: 'collected', amount: 320, created_at: '2026-09-29T10:00:00Z', job_id: 'job-1' }],
      deposit_instructions: 'Pay by UPI',
      upi_deposit: { enabled: true, min_amount: 1, max_amount: 50000 },
    });
    expect(c).toMatchObject({ cashInHand: 2720, blocked: true, upiDeposit: { enabled: true, minAmount: 1, maxAmount: 50000 } });
    expect(c.ledger[0]).toEqual({ id: 'l1', kind: 'collected', amount: 320, createdAt: '2026-09-29T10:00:00Z', jobId: 'job-1', note: undefined });
    expect(mapCash({ cash_in_hand: 0, cash_limit: 2000, ledger: [], deposit_instructions: '' }).upiDeposit).toBeUndefined();
    expect(mapCashDeposit({ id: 'd1', amount: 500, status: 'paid', checkout_url: null, reference: '4265', method: 'upi', created_at: 'x', paid_at: 'y' })).toEqual({
      id: 'd1',
      amount: 500,
      status: 'paid',
      checkoutUrl: undefined,
      expiresAt: undefined,
      reference: '4265',
      method: 'upi',
      createdAt: 'x',
      paidAt: 'y',
    });
  });
});

describe('UPI cash deposits (demo server)', () => {
  it('pays the cash in hand by UPI: ledger credited, notification, same key never charges twice', async () => {
    const p = await returningRider();
    const before = await p.getCash();
    expect(before.upiDeposit).toEqual({ enabled: true, minAmount: 1, maxAmount: before.cashInHand });
    expect(before.cashInHand).toBeGreaterThan(0);

    const d = await p.createCashDeposit(before.cashInHand, 'dep-1');
    expect(d).toMatchObject({ status: 'pending', amount: before.cashInHand });
    expect(d.checkoutUrl?.startsWith(DEMO_CHECKOUT_PREFIX)).toBe(true);
    expect(d).not.toHaveProperty('idempotencyKey');
    expect((await p.createCashDeposit(before.cashInHand, 'dep-1')).id).toBe(d.id);

    const paid = await p.completeDemoCheckout(d.id, 'paid');
    expect(paid).toMatchObject({ status: 'paid', method: 'upi' });
    expect(paid.reference).toMatch(/^\d{12}$/);
    expect(paid.checkoutUrl).toBeUndefined();
    expect((await p.getCashDeposit(d.id)).status).toBe('paid');

    const after = await p.getCash();
    expect(after.cashInHand).toBe(0);
    expect(after.ledger[0]).toMatchObject({ kind: 'deposited', amount: before.cashInHand, note: expect.stringContaining('UPI via Cashfree') });
    expect((await p.listNotifications()).items[0]).toMatchObject({ title: 'Cash deposit received', deepLink: '/cash' });
    // A replayed completion changes nothing.
    await p.completeDemoCheckout(d.id, 'paid');
    expect((await p.getCash()).cashInHand).toBe(0);
  });

  it('a cancelled or expired checkout takes nothing', async () => {
    const p = await returningRider();
    const { cashInHand } = await p.getCash();
    const a = await p.createCashDeposit(100, 'a');
    expect((await p.completeDemoCheckout(a.id, 'cancelled')).status).toBe('cancelled');
    expect((await p.getCash()).cashInHand).toBe(cashInHand);

    const b = await p.createCashDeposit(100, 'b');
    const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60_000);
    try {
      const expired = await p.getCashDeposit(b.id);
      expect(expired.status).toBe('expired');
      expect(expired.checkoutUrl).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
    expect((await p.completeDemoCheckout(b.id, 'paid')).status).toBe('expired');
    expect((await p.getCash()).cashInHand).toBe(cashInHand);
  });

  it('refuses more than the cash in hand', async () => {
    const p = await returningRider();
    const { cashInHand } = await p.getCash();
    await expect(p.createCashDeposit(cashInHand + 1, 'x')).rejects.toMatchObject({ code: 'validation' });
    await expect(p.getCashDeposit('nope')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('above the cash limit: a UPI deposit unblocks going online', async () => {
    const p = await returningRider();
    await p.applyScenario('cash_limit');
    const cash = await p.getCash();
    expect(cash.blocked).toBe(true);
    await expect(p.setAvailability({ online: true, ...HUB })).rejects.toMatchObject({ code: 'cash_limit' });
    const d = await p.createCashDeposit(cash.cashInHand, 'unblock');
    await p.completeDemoCheckout(d.id, 'paid');
    expect((await p.getCash()).blocked).toBe(false);
    expect((await p.setAvailability({ online: true, ...HUB })).online).toBe(true);
  });
});
