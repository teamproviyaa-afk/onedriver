/** MSG91 Flow API — DLT-compliant transactional SMS in India. */
import type { ChannelProvider, OutboundMessage, ProviderSendResult } from '../types.ts';
import { type FetchLike, networkFailure, postJson, truncate } from './http.ts';

export interface Msg91Config {
  authKey: string;
  fetch?: FetchLike;
}

export const createMsg91SmsProvider = (cfg: Msg91Config): ChannelProvider => {
  const fetchFn: FetchLike = cfg.fetch ?? ((i, init) => fetch(i, init));
  return {
    name: 'msg91',
    channel: 'sms',
    async send(message: OutboundMessage): Promise<ProviderSendResult> {
      const c = message.content;
      if (c.kind !== 'sms') return { ok: false, code: 'bad_content', message: 'SMS content expected' };
      if (!c.msg91FlowId) return { ok: false, code: 'template_missing', message: `No MSG91 flow id configured for ${message.template}` };
      try {
        const r = await postJson(fetchFn, 'https://control.msg91.com/api/v5/flow', { authkey: cfg.authKey }, {
          template_id: c.msg91FlowId,
          short_url: '0',
          recipients: [{ mobiles: message.to.replace(/\D/g, ''), ...c.vars }],
        });
        if (r.ok && r.json.type === 'success') return { ok: true, providerMessageId: String(r.json.message ?? message.id) };
        return { ok: false, code: String(r.json.code ?? `http_${r.status}`), message: truncate(String(r.json.message ?? `HTTP ${r.status}`)), retryable: r.status >= 500 };
      } catch (e) {
        return networkFailure(e);
      }
    },
  };
};
