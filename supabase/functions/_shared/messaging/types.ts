/**
 * OneLocal messaging — shared types.
 *
 * Runtime-agnostic (Deno on Supabase Edge Functions, Node 22+ for tests): only web
 * platform APIs (fetch, WebCrypto) and erasable TypeScript syntax.
 */

export type Channel = 'whatsapp' | 'sms' | 'email';
export type ProviderName = 'meta' | 'twilio' | 'msg91' | 'resend' | 'mock';

/**
 * How a phone message is routed:
 *  - whatsapp_then_sms: WhatsApp first; SMS when the number is not on WhatsApp, the send
 *    fails, or WhatsApp does not confirm delivery before the template's fallback deadline.
 *  - whatsapp_and_sms:  both at once (safety alerts).
 *  - sms_only / whatsapp_only / none.
 */
export type ChannelPolicy = 'whatsapp_then_sms' | 'whatsapp_and_sms' | 'sms_only' | 'whatsapp_only' | 'none';
export type EmailPolicy = 'also' | 'never';

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export type TemplateId =
  | 'login_otp'
  | 'delivery_otp'
  | 'order_delivered'
  | 'rider_approved'
  | 'payout_sent'
  | 'weekly_statement'
  | 'sos_alert';

export type FallbackReason =
  | 'no_whatsapp' // WhatsApp says the number has no WhatsApp account
  | 'known_no_whatsapp' // cached from an earlier failure — WhatsApp skipped
  | 'whatsapp_failed' // any other WhatsApp failure
  | 'whatsapp_timeout' // accepted but not delivered before the deadline
  | 'resend_escalated' // a resend shortly after a WhatsApp send goes by SMS
  | 'whatsapp_unavailable'; // no WhatsApp provider / template configured

export interface Recipient {
  /** Indian mobile (10 digits, 0/91/+91 prefixed) or any E.164 number. */
  phone?: string;
  email?: string;
  name?: string;
}

export interface SendRequest {
  template: TemplateId;
  to: Recipient;
  params: Record<string, string>;
  /** Overrides the template's default phone routing. */
  policy?: ChannelPolicy;
  /** Overrides the template's default email behaviour. */
  email?: EmailPolicy;
  /** Same key → same result, nothing is sent twice. */
  idempotencyKey?: string;
  /** What the message is about (job, rider, auth) — for audit, never PII. */
  related?: { type: string; id: string };
}

export interface PhoneOutcome {
  /** Channel that carried the message (null when nothing could be sent). */
  channel: 'whatsapp' | 'sms' | null;
  status: 'sent' | 'failed' | 'skipped';
  fallbackUsed: boolean;
  fallbackReason?: FallbackReason;
  /** WhatsApp accepted; SMS follows automatically if delivery is not confirmed in time. */
  fallbackPending: boolean;
  fallbackDueAt?: string;
  toMasked: string;
  errorCode?: string;
}

export interface EmailOutcome {
  status: 'sent' | 'failed' | 'skipped';
  toMasked: string;
  errorCode?: string;
}

export interface SendResult {
  requestId: string;
  template: TemplateId;
  phone: PhoneOutcome | null;
  email: EmailOutcome | null;
  deduplicated?: boolean;
}

// ── Rendered content handed to providers ────────────────────────────────────

export interface WhatsAppContent {
  kind: 'whatsapp';
  templateName: string;
  language: string;
  bodyParams: string[];
  /** Authentication templates: the code for the copy-code button. */
  otpButtonParam?: string;
  /** Twilio Content API template (HX…) and its numbered variables. */
  twilioContentSid?: string;
  twilioVariables: Record<string, string>;
}

export interface SmsContent {
  kind: 'sms';
  text: string;
  /** MSG91 Flow id (DLT-approved template). */
  msg91FlowId?: string;
  vars: Record<string, string>;
}

export interface EmailContent {
  kind: 'email';
  subject: string;
  text: string;
  html: string;
}

export type RenderedContent = WhatsAppContent | SmsContent | EmailContent;

export interface OutboundMessage {
  /** Our message id (also the provider idempotency key). */
  id: string;
  channel: Channel;
  /** E.164 phone for whatsapp/sms, address for email. */
  to: string;
  template: TemplateId;
  content: RenderedContent;
}

export type ProviderSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; code: string; message: string; notOnWhatsApp?: boolean; retryable?: boolean };

export interface ChannelProvider {
  readonly name: ProviderName;
  readonly channel: Channel;
  send(message: OutboundMessage): Promise<ProviderSendResult>;
}

/** Delivery status reported by a provider webhook. */
export interface StatusUpdate {
  provider: ProviderName;
  providerMessageId: string;
  status: MessageStatus;
  errorCode?: string;
  errorMessage?: string;
  /** True when the error means the number has no WhatsApp account. */
  notOnWhatsApp?: boolean;
}

// ── Persistence ─────────────────────────────────────────────────────────────

export interface MessageRecord {
  id: string;
  /** Groups every record created by one send() call (WhatsApp + its SMS fallback + email). */
  requestId: string;
  idempotencyKey: string | null;
  template: TemplateId;
  channel: Channel;
  provider: ProviderName;
  providerMessageId: string | null;
  /** Peppered SHA-256 of the E.164 number / lower-cased email — lookups without storing it. */
  toHash: string;
  toMasked: string;
  status: MessageStatus;
  errorCode: string | null;
  errorMessage: string | null;
  /** SMS sent because of this WhatsApp record → the SMS record points back here. */
  fallbackOf: string | null;
  fallbackDueAt: string | null;
  fallbackSentAt: string | null;
  fallbackReason: FallbackReason | null;
  /** AES-GCM encrypted {to, params} kept only while an SMS fallback may still be needed. */
  payloadEnc: string | null;
  relatedType: string | null;
  relatedId: string | null;
  /** Result returned to the caller (stored on the first record of a request, for idempotency). */
  result: SendResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppCapability {
  capable: boolean;
  expiresAt: string;
  reason: string | null;
}

export interface MessageStore {
  insert(record: MessageRecord): Promise<void>;
  update(id: string, patch: Partial<MessageRecord>): Promise<void>;
  get(id: string): Promise<MessageRecord | null>;
  findByIdempotencyKey(key: string): Promise<MessageRecord | null>;
  findByProviderMessageId(provider: ProviderName, providerMessageId: string): Promise<MessageRecord | null>;
  /** Records for a template and recipient created at or after `sinceIso` (newest first). */
  listRecent(template: TemplateId, toHash: string, sinceIso: string): Promise<MessageRecord[]>;
  /** Atomically marks the fallback as sent; false when it was already claimed. */
  claimFallback(id: string, atIso: string, reason: FallbackReason): Promise<boolean>;
  /** WhatsApp records past their fallback deadline, not delivered, fallback not yet sent. */
  listDueFallbacks(nowIso: string, limit: number): Promise<MessageRecord[]>;
  getCapability(phoneHash: string): Promise<WhatsAppCapability | null>;
  setCapability(phoneHash: string, capability: WhatsAppCapability): Promise<void>;
}

export type MessagingErrorCode = 'validation' | 'rate_limited' | 'unconfigured' | 'unauthorized';

export class MessagingError extends Error {
  readonly code: MessagingErrorCode;
  readonly status: number;
  constructor(code: MessagingErrorCode, message: string, status = 400) {
    super(message);
    this.name = 'MessagingError';
    this.code = code;
    this.status = status;
  }
}

/** Thrown by a store when a second request reuses an idempotency key concurrently. */
export class DuplicateRequestError extends Error {
  constructor() {
    super('Duplicate idempotency key');
    this.name = 'DuplicateRequestError';
  }
}
