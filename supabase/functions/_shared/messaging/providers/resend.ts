/** Resend — transactional email. */
import type { ChannelProvider, OutboundMessage, ProviderSendResult } from '../types.ts';
import { type FetchLike, networkFailure, postJson, truncate } from './http.ts';

export interface ResendConfig {
  apiKey: string;
  from: string;
  replyTo?: string;
  fetch?: FetchLike;
}

export const createResendProvider = (cfg: ResendConfig): ChannelProvider => {
  const fetchFn: FetchLike = cfg.fetch ?? ((i, init) => fetch(i, init));
  return {
    name: 'resend',
    channel: 'email',
    async send(message: OutboundMessage): Promise<ProviderSendResult> {
      const c = message.content;
      if (c.kind !== 'email') return { ok: false, code: 'bad_content', message: 'Email content expected' };
      try {
        const r = await postJson(fetchFn, 'https://api.resend.com/emails', { Authorization: `Bearer ${cfg.apiKey}`, 'Idempotency-Key': message.id }, {
          from: cfg.from,
          to: [message.to],
          subject: c.subject,
          html: c.html,
          text: c.text,
          ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
          tags: [{ name: 'template', value: message.template }],
        });
        if (r.ok && typeof r.json.id === 'string') return { ok: true, providerMessageId: r.json.id };
        return { ok: false, code: String(r.json.name ?? `http_${r.status}`), message: truncate(String(r.json.message ?? `HTTP ${r.status}`)), retryable: r.status >= 500 || r.status === 429 };
      } catch (e) {
        return networkFailure(e);
      }
    },
  };
};
