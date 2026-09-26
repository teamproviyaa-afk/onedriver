import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

import { ApiError, type ApiErrorCode } from '@/types';
import { appMeta } from '@/config/env';

export interface HttpClientOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

const KNOWN_CODES: ApiErrorCode[] = [
  'not_enrolled',
  'suspended',
  'cash_limit',
  'offer_expired',
  'already_taken',
  'version_conflict',
  'too_far',
  'otp_invalid',
  'otp_locked',
  'out_of_zone',
  'coming_soon',
  'not_found',
  'unauthorized',
  'validation',
];

const runtime = (): string => {
  const hermes = typeof (globalThis as { HermesInternal?: unknown }).HermesInternal !== 'undefined';
  const expoGo = Constants.appOwnership === 'expo';
  return `${expoGo ? 'expo-go' : 'native'}/${hermes ? 'hermes' : 'jsc'}`;
};

/**
 * Minimal fetch wrapper implementing the One Local API contract (spec §5):
 * bearer token, x-app / x-app-version / x-runtime / x-platform headers,
 * idempotency-key on state-changing POSTs and `{ detail, code }` errors.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly timeoutMs: number;

  constructor(opts: HttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.getAccessToken = opts.getAccessToken;
    this.timeoutMs = opts.timeoutMs ?? 15000;
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-app': appMeta.appHeader,
      'x-app-version': Application.nativeApplicationVersion ?? appMeta.version,
      'x-runtime': runtime(),
      'x-platform': Platform.OS,
      ...(opts.headers ?? {}),
    };
    if (token) headers.authorization = `Bearer ${token}`;
    if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      throw new ApiError({ code: 'network', detail: e instanceof Error ? e.message : 'Network request failed' });
    }
    clearTimeout(timer);

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const code = (json && typeof json === 'object' && (json as { code?: string }).code) || undefined;
      const detailRaw = json && typeof json === 'object' ? (json as { detail?: unknown }).detail : undefined;
      const detail = typeof detailRaw === 'string' ? detailRaw : res.statusText || 'Request failed';
      throw new ApiError({
        code: KNOWN_CODES.includes(code as ApiErrorCode) ? (code as ApiErrorCode) : res.status === 401 ? 'unauthorized' : res.status === 404 ? 'not_found' : 'unknown',
        detail,
        status: res.status,
        meta: json && typeof json === 'object' ? (json as Record<string, unknown>) : undefined,
      });
    }
    return json as T;
  }

  get<T>(path: string, query?: RequestOptions['query']): Promise<T> {
    return this.request<T>(path, { method: 'GET', query });
  }
  post<T>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: body ?? {}, idempotencyKey });
  }
  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: body ?? {} });
  }
}

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};
