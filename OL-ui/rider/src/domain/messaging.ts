import type { MessageChannel, MessageFallbackReason, MessageReceipt } from '@/types';

/** Mirrors the server rules in supabase/functions/_shared/messaging (templates.ts / orchestrator.ts). */
export const MESSAGING = {
  /** Minimum gap between two resends of the same code. */
  resendCooldownSeconds: 30,
  /** A resend within this window of a WhatsApp send goes by SMS ("didn't get it"). */
  resendEscalationSeconds: 300,
  /** WhatsApp accepted but not delivered within this many seconds → SMS (OTPs). */
  otpFallbackSeconds: 30,
  /** Per-number OTP limit. */
  otpMaxPerWindow: 5,
  otpWindowSeconds: 900,
} as const;

/** Demo numbers with no WhatsApp account — they show the SMS fallback (DATA_MODE=local_demo). */
export const DEMO_NO_WHATSAPP_PHONES: readonly string[] = ['9000000001', '9000000002'];

export const demoHasWhatsApp = (phone: string | undefined | null): boolean => {
  const digits = (phone ?? '').replace(/\D/g, '').slice(-10);
  return digits.length === 10 && !DEMO_NO_WHATSAPP_PHONES.includes(digits);
};

export type MessagePolicy = 'whatsapp_then_sms' | 'whatsapp_and_sms' | 'sms_only' | 'email';

export interface RouteInput {
  policy: MessagePolicy;
  hasWhatsApp: boolean;
  /** An earlier send to this number already failed as "not on WhatsApp". */
  knownNoWhatsApp?: boolean;
  /** A WhatsApp send of the same message went out within the escalation window. */
  recentWhatsAppSend?: boolean;
}

export interface RouteDecision {
  /** Channels that deliver the message. */
  channels: MessageChannel[];
  primary: MessageChannel;
  fallbackUsed: boolean;
  fallbackReason?: MessageFallbackReason;
}

/** WhatsApp first; SMS when the number is not on WhatsApp or the code is requested again. */
export const routeMessage = (i: RouteInput): RouteDecision => {
  if (i.policy === 'email') return { channels: ['email'], primary: 'email', fallbackUsed: false };
  if (i.policy === 'sms_only') return { channels: ['sms'], primary: 'sms', fallbackUsed: false };
  if (i.policy === 'whatsapp_and_sms') return i.hasWhatsApp ? { channels: ['whatsapp', 'sms'], primary: 'whatsapp', fallbackUsed: false } : { channels: ['sms'], primary: 'sms', fallbackUsed: false };
  if (i.knownNoWhatsApp) return { channels: ['sms'], primary: 'sms', fallbackUsed: true, fallbackReason: 'known_no_whatsapp' };
  if (i.recentWhatsAppSend) return { channels: ['sms'], primary: 'sms', fallbackUsed: true, fallbackReason: 'resend_escalated' };
  if (!i.hasWhatsApp) return { channels: ['sms'], primary: 'sms', fallbackUsed: true, fallbackReason: 'no_whatsapp' };
  return { channels: ['whatsapp'], primary: 'whatsapp', fallbackUsed: false };
};

/** Rider-facing phrase: "on WhatsApp", "by SMS (not on WhatsApp)", "by email". */
export const describeDelivery = (r: Pick<MessageReceipt, 'channel' | 'status' | 'fallbackReason'>): string => {
  if (r.status !== 'sent' || !r.channel) return 'could not be sent';
  if (r.channel === 'whatsapp') return 'on WhatsApp';
  if (r.channel === 'email') return 'by email';
  switch (r.fallbackReason) {
    case 'no_whatsapp':
    case 'known_no_whatsapp':
      return 'by SMS (not on WhatsApp)';
    case 'whatsapp_failed':
    case 'whatsapp_timeout':
      return "by SMS (WhatsApp didn't go through)";
    default:
      return 'by SMS';
  }
};

/** "+91 ******3210" / "r***@gmail.com" */
export const maskPhoneForDisplay = (phone: string): string => {
  const d = phone.replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `+91 ******${d.slice(-4)}` : '******';
};

export const maskEmailForDisplay = (email: string): string => {
  const [user, domain] = email.split('@');
  return `${(user ?? '').slice(0, 1)}***@${domain ?? ''}`;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normalizeEmail = (v: string | undefined | null): string | null => {
  const e = (v ?? '').trim().toLowerCase();
  return e && EMAIL_RE.test(e) && e.length <= 254 ? e : null;
};
