/**
 * Messaging orchestrator: WhatsApp first, SMS when WhatsApp is not available on the number.
 *
 * When SMS is used instead of (or after) WhatsApp — policy "whatsapp_then_sms":
 *   1. known_no_whatsapp  – the number failed as "not on WhatsApp" within the last 30 days
 *   2. no_whatsapp        – WhatsApp rejects the send because the number has no account
 *   3. whatsapp_failed    – any other WhatsApp send failure
 *   4. (async) a delivery webhook reports the WhatsApp message failed
 *   5. whatsapp_timeout   – WhatsApp accepted it but did not confirm delivery before the
 *                           template deadline (sweep(), run every minute)
 *   6. resend_escalated   – the same code is requested again shortly after a WhatsApp send
 *   7. whatsapp_unavailable – no WhatsApp provider/template configured
 * The fallback SMS is claimed atomically, so webhook + sweep can never send it twice.
 */
import type {
  Channel,
  ChannelProvider,
  EmailOutcome,
  FallbackReason,
  MessageRecord,
  MessageStatus,
  MessageStore,
  OutboundMessage,
  PhoneOutcome,
  ProviderSendResult,
  RenderedContent,
  SendRequest,
  SendResult,
  StatusUpdate,
  TemplateId,
} from './types.ts';
import { DuplicateRequestError, MessagingError } from './types.ts';
import { type ContentConfig, TEMPLATES, isTemplateId, renderEmail, renderSms, renderWhatsApp, validateParams } from './templates.ts';
import { maskEmail, maskPhone, normalizeEmail, normalizePhone } from './phone.ts';
import { decryptJson, encryptJson, hashIdentifier } from './crypto.ts';
import { truncate } from './providers/http.ts';

export const CAPABILITY_TTL_SECONDS = 30 * 24 * 3600;

export interface MessengerDeps {
  store: MessageStore;
  whatsapp?: ChannelProvider;
  sms?: ChannelProvider;
  email?: ChannelProvider;
  /** Secret pepper for recipient hashes. */
  hashPepper: string;
  /** base64 32-byte key encrypting the payload kept for a pending SMS fallback. */
  payloadKey: string;
  content: ContentConfig;
  now?: () => Date;
  newId?: () => string;
  /** Structured, PII-free events (ids, template, channel, provider, codes). */
  log?: (event: string, data: Record<string, unknown>) => void;
}

export interface Messenger {
  send(request: SendRequest): Promise<SendResult>;
  handleStatus(update: StatusUpdate): Promise<'updated' | 'ignored' | 'unknown'>;
  sweep(limit?: number): Promise<{ due: number; fallbacksSent: number }>;
}

interface FallbackPayload {
  to: string;
  params: Record<string, string>;
}

const STATUS_RANK: Record<MessageStatus, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

export const createMessenger = (deps: MessengerDeps): Messenger => {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const log = deps.log ?? (() => {});
  const iso = () => now().toISOString();
  const inSeconds = (s: number) => new Date(now().getTime() + s * 1000).toISOString();
  const agoSeconds = (s: number) => new Date(now().getTime() - s * 1000).toISOString();

  const record = (over: Partial<MessageRecord> & Pick<MessageRecord, 'requestId' | 'template' | 'channel' | 'provider' | 'toHash' | 'toMasked'>): MessageRecord => ({
    id: newId(),
    idempotencyKey: null,
    providerMessageId: null,
    status: 'queued',
    errorCode: null,
    errorMessage: null,
    fallbackOf: null,
    fallbackDueAt: null,
    fallbackSentAt: null,
    fallbackReason: null,
    payloadEnc: null,
    relatedType: null,
    relatedId: null,
    result: null,
    createdAt: iso(),
    updatedAt: iso(),
    ...over,
  });

  /** Persists the record, calls the provider, stores the outcome. */
  const dispatch = async (provider: ChannelProvider, rec: MessageRecord, to: string, content: RenderedContent): Promise<ProviderSendResult> => {
    await store.insert(rec);
    const message: OutboundMessage = { id: rec.id, channel: rec.channel, to, template: rec.template, content };
    let res: ProviderSendResult;
    try {
      res = await provider.send(message);
    } catch (e) {
      res = { ok: false, code: 'provider_error', message: e instanceof Error ? e.message : String(e), retryable: true };
    }
    if (res.ok) {
      await store.update(rec.id, { status: 'sent', providerMessageId: res.providerMessageId, updatedAt: iso() });
      log('message.sent', { id: rec.id, requestId: rec.requestId, template: rec.template, channel: rec.channel, provider: provider.name, fallbackOf: rec.fallbackOf });
    } else {
      await store.update(rec.id, { status: 'failed', errorCode: res.code, errorMessage: truncate(res.message), updatedAt: iso() });
      log('message.failed', { id: rec.id, requestId: rec.requestId, template: rec.template, channel: rec.channel, provider: provider.name, code: res.code });
    }
    return res;
  };

  const markNoWhatsApp = async (toHash: string, reason: string) => {
    await store.setCapability(toHash, { capable: false, expiresAt: inSeconds(CAPABILITY_TTL_SECONDS), reason });
  };

  /** Sends the SMS for a WhatsApp record once (atomic claim). */
  const triggerFallback = async (rec: MessageRecord, reason: FallbackReason): Promise<boolean> => {
    if (!deps.sms || !rec.payloadEnc || rec.fallbackSentAt) return false;
    const claimed = await store.claimFallback(rec.id, iso(), reason);
    if (!claimed) return false;
    let payload: FallbackPayload;
    try {
      payload = await decryptJson<FallbackPayload>(deps.payloadKey, rec.payloadEnc);
    } catch (e) {
      log('fallback.decrypt_failed', { id: rec.id, error: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      await store.update(rec.id, { payloadEnc: null, updatedAt: iso() });
    }
    const content = renderSms(rec.template, payload.params, deps.content);
    if (!content) return false;
    const sms = record({
      requestId: rec.requestId,
      template: rec.template,
      channel: 'sms',
      provider: deps.sms.name,
      toHash: rec.toHash,
      toMasked: rec.toMasked,
      fallbackOf: rec.id,
      fallbackReason: reason,
      relatedType: rec.relatedType,
      relatedId: rec.relatedId,
    });
    const res = await dispatch(deps.sms, sms, payload.to, content);
    log('fallback.sms', { id: sms.id, of: rec.id, template: rec.template, reason, ok: res.ok });
    return true;
  };

  const send = async (request: SendRequest): Promise<SendResult> => {
    try {
      return await sendOnce(request);
    } catch (e) {
      // Two concurrent calls with the same idempotency key: the loser returns the winner's result.
      if (e instanceof DuplicateRequestError && request.idempotencyKey) {
        const previous = await store.findByIdempotencyKey(request.idempotencyKey);
        if (previous) return previous.result ? { ...previous.result, deduplicated: true } : { requestId: previous.requestId, template: request.template, phone: null, email: null, deduplicated: true };
      }
      throw e;
    }
  };

  const sendOnce = async (request: SendRequest): Promise<SendResult> => {
    if (!request || !isTemplateId(request.template)) throw new MessagingError('validation', 'Unknown template');
    const template: TemplateId = request.template;
    const def = TEMPLATES[template];
    const params = validateParams(template, (request.params ?? {}) as Record<string, unknown>);

    if (request.idempotencyKey) {
      const previous = await store.findByIdempotencyKey(request.idempotencyKey);
      if (previous) return previous.result ? { ...previous.result, deduplicated: true } : { requestId: previous.requestId, template, phone: null, email: null, deduplicated: true };
    }

    const policy = request.policy ?? def.policy;
    const emailPolicy = request.email ?? def.email;
    const phone = normalizePhone(request.to?.phone);
    const email = normalizeEmail(request.to?.email);
    if (request.to?.phone && !phone) throw new MessagingError('validation', 'Invalid phone number');
    if (request.to?.email && !email) throw new MessagingError('validation', 'Invalid email address');
    const wantsPhone = policy !== 'none' && !!phone && (!!def.whatsapp || !!def.sms);
    const wantsEmail = emailPolicy === 'also' && !!email && !!def.emailContent;
    if (!wantsPhone && !wantsEmail) throw new MessagingError('validation', `No recipient for template ${template}`);

    const requestId = newId();
    const related = { relatedType: request.related?.type ?? null, relatedId: request.related?.id ?? null };
    let first: MessageRecord | null = null;
    /** The first record of a request carries the idempotency key (unique) and the result. */
    const claimFirst = (rec: MessageRecord): MessageRecord => {
      if (!first) {
        rec.idempotencyKey = request.idempotencyKey ?? null;
        first = rec;
      }
      return rec;
    };

    let phoneOutcome: PhoneOutcome | null = null;
    if (wantsPhone && phone) {
      const toHash = await hashIdentifier(deps.hashPepper, phone);
      const toMasked = maskPhone(phone);

      if (def.rateLimit) {
        const recent = await store.listRecent(template, toHash, agoSeconds(def.rateLimit.windowSeconds));
        if (new Set(recent.map((r) => r.requestId)).size >= def.rateLimit.max) {
          throw new MessagingError('rate_limited', 'Too many messages to this number. Try again later.', 429);
        }
      }

      const waContent = renderWhatsApp(template, params, deps.content);
      const smsContent = renderSms(template, params, deps.content);
      const smsAvailable = !!deps.sms && !!smsContent;
      const policyUsesWhatsApp = policy === 'whatsapp_then_sms' || policy === 'whatsapp_only' || policy === 'whatsapp_and_sms';
      let useWhatsApp = policyUsesWhatsApp && !!deps.whatsapp && !!waContent;
      let reason: FallbackReason | undefined = policyUsesWhatsApp && !useWhatsApp ? 'whatsapp_unavailable' : undefined;

      if (useWhatsApp && policy === 'whatsapp_then_sms') {
        const cap = await store.getCapability(toHash);
        if (cap && !cap.capable && cap.expiresAt > iso()) {
          useWhatsApp = false;
          reason = 'known_no_whatsapp';
        } else if (def.escalateResendWithinSeconds) {
          const recent = await store.listRecent(template, toHash, agoSeconds(def.escalateResendWithinSeconds));
          if (recent.some((r) => r.channel === 'whatsapp' || r.fallbackOf !== null || r.fallbackReason !== null)) {
            useWhatsApp = false;
            reason = 'resend_escalated';
          }
        }
      }

      let waResult: ProviderSendResult | null = null;
      let waRecord: MessageRecord | null = null;
      if (useWhatsApp && deps.whatsapp && waContent) {
        const fallbackPossible = policy === 'whatsapp_then_sms' && smsAvailable;
        waRecord = claimFirst(
          record({
            requestId,
            template,
            channel: 'whatsapp',
            provider: deps.whatsapp.name,
            toHash,
            toMasked,
            ...related,
            fallbackDueAt: fallbackPossible ? inSeconds(def.fallbackAfterSeconds || 3600) : null,
            payloadEnc: fallbackPossible ? await encryptJson(deps.payloadKey, { to: phone, params } satisfies FallbackPayload) : null,
          }),
        );
        waResult = await dispatch(deps.whatsapp, waRecord, phone, waContent);
        if (!waResult.ok && waResult.notOnWhatsApp) await markNoWhatsApp(toHash, `send:${waResult.code}`);
      }

      const whatsappFailed = !!waResult && !waResult.ok;
      const smsNow =
        smsAvailable &&
        (policy === 'sms_only' || policy === 'whatsapp_and_sms' || (policy === 'whatsapp_then_sms' && (!useWhatsApp || whatsappFailed)));

      let smsResult: ProviderSendResult | null = null;
      if (whatsappFailed && policy === 'whatsapp_then_sms' && waResult && !waResult.ok) {
        reason = waResult.notOnWhatsApp ? 'no_whatsapp' : 'whatsapp_failed';
        if (waRecord?.payloadEnc) {
          await store.claimFallback(waRecord.id, iso(), reason);
          await store.update(waRecord.id, { payloadEnc: null, updatedAt: iso() });
        }
      }
      if (smsNow && deps.sms && smsContent) {
        const isFallback = policy === 'whatsapp_then_sms';
        const smsRecord = claimFirst(
          record({
            requestId,
            template,
            channel: 'sms',
            provider: deps.sms.name,
            toHash,
            toMasked,
            ...related,
            fallbackOf: isFallback && waRecord ? waRecord.id : null,
            fallbackReason: isFallback ? (reason ?? null) : null,
          }),
        );
        smsResult = await dispatch(deps.sms, smsRecord, phone, smsContent);
      }

      if (policy === 'whatsapp_and_sms') {
        const ok = !!waResult?.ok || !!smsResult?.ok;
        phoneOutcome = { channel: waResult?.ok ? 'whatsapp' : smsResult?.ok ? 'sms' : null, status: ok ? 'sent' : waResult || smsResult ? 'failed' : 'skipped', fallbackUsed: false, fallbackPending: false, toMasked };
      } else if (smsResult) {
        phoneOutcome = {
          channel: smsResult.ok ? 'sms' : null,
          status: smsResult.ok ? 'sent' : 'failed',
          fallbackUsed: policy === 'whatsapp_then_sms',
          fallbackReason: policy === 'whatsapp_then_sms' ? reason : undefined,
          fallbackPending: false,
          toMasked,
          errorCode: smsResult.ok ? undefined : smsResult.code,
        };
      } else if (waResult && waRecord) {
        phoneOutcome = {
          channel: waResult.ok ? 'whatsapp' : null,
          status: waResult.ok ? 'sent' : 'failed',
          fallbackUsed: false,
          fallbackReason: waResult.ok ? undefined : reason,
          fallbackPending: waResult.ok && !!waRecord.fallbackDueAt,
          fallbackDueAt: waResult.ok && waRecord.fallbackDueAt ? waRecord.fallbackDueAt : undefined,
          toMasked,
          errorCode: waResult.ok ? undefined : waResult.code,
        };
      } else {
        phoneOutcome = { channel: null, status: 'skipped', fallbackUsed: false, fallbackReason: reason, fallbackPending: false, toMasked, errorCode: 'no_channel_configured' };
      }
    }

    let emailOutcome: EmailOutcome | null = null;
    if (wantsEmail && email) {
      const toMasked = maskEmail(email);
      const content = renderEmail(template, params, deps.content);
      if (!deps.email || !content) {
        emailOutcome = { status: 'skipped', toMasked, errorCode: 'email_not_configured' };
      } else {
        const rec = claimFirst(record({ requestId, template, channel: 'email', provider: deps.email.name, toHash: await hashIdentifier(deps.hashPepper, email), toMasked, ...related }));
        const res = await dispatch(deps.email, rec, email, content);
        emailOutcome = { status: res.ok ? 'sent' : 'failed', toMasked, errorCode: res.ok ? undefined : res.code };
      }
    }

    const result: SendResult = { requestId, template, phone: phoneOutcome, email: emailOutcome };
    const firstRecord = first as MessageRecord | null;
    if (firstRecord) await store.update(firstRecord.id, { result, updatedAt: iso() });
    return result;
  };

  const handleStatus = async (update: StatusUpdate): Promise<'updated' | 'ignored' | 'unknown'> => {
    const rec = await store.findByProviderMessageId(update.provider, update.providerMessageId);
    if (!rec) return 'unknown';
    const current = rec.status;
    // Statuses only move forward; a late "failed" after delivery is ignored.
    if (current === 'failed' || (update.status === 'failed' && (current === 'delivered' || current === 'read'))) return 'ignored';
    if (update.status !== 'failed' && STATUS_RANK[update.status] <= STATUS_RANK[current]) return 'ignored';

    const patch: Partial<MessageRecord> = { status: update.status, updatedAt: iso() };
    if (update.status === 'failed') {
      patch.errorCode = update.errorCode ?? rec.errorCode;
      patch.errorMessage = update.errorMessage ? truncate(update.errorMessage) : rec.errorMessage;
    }
    if (rec.channel === 'whatsapp' && (update.status === 'delivered' || update.status === 'read')) {
      patch.payloadEnc = null; // delivered — no SMS fallback needed
      await store.setCapability(rec.toHash, { capable: true, expiresAt: inSeconds(CAPABILITY_TTL_SECONDS), reason: 'delivered' });
    }
    await store.update(rec.id, patch);

    if (rec.channel === 'whatsapp' && update.status === 'failed') {
      if (update.notOnWhatsApp) await markNoWhatsApp(rec.toHash, `webhook:${update.errorCode ?? 'unknown'}`);
      await triggerFallback(rec, update.notOnWhatsApp ? 'no_whatsapp' : 'whatsapp_failed');
    }
    return 'updated';
  };

  const sweep = async (limit = 50): Promise<{ due: number; fallbacksSent: number }> => {
    const due = await store.listDueFallbacks(iso(), limit);
    let fallbacksSent = 0;
    for (const rec of due) {
      if (await triggerFallback(rec, 'whatsapp_timeout')) fallbacksSent += 1;
    }
    return { due: due.length, fallbacksSent };
  };

  return { send, handleStatus, sweep };
};

export type { Channel };
