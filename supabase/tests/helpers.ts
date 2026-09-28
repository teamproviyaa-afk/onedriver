import { Buffer } from 'node:buffer';
import { createMessenger } from '../functions/_shared/messaging/orchestrator.ts';
import { createMemoryStore } from '../functions/_shared/messaging/store/memory.ts';
import { createMockProvider } from '../functions/_shared/messaging/providers/mock.ts';
import type { MockBehaviour } from '../functions/_shared/messaging/providers/mock.ts';
import { DEFAULT_CONTENT_CONFIG } from '../functions/_shared/messaging/templates.ts';

export const PAYLOAD_KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
export const PEPPER = 'test-pepper';
export const START = Date.parse('2026-09-28T10:00:00.000Z');

export const setup = (opts: { wa?: MockBehaviour; noWhatsApp?: boolean; noSms?: boolean; noEmail?: boolean } = {}) => {
  let t = START;
  let n = 0;
  const store = createMemoryStore();
  const whatsapp = opts.noWhatsApp ? undefined : createMockProvider('whatsapp', opts.wa);
  const sms = opts.noSms ? undefined : createMockProvider('sms');
  const email = opts.noEmail ? undefined : createMockProvider('email');
  const events: { event: string; data: Record<string, unknown> }[] = [];
  const messenger = createMessenger({
    store,
    whatsapp,
    sms,
    email,
    hashPepper: PEPPER,
    payloadKey: PAYLOAD_KEY,
    content: DEFAULT_CONTENT_CONFIG,
    now: () => new Date(t),
    newId: () => `id-${++n}`,
    log: (event, data) => events.push({ event, data }),
  });
  const records = () => [...store.records.values()];
  return {
    messenger,
    store,
    whatsapp,
    sms,
    email,
    events,
    records,
    advance: (seconds: number) => {
      t += seconds * 1000;
    },
    waRecord: () => records().find((r) => r.channel === 'whatsapp'),
  };
};

export const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export interface Call {
  url: string;
  init: RequestInit;
}

export const fakeFetch = (respond: (url: string, init: RequestInit) => Response) => {
  const calls: Call[] = [];
  const fn = async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fn, calls };
};
