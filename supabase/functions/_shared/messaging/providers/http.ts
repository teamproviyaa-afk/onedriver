/** Small fetch wrapper shared by the provider adapters. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpResult {
  status: number;
  ok: boolean;
  json: Record<string, unknown>;
}

export const postJson = async (fetchFn: FetchLike, url: string, headers: Record<string, string>, body: unknown): Promise<HttpResult> => {
  const res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, ok: res.ok, json: await readJson(res) };
};

export const postForm = async (fetchFn: FetchLike, url: string, headers: Record<string, string>, form: URLSearchParams): Promise<HttpResult> => {
  const res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...headers }, body: form.toString() });
  return { status: res.status, ok: res.ok, json: await readJson(res) };
};

const readJson = async (res: Response): Promise<Record<string, unknown>> => {
  try {
    const v = (await res.json()) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

export const networkFailure = (e: unknown) => ({ ok: false as const, code: 'network', message: e instanceof Error ? e.message : String(e), retryable: true });

export const truncate = (s: string, n = 300): string => (s.length > n ? `${s.slice(0, n)}…` : s);
