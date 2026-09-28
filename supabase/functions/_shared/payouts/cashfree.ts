/**
 * Cashfree Payouts (API version 2024-01-01) and Verification (Secure ID) client.
 * Endpoints, headers and fields follow Cashfree's official SDKs (cashfree-payout,
 * cashfree-verification). Every call is bounded: network errors are returned, never thrown.
 */
import { base64ToBytes, bytesToBase64, hmacSha256Base64, safeEqual } from '../messaging/crypto.ts';
import type { FetchLike } from '../messaging/providers/http.ts';

export interface CashfreeCredentials {
  clientId: string;
  clientSecret: string;
  /** Cashfree 2FA public key (PEM). Needed when the caller's IP is not whitelisted — always on Supabase. */
  publicKeyPem?: string;
}

export interface CashfreeConfig {
  environment: 'sandbox' | 'production';
  payout: CashfreeCredentials;
  verification: CashfreeCredentials;
  payoutApiVersion?: string;
  verificationApiVersion?: string;
  /** Bank account verification (penny-less, synchronous). */
  bankVerificationPath?: string;
  /** UPI ID verification. */
  upiVerificationPath?: string;
  fetch?: FetchLike;
  now?: () => number;
  newId?: () => string;
}

export type CfResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string; message: string; data?: unknown };

export interface CfBeneficiaryRequest {
  beneficiary_id: string;
  beneficiary_name: string;
  beneficiary_instrument_details: { bank_account_number?: string; bank_ifsc?: string; vpa?: string };
  beneficiary_contact_details?: { beneficiary_email?: string; beneficiary_phone?: string; beneficiary_country_code?: string };
}

export interface CfBeneficiary {
  beneficiary_id?: string;
  beneficiary_name?: string;
  beneficiary_status?: string;
}

export interface CfTransferRequest {
  transfer_id: string;
  transfer_amount: number;
  transfer_currency: 'INR';
  transfer_mode: 'upi' | 'imps' | 'banktransfer' | 'neft';
  beneficiary_details: { beneficiary_id: string };
  transfer_remarks?: string;
}

export interface CfTransfer {
  transfer_id?: string;
  cf_transfer_id?: string | number;
  status?: string;
  status_code?: string;
  status_description?: string;
  transfer_amount?: number;
  transfer_mode?: string;
  transfer_utr?: string;
  added_on?: string;
  updated_on?: string;
}

export interface CfBankVerification {
  reference_id?: number | string;
  name_at_bank?: string;
  bank_name?: string;
  account_status?: string;
  account_status_code?: string;
  name_match_result?: string;
  name_match_score?: string | number;
}

export interface CfUpiVerification {
  reference_id?: number | string;
  status?: string;
  account_status?: string;
  vpa?: string;
  name_at_bank?: string;
  ifsc?: string;
  name_match_result?: string;
}

export interface CashfreeClient {
  createBeneficiary(req: CfBeneficiaryRequest): Promise<CfResult<CfBeneficiary>>;
  getBeneficiary(beneficiaryId: string): Promise<CfResult<CfBeneficiary>>;
  createTransfer(req: CfTransferRequest): Promise<CfResult<CfTransfer>>;
  getTransfer(transferId: string): Promise<CfResult<CfTransfer>>;
  verifyBankAccount(req: { bank_account: string; ifsc: string; name?: string; phone?: string }): Promise<CfResult<CfBankVerification>>;
  verifyUpi(req: { vpa: string; name?: string }): Promise<CfResult<CfUpiVerification>>;
}

export const cashfreeBaseUrl = (env: CashfreeConfig['environment']): string => (env === 'production' ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com');

/** Accepts a PEM with real or escaped (\n) newlines, or just its base64 body. */
export const pemToDer = (pem: string): Uint8Array<ArrayBuffer> =>
  base64ToBytes(pem.replace(/\\n/g, '\n').replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, ''));

/** x-cf-signature: RSA-OAEP (SHA-1) encryption of "<clientId>.<unix seconds>" with Cashfree's public key. */
export const cashfreeSignature = async (clientId: string, publicKeyPem: string, unixSeconds: number): Promise<string> => {
  const key = await crypto.subtle.importKey('spki', pemToDer(publicKeyPem), { name: 'RSA-OAEP', hash: 'SHA-1' }, false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, new TextEncoder().encode(`${clientId}.${unixSeconds}`));
  return bytesToBase64(new Uint8Array(ct));
};

/** Webhook check: x-webhook-signature = base64(HMAC-SHA256(client secret, x-webhook-timestamp + raw body)). */
export const verifyCashfreeWebhook = async (rawBody: string, signature: string | null, timestamp: string | null, clientSecret: string): Promise<boolean> => {
  if (!signature || !timestamp || !clientSecret) return false;
  return safeEqual(signature, await hmacSha256Base64(clientSecret, timestamp + rawBody));
};

export const createCashfreeClient = (cfg: CashfreeConfig): CashfreeClient => {
  const fetchFn: FetchLike = cfg.fetch ?? ((i, init) => fetch(i, init));
  const now = cfg.now ?? (() => Date.now());
  const newId = cfg.newId ?? (() => crypto.randomUUID());
  const base = cashfreeBaseUrl(cfg.environment);

  const call = async <T>(product: 'payout' | 'verification', method: 'GET' | 'POST', path: string, body?: unknown, query?: Record<string, string>): Promise<CfResult<T>> => {
    const creds = product === 'payout' ? cfg.payout : cfg.verification;
    const version = product === 'payout' ? (cfg.payoutApiVersion ?? '2024-01-01') : (cfg.verificationApiVersion ?? '2023-12-18');
    const url = `${base}/${product}${path}${query ? `?${new URLSearchParams(query).toString()}` : ''}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-client-id': creds.clientId,
      'x-client-secret': creds.clientSecret,
      'x-api-version': version,
      'x-request-id': newId(),
    };
    let res: Response;
    try {
      if (creds.publicKeyPem) headers['x-cf-signature'] = await cashfreeSignature(creds.clientId, creds.publicKeyPem, Math.floor(now() / 1000));
      res = await fetchFn(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      return { ok: false, status: 0, code: 'network', message: e instanceof Error ? e.message : String(e) };
    }
    let json: unknown = {};
    try {
      json = await res.json();
    } catch {
      json = {};
    }
    if (res.ok) return { ok: true, status: res.status, data: json as T };
    const err = (json ?? {}) as { code?: string; type?: string; message?: string };
    return { ok: false, status: res.status, code: String(err.code ?? err.type ?? `http_${res.status}`), message: String(err.message ?? `HTTP ${res.status}`).slice(0, 300), data: json };
  };

  return {
    createBeneficiary: (req) => call<CfBeneficiary>('payout', 'POST', '/beneficiary', req),
    getBeneficiary: (id) => call<CfBeneficiary>('payout', 'GET', '/beneficiary', undefined, { beneficiary_id: id }),
    createTransfer: (req) => call<CfTransfer>('payout', 'POST', '/transfers', req),
    getTransfer: (transferId) => call<CfTransfer>('payout', 'GET', '/transfers', undefined, { transfer_id: transferId }),
    verifyBankAccount: (req) => call<CfBankVerification>('verification', 'POST', cfg.bankVerificationPath ?? '/bank-account/sync', req),
    verifyUpi: (req) => call<CfUpiVerification>('verification', 'POST', cfg.upiVerificationPath ?? '/upi/advance', req),
  };
};

/** Cashfree transfer status → ours. Anything not final stays "processing". */
export const mapTransferStatus = (s: string | undefined): 'processing' | 'success' | 'failed' | 'reversed' => {
  switch ((s ?? '').toUpperCase()) {
    case 'SUCCESS':
    case 'COMPLETED':
      return 'success';
    case 'FAILED':
    case 'REJECTED':
    case 'MANUALLY_REJECTED':
      return 'failed';
    case 'REVERSED':
      return 'reversed';
    default:
      return 'processing';
  }
};

/** Webhook event type → Cashfree status, for payloads that omit data.status. */
export const statusFromEventType = (type: string | undefined): string | undefined => {
  const t = (type ?? '').toUpperCase();
  if (t === 'TRANSFER_SUCCESS') return 'SUCCESS';
  if (t === 'TRANSFER_FAILED') return 'FAILED';
  if (t === 'TRANSFER_REVERSED') return 'REVERSED';
  if (t === 'TRANSFER_REJECTED') return 'REJECTED';
  return undefined;
};
