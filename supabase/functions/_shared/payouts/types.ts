/**
 * OneLocal payouts (Cashfree) — shared types. Runtime-agnostic: fetch + WebCrypto only,
 * erasable TypeScript (Deno on Supabase Edge Functions, Node 22+ for tests).
 *
 * Money is handled in paise (integers) everywhere and converted to rupees only at the
 * Cashfree boundary, so no floating-point rounding can change an amount.
 */

export type AccountMethod = 'bank' | 'upi';
export type NameMatch = 'good' | 'partial' | 'poor';
export type PayoutKind = 'instant' | 'weekly';
export type TransferMode = 'upi' | 'imps';
/** unknown = the request may or may not have reached Cashfree; resolved by reconciliation, never re-sent. */
export type PayoutStatus = 'processing' | 'unknown' | 'success' | 'failed' | 'reversed';

export const TERMINAL_STATUSES: readonly PayoutStatus[] = ['success', 'failed', 'reversed'];

export interface VerifyAccountInput {
  riderId: string;
  /** Rider's legal name (as in Aadhaar) — compared with the name registered at the bank. */
  riderName: string;
  phone?: string;
  email?: string;
  method: AccountMethod;
  accountNumber?: string;
  ifsc?: string;
  vpa?: string;
}

export interface PayoutAccount {
  id: string;
  riderId: string;
  method: AccountMethod;
  /** Cashfree beneficiary id. */
  beneficiaryId: string;
  accountLast4: string | null;
  ifsc: string | null;
  vpaMasked: string | null;
  bankName: string | null;
  nameAtBank: string;
  nameMatch: NameMatch;
  status: 'verified' | 'rejected';
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePayoutInput {
  riderId: string;
  /** Rupees, at most 2 decimals. */
  amount: number;
  kind: PayoutKind;
  /** Required. The same key always maps to the same Cashfree transfer — a retry can never pay twice. */
  idempotencyKey: string;
  /** e.g. "21-27 Sep" for weekly payouts (used in the payout_sent message). */
  periodLabel?: string;
  /** Who to tell when the money arrives (kept encrypted, deleted once used). */
  contact?: { name: string; phone?: string; email?: string };
}

export interface PayoutRecord {
  id: string;
  transferId: string;
  riderId: string;
  accountId: string;
  amountPaise: number;
  mode: TransferMode;
  kind: PayoutKind;
  status: PayoutStatus;
  cfTransferId: string | null;
  utr: string | null;
  statusCode: string | null;
  statusDescription: string | null;
  destinationMasked: string;
  periodLabel: string | null;
  contactEnc: string | null;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

/** What callers (the One Local server) get back — no account numbers, no contact data. */
export interface PayoutView {
  id: string;
  transferId: string;
  riderId: string;
  amount: number;
  kind: PayoutKind;
  mode: TransferMode;
  status: PayoutStatus;
  utr: string | null;
  statusDescription: string | null;
  destination: string;
  createdAt: string;
  completedAt: string | null;
}

export interface AccountView {
  id: string;
  riderId: string;
  method: AccountMethod;
  accountLast4: string | null;
  ifsc: string | null;
  vpa: string | null;
  bankName: string | null;
  verifiedName: string;
  nameMatch: NameMatch;
  status: 'verified';
  provider: 'cashfree';
}

export interface PayoutStore {
  upsertAccount(account: PayoutAccount): Promise<PayoutAccount>;
  /** Makes this account the rider's only primary account. */
  setPrimary(riderId: string, accountId: string): Promise<void>;
  getAccount(id: string): Promise<PayoutAccount | null>;
  getPrimaryAccount(riderId: string): Promise<PayoutAccount | null>;
  /** Throws DuplicatePayoutError when the transfer id already exists. */
  insertPayout(record: PayoutRecord): Promise<void>;
  updatePayout(id: string, patch: Partial<PayoutRecord>): Promise<void>;
  getPayoutByTransferId(transferId: string): Promise<PayoutRecord | null>;
  /** Non-terminal payouts last updated before `beforeIso`. */
  listPendingPayouts(beforeIso: string, limit: number): Promise<PayoutRecord[]>;
  listPayouts(riderId: string, limit: number): Promise<PayoutRecord[]>;
}

export type PayoutErrorCode =
  | 'validation'
  | 'account_invalid'
  | 'name_mismatch'
  | 'no_payout_account'
  | 'provider_error'
  | 'unauthorized'
  | 'unconfigured'
  | 'not_found';

export class PayoutError extends Error {
  readonly code: PayoutErrorCode;
  readonly status: number;
  readonly meta?: Record<string, unknown>;
  constructor(code: PayoutErrorCode, message: string, status = 400, meta?: Record<string, unknown>) {
    super(message);
    this.name = 'PayoutError';
    this.code = code;
    this.status = status;
    this.meta = meta;
  }
}

export class DuplicatePayoutError extends Error {
  constructor() {
    super('Payout with this transfer id already exists');
    this.name = 'DuplicatePayoutError';
  }
}
