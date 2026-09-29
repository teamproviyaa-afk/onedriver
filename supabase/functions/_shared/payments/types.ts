/**
 * OneLocal cash deposits (Cashfree Payment Gateway) — shared types. Runtime-agnostic: fetch +
 * WebCrypto only, erasable TypeScript (Deno on Supabase Edge Functions, Node 22+ for tests).
 *
 * A rider who collected cash on delivery (COD) pays it back to OneLocal through a Cashfree payment
 * link (UPI by default). Money is handled in paise (integers) everywhere.
 */

/**
 * pending   — link created, waiting for the rider to pay
 * paid      — Cashfree confirmed the full amount (the One Local server credits the cash ledger)
 * expired / cancelled — nothing was paid; the rider can start a new deposit
 * failed    — the link could not be created
 */
export type DepositStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed';

export const TERMINAL_DEPOSIT_STATUSES: readonly DepositStatus[] = ['paid', 'expired', 'cancelled', 'failed'];

export interface CreateDepositInput {
  riderId: string;
  /** Rupees, at most 2 decimals. */
  amount: number;
  /** Required. The same key always maps to the same Cashfree payment link — a retry never charges twice. */
  idempotencyKey: string;
  /** The rider (Cashfree requires a phone for the payer). */
  customer: { phone: string; name?: string; email?: string };
}

export interface DepositRecord {
  id: string;
  /** Our Cashfree link_id (deterministic from rider + idempotency key). */
  linkId: string;
  riderId: string;
  amountPaise: number;
  amountPaidPaise: number;
  status: DepositStatus;
  cfLinkId: string | null;
  linkUrl: string | null;
  expiresAt: string | null;
  cfOrderId: string | null;
  cfPaymentId: string | null;
  /** UTR / bank reference of the successful payment. */
  bankReference: string | null;
  /** upi, credit_card, net_banking … */
  paymentGroup: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
}

/** What the One Local server gets back (and passes to the app). */
export interface DepositView {
  id: string;
  riderId: string;
  amount: number;
  amountPaid: number;
  status: DepositStatus;
  /** Cashfree checkout page — only while the deposit can still be paid. */
  checkoutUrl: string | null;
  expiresAt: string | null;
  reference: string | null;
  method: string | null;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface DepositStore {
  /** Throws DuplicateDepositError when the link id already exists. */
  insertDeposit(record: DepositRecord): Promise<void>;
  updateDeposit(id: string, patch: Partial<DepositRecord>): Promise<void>;
  getDeposit(id: string): Promise<DepositRecord | null>;
  getDepositByLinkId(linkId: string): Promise<DepositRecord | null>;
  /** Pending deposits last updated before `beforeIso`. */
  listPendingDeposits(beforeIso: string, limit: number): Promise<DepositRecord[]>;
  listDeposits(riderId: string, limit: number): Promise<DepositRecord[]>;
}

export type PaymentErrorCode = 'validation' | 'provider_error' | 'unauthorized' | 'unconfigured' | 'not_found';

export class PaymentError extends Error {
  readonly code: PaymentErrorCode;
  readonly status: number;
  readonly meta?: Record<string, unknown>;
  constructor(code: PaymentErrorCode, message: string, status = 400, meta?: Record<string, unknown>) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.status = status;
    this.meta = meta;
  }
}

export class DuplicateDepositError extends Error {
  constructor() {
    super('Deposit with this link id already exists');
    this.name = 'DuplicateDepositError';
  }
}
