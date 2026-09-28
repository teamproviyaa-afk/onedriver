/** In-memory provider for local development and tests — records what would have been sent. */
import type { Channel, ChannelProvider, OutboundMessage, ProviderSendResult } from '../types.ts';

export interface MockBehaviour {
  /** E.164 numbers that have no WhatsApp account (sync "not on WhatsApp" failure). */
  notOnWhatsApp?: (to: string) => boolean;
  /** Any other failure. */
  fail?: (to: string) => boolean;
}

export interface MockProvider extends ChannelProvider {
  readonly sent: OutboundMessage[];
}

export const createMockProvider = (channel: Channel, behaviour: MockBehaviour = {}): MockProvider => {
  const sent: OutboundMessage[] = [];
  let n = 0;
  return {
    name: 'mock',
    channel,
    sent,
    async send(message: OutboundMessage): Promise<ProviderSendResult> {
      if (channel === 'whatsapp' && behaviour.notOnWhatsApp?.(message.to)) return { ok: false, code: 'not_on_whatsapp', message: 'Recipient is not on WhatsApp', notOnWhatsApp: true };
      if (behaviour.fail?.(message.to)) return { ok: false, code: 'mock_failure', message: 'Mock provider failure', retryable: true };
      sent.push(message);
      n += 1;
      return { ok: true, providerMessageId: `mock-${channel}-${n}` };
    },
  };
};
