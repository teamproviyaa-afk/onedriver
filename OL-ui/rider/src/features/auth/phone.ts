import { z } from 'zod';

/** Country dial prefix shown in every phone field (Figma: "+91" / "🇮🇳 +91"). */
export const INDIA_DIAL_CODE = '+91';

/**
 * Strips everything but digits and drops a leading country code / trunk zero so
 * "+91 98765 43210", "0 98765-43210" and "9876543210" all normalise to "9876543210".
 */
export const normalizePhone = (input: string): string => {
  let digits = input.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
};

/** Indian mobile numbers are 10 digits starting with 6–9 (TRAI numbering plan). */
export const isValidIndianMobile = (input: string): boolean => /^[6-9]\d{9}$/.test(normalizePhone(input));

/** "9876543210" → "98765 43210" (the grouping used across the Figma screens). */
export const formatPhoneDisplay = (input: string): string => {
  const d = normalizePhone(input);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)} ${d.slice(5)}`;
};

/** "+91 98765 43210" for headings such as "Sent to +91 98765 43210". */
export const formatPhoneWithCode = (input: string): string => `${INDIA_DIAL_CODE} ${formatPhoneDisplay(input)}`;

export const PHONE_ERROR = 'Enter a valid 10-digit mobile number';

/** Zod schema: accepts any user formatting, outputs the 10-digit normalised number. */
export const phoneSchema = z
  .string()
  .transform((v) => normalizePhone(v))
  .refine((v) => /^[6-9]\d{9}$/.test(v), { message: PHONE_ERROR });

export const fullNameSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, ' '))
  .refine((v) => v.length >= 3, { message: 'Enter your full name' })
  .refine((v) => /^[A-Za-zऀ-ॿಀ-೿ .'-]+$/.test(v), { message: 'Use letters and spaces only' });

export const referralCodeSchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => v.length === 0 || /^[A-Z0-9-]{3,16}$/.test(v), { message: 'Referral codes are 3–16 letters or digits' });

export const registerSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
  referralCode: referralCodeSchema,
  acceptTerms: z.boolean().refine((v) => v, { message: 'Accept the Terms of Service and Privacy Policy to continue' }),
});

export type RegisterFormInput = z.input<typeof registerSchema>;
export type RegisterFormOutput = z.output<typeof registerSchema>;

export const signInSchema = z.object({ phone: phoneSchema });

/** Optional email for statements, payout and approval emails. */
export const optionalEmailSchema = z
  .string()
  .trim()
  .max(254, 'Email is too long')
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), 'Enter a valid email address')
  .transform((v) => v.toLowerCase());

export const profileSchema = z.object({
  fullName: fullNameSchema,
  emergencyPhone: phoneSchema,
  email: optionalEmailSchema,
  language: z.enum(['en', 'hi', 'mr', 'kn']),
});

export type ProfileFormInput = z.input<typeof profileSchema>;
export type ProfileFormOutput = z.output<typeof profileSchema>;
