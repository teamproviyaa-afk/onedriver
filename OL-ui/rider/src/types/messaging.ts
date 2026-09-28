import type { IsoDate } from './common';

/**
 * Messaging (WhatsApp → SMS fallback, email). The server sends every message — the app only
 * asks for one and shows the outcome. See supabase/functions/_shared/messaging.
 */
export type MessageChannel = 'whatsapp' | 'sms' | 'email';

export type MessageFallbackReason =
  | 'no_whatsapp'
  | 'known_no_whatsapp'
  | 'whatsapp_failed'
  | 'whatsapp_timeout'
  | 'resend_escalated'
  | 'whatsapp_unavailable';

export type MessageAudience = 'rider' | 'customer' | 'emergency_contact';

/** Outcome of a message the server sent on the rider's behalf. Never contains a customer's number. */
export interface MessageReceipt {
  channel: MessageChannel | null;
  status: 'sent' | 'failed' | 'skipped';
  fallbackUsed: boolean;
  fallbackReason?: MessageFallbackReason;
  /** WhatsApp accepted it; the server sends an SMS automatically if delivery is not confirmed in time. */
  fallbackPending: boolean;
  /** Masked destination — only for the rider's own number or email (e.g. "r***@gmail.com"). */
  toMasked?: string;
  sentAt: IsoDate;
  /** Seconds before the next resend is allowed. */
  resendAfterSeconds?: number;
}

/** How the sign-in code was sent. "unknown" when the server's auth hook picks the channel. */
export interface OtpDelivery {
  channel: 'whatsapp' | 'sms' | 'unknown';
  fallbackReason?: MessageFallbackReason;
}

export interface SosResult {
  /** Alert to the rider's emergency contact (WhatsApp and SMS together); null when none is on file. */
  contactAlert: MessageReceipt | null;
}

/** DATA_MODE=local_demo only: what the simulated server "sent", shown on the dev screen. */
export interface DemoOutboxMessage {
  id: string;
  template: 'login_otp' | 'delivery_otp' | 'order_delivered' | 'rider_approved' | 'weekly_statement' | 'sos_alert';
  audience: MessageAudience;
  channel: MessageChannel;
  fallbackUsed: boolean;
  fallbackReason?: MessageFallbackReason;
  toMasked: string;
  summary: string;
  at: IsoDate;
}
