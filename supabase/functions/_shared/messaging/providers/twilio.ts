/** Twilio Programmable Messaging — SMS and WhatsApp (Content API templates). */
import type { Channel, ChannelProvider, OutboundMessage, ProviderSendResult } from '../types.ts';
import { type FetchLike, networkFailure, postForm, truncate } from './http.ts';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** Optional API key pair (preferred over the auth token for sending). */
  apiKeySid?: string;
  apiKeySecret?: string;
  smsFrom?: string;
  messagingServiceSid?: string;
  whatsappFrom?: string;
  statusCallbackUrl?: string;
  fetch?: FetchLike;
}

/** 63003: channel could not find the To address · 63024: invalid WhatsApp recipient. */
export const TWILIO_NOT_ON_WHATSAPP_CODES = new Set(['63003', '63024']);

export const createTwilioProvider = (channel: Extract<Channel, 'sms' | 'whatsapp'>, cfg: TwilioConfig): ChannelProvider => {
  const fetchFn: FetchLike = cfg.fetch ?? ((i, init) => fetch(i, init));
  const user = cfg.apiKeySid ?? cfg.accountSid;
  const pass = cfg.apiKeySecret ?? cfg.authToken;
  return {
    name: 'twilio',
    channel,
    async send(message: OutboundMessage): Promise<ProviderSendResult> {
      const c = message.content;
      const form = new URLSearchParams();
      if (channel === 'whatsapp') {
        if (c.kind !== 'whatsapp') return { ok: false, code: 'bad_content', message: 'WhatsApp content expected' };
        if (!c.twilioContentSid) return { ok: false, code: 'template_missing', message: `No Twilio Content SID configured for ${message.template}` };
        if (!cfg.whatsappFrom) return { ok: false, code: 'sender_missing', message: 'TWILIO_WHATSAPP_FROM is not set' };
        form.set('To', `whatsapp:${message.to}`);
        form.set('From', `whatsapp:${cfg.whatsappFrom}`);
        form.set('ContentSid', c.twilioContentSid);
        form.set('ContentVariables', JSON.stringify(c.twilioVariables));
      } else {
        if (c.kind !== 'sms') return { ok: false, code: 'bad_content', message: 'SMS content expected' };
        form.set('To', message.to);
        if (cfg.messagingServiceSid) form.set('MessagingServiceSid', cfg.messagingServiceSid);
        else if (cfg.smsFrom) form.set('From', cfg.smsFrom);
        else return { ok: false, code: 'sender_missing', message: 'Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_SMS_FROM' };
        form.set('Body', c.text);
      }
      if (cfg.statusCallbackUrl) form.set('StatusCallback', cfg.statusCallbackUrl);
      try {
        const r = await postForm(fetchFn, `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, { Authorization: `Basic ${btoa(`${user}:${pass}`)}` }, form);
        const sid = r.json.sid as string | undefined;
        if (r.ok && sid) return { ok: true, providerMessageId: sid };
        const code = String(r.json.code ?? `http_${r.status}`);
        return {
          ok: false,
          code,
          message: truncate(String(r.json.message ?? `HTTP ${r.status}`)),
          notOnWhatsApp: channel === 'whatsapp' && TWILIO_NOT_ON_WHATSAPP_CODES.has(code),
          retryable: r.status >= 500 || r.status === 429,
        };
      } catch (e) {
        return networkFailure(e);
      }
    },
  };
};
