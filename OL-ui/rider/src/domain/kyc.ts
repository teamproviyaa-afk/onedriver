/**
 * KYC input rules (Cashfree Secure ID checks run on the server — supabase/functions/_shared/kyc).
 * The app only normalises what the rider types and gives a friendly message before sending it.
 */

export const normalizePan = (v: string): string => v.replace(/\s/g, '').toUpperCase();
export const isValidPan = (v: string): boolean => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizePan(v));
/** ABCDE1234F → ABXXXXX34F (same as the server). */
export const maskPan = (pan: string): string => {
  const p = normalizePan(pan);
  return `${p.slice(0, 2)}XXXXX${p.slice(-3)}`;
};

/** "12-03-1994" / "12/03/1994" → "1994-03-12"; null when it is not a real past date. */
export const parseDob = (v: string, today: Date = new Date()): string | null => {
  const m = v.trim().match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d) || date.getTime() >= today.getTime()) return null;
  return `${y}-${mo}-${d}`;
};

/** Local demo values that exercise the refusal paths (DATA_MODE=local_demo). */
export const DEMO_KYC_TEST_VALUES = {
  /** PAN that is not valid. */
  invalidPan: 'AAAAA0000A',
  /** PANs starting with this belong to someone else. */
  otherPersonPanPrefix: 'ZZZZZ',
  /** Licence / vehicle numbers ending with this are not found. */
  notFoundSuffix: '0000',
  otherPersonName: 'SURESH PATIL',
} as const;
