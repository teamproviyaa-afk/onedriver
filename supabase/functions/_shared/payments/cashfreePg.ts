/**
 * Cashfree Payment Gateway client — Payment Links (API version 2026-01-01).
 * Endpoints, headers and fields follow Cashfree's official Node SDK (cashfree-pg 6.x):
 *   POST /pg/links · GET /pg/links/{link_id} · GET /pg/links/{link_id}/orders
 *   GET /pg/orders/{order_id}/payments · POST /pg/links/{link_id}/cancel
 * Every call is bounded: network errors are returned, never thrown.
 */
import type { FetchLike } from '../messaging/providers/http.ts';
import type { DepositStatus } from './types.ts';

export type PgEnvironment = 'sandbox' | 'production';

export interface CashfreePgConfig {
  environment: PgEnvironment;
  appId: string;
  secretKey: string;
  apiVersion?: string;
  fetch?: FetchLike;
  newId?: () => string;
}

export type PgResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string; message: string; data?: unknown };

export interface PgCreateLinkRequest {
  link_id: string;
  link_amount: number;
  link_currency: 'INR';
  link_purpose: string;
  customer_details: { customer_phone: string; customer_name?: string; customer_email?: string };
  link_partial_payments: false;
  link_expiry_time: string;
  link_notify: { send_sms: boolean; send_email: boolean };
  link_auto_reminders: false;
  link_notes?: Record<string, string>;
  link_meta: { return_url?: string; notify_url?: string; upi_intent?: string; payment_methods?: string };
}

export interface PgLink {
  cf_link_id?: string | number;
  link_id?: string;
  link_status?: string;
  link_amount?: number | string;
  link_amount_paid?: number | string;
  link_url?: string;
  link_expiry_time?: string;
}

export interface PgLinkOrder {
  cf_order_id?: string | number;
  order_id?: string;
  order_status?: string;
  order_amount?: number | string;
}

export interface PgPayment {
  cf_payment_id?: string | number;
  order_id?: string;
  payment_status?: string;
  payment_amount?: number | string;
  payment_group?: string;
  bank_reference?: string;
  payment_time?: string;
  payment_completion_time?: string;
}

export interface CashfreePgClient {
  createLink(req: PgCreateLinkRequest): Promise<PgResult<PgLink>>;
  getLink(linkId: string): Promise<PgResult<PgLink>>;
  getLinkOrders(linkId: string): Promise<PgResult<PgLinkOrder[]>>;
  getOrderPayments(orderId: string): Promise<PgResult<PgPayment[]>>;
  cancelLink(linkId: string): Promise<PgResult<PgLink>>;
}

export const pgBaseUrl = (env: PgEnvironment): string => (env === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg');

/** Which Cashfree environment a PG secret key belongs to ("cfsk_ma_prod_…" / "cfsk_ma_test_…"), when it says. */
export const environmentOfSecretKey = (secretKey: string): PgEnvironment | null => {
  if (/^cfsk_ma_prod_/i.test(secretKey)) return 'production';
  if (/^cfsk_ma_test_/i.test(secretKey)) return 'sandbox';
  return null;
};

export const createCashfreePgClient = (cfg: CashfreePgConfig): CashfreePgClient => {
  const fetchFn: FetchLike = cfg.fetch ?? ((i, init) => fetch(i, init));
  const newId = cfg.newId ?? (() => crypto.randomUUID());
  const base = pgBaseUrl(cfg.environment);

  const call = async <T>(method: 'GET' | 'POST', path: string, body?: unknown, idempotencyKey?: string): Promise<PgResult<T>> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-client-id': cfg.appId,
      'x-client-secret': cfg.secretKey,
      'x-api-version': cfg.apiVersion ?? '2026-01-01',
      'x-request-id': newId(),
    };
    if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;
    let res: Response;
    try {
      res = await fetchFn(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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
  const list = <T>(r: PgResult<unknown>): PgResult<T[]> => (r.ok ? { ...r, data: Array.isArray(r.data) ? (r.data as T[]) : [] } : r);
  const e = encodeURIComponent;

  return {
    createLink: (req) => call<PgLink>('POST', '/links', req, req.link_id),
    getLink: (linkId) => call<PgLink>('GET', `/links/${e(linkId)}`),
    getLinkOrders: async (linkId) => list<PgLinkOrder>(await call<unknown>('GET', `/links/${e(linkId)}/orders`)),
    getOrderPayments: async (orderId) => list<PgPayment>(await call<unknown>('GET', `/orders/${e(orderId)}/payments`)),
    cancelLink: (linkId) => call<PgLink>('POST', `/links/${e(linkId)}/cancel`, {}),
  };
};

/** Cashfree link status → ours. PARTIALLY_PAID cannot happen (partial payments are off) and stays pending. */
export const mapLinkStatus = (s: string | undefined): DepositStatus => {
  switch ((s ?? '').toUpperCase()) {
    case 'PAID':
      return 'paid';
    case 'EXPIRED':
      return 'expired';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'pending';
  }
};

/** Rupees (number or "12.50") → paise. */
export const toPaise = (v: number | string | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Cashfree wants a 10-digit Indian mobile number for the payer. */
export const cashfreePhone = (phone: string): string | null => {
  const digits = phone.replace(/\D/g, '');
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
};
