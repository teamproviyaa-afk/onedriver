/** Phone / email normalisation and masking. Logs and the database only ever see masked values. */

/** Returns E.164 (+91XXXXXXXXXX for Indian mobiles) or null when the number is not valid. */
export const normalizePhone = (input: string | undefined | null): string | null => {
  if (!input) return null;
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  // Indian mobile: 10 digits starting 6-9, optionally prefixed with 0, 91 or +91.
  const indian = digits.length === 10 ? digits : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : null;
  if (indian && /^[6-9]\d{9}$/.test(indian)) return `+91${indian}`;
  // Any other international number must be given with a leading +.
  if (trimmed.startsWith('+') && digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0')) return `+${digits}`;
  return null;
};

/** "+919876543210" → "+91 ******3210" */
export const maskPhone = (e164: string): string => {
  const digits = e164.replace(/\D/g, '');
  const cc = digits.startsWith('91') && digits.length === 12 ? '91' : digits.slice(0, Math.max(1, digits.length - 10));
  const last4 = digits.slice(-4);
  return `+${cc} ${'*'.repeat(Math.max(0, digits.length - cc.length - 4))}${last4}`;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizeEmail = (input: string | undefined | null): string | null => {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  return EMAIL_RE.test(v) && v.length <= 254 ? v : null;
};

/** "rahul.sharma@gmail.com" → "r***@gmail.com" */
export const maskEmail = (email: string): string => {
  const [user, domain] = email.split('@');
  return `${(user ?? '').slice(0, 1)}***@${domain ?? ''}`;
};

/** Meta Cloud API wants digits only, no leading +. */
export const toWaId = (e164: string): string => e164.replace(/\D/g, '');
