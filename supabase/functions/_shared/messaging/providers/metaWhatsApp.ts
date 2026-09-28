/** WhatsApp Business Cloud API (Meta) — template messages. */
import type { ChannelProvider, OutboundMessage, ProviderSendResult } from '../types.ts';
import { toWaId } from '../phone.ts';
import { type FetchLike, networkFailure, postJson, truncate } from './http.ts';

export interface MetaWhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  graphVersion: string;
  fetch?: FetchLike;
}

/** "Message undeliverable": the number has no WhatsApp account (or cannot receive business messages). */
export const META_NOT_ON_WHATSAPP_CODES = new Set(['131026']);
const META_RETRYABLE_CODES = new Set(['1', '2', '4', '80007', '130429', '131000', '131016', '131056']);

export const createMetaWhatsAppProvider = (cfg: MetaWhatsAppConfig): ChannelProvider => {
  const fetchFn: FetchLike = cfg.fetch ?? ((i, init) => fetch(i, init));
  return {
    name: 'meta',
    channel: 'whatsapp',
    async send(message: OutboundMessage): Promise<ProviderSendResult> {
      const c = message.content;
      if (c.kind !== 'whatsapp') return { ok: false, code: 'bad_content', message: 'WhatsApp content expected' };
      const components: Record<string, unknown>[] = [];
      if (c.bodyParams.length) components.push({ type: 'body', parameters: c.bodyParams.map((text) => ({ type: 'text', text })) });
      // Authentication templates carry the code again on the copy-code button.
      if (c.otpButtonParam) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: c.otpButtonParam }] });
      try {
        const r = await postJson(fetchFn, `https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`, { Authorization: `Bearer ${cfg.accessToken}` }, {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toWaId(message.to),
          type: 'template',
          template: { name: c.templateName, language: { code: c.language }, components },
        });
        const messages = r.json.messages as { id?: string }[] | undefined;
        if (r.ok && messages?.[0]?.id) return { ok: true, providerMessageId: messages[0].id };
        const err = (r.json.error ?? {}) as { code?: number | string; message?: string; error_data?: { details?: string } };
        const code = String(err.code ?? `http_${r.status}`);
        return {
          ok: false,
          code,
          message: truncate(err.error_data?.details ?? err.message ?? `HTTP ${r.status}`),
          notOnWhatsApp: META_NOT_ON_WHATSAPP_CODES.has(code),
          retryable: r.status >= 500 || META_RETRYABLE_CODES.has(code),
        };
      } catch (e) {
        return networkFailure(e);
      }
    },
  };
};
