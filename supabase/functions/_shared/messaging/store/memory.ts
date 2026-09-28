/** In-memory MessageStore for tests and local development. */
import type { FallbackReason, MessageRecord, MessageStore, ProviderName, TemplateId, WhatsAppCapability } from '../types.ts';
import { DuplicateRequestError } from '../types.ts';

export interface MemoryStore extends MessageStore {
  readonly records: Map<string, MessageRecord>;
  readonly capabilities: Map<string, WhatsAppCapability>;
}

export const createMemoryStore = (): MemoryStore => {
  const records = new Map<string, MessageRecord>();
  const capabilities = new Map<string, WhatsAppCapability>();
  const all = () => [...records.values()];
  return {
    records,
    capabilities,
    async insert(r) {
      if (r.idempotencyKey && all().some((x) => x.idempotencyKey === r.idempotencyKey)) throw new DuplicateRequestError();
      records.set(r.id, { ...r });
    },
    async update(id, patch) {
      const r = records.get(id);
      if (r) records.set(id, { ...r, ...patch });
    },
    async get(id) {
      return records.get(id) ?? null;
    },
    async findByIdempotencyKey(key) {
      return all().find((r) => r.idempotencyKey === key) ?? null;
    },
    async findByProviderMessageId(provider: ProviderName, pid: string) {
      return all().find((r) => r.provider === provider && r.providerMessageId === pid) ?? null;
    },
    async listRecent(template: TemplateId, toHash: string, sinceIso: string) {
      return all()
        .filter((r) => r.template === template && r.toHash === toHash && r.createdAt >= sinceIso)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async claimFallback(id: string, atIso: string, reason: FallbackReason) {
      const r = records.get(id);
      if (!r || r.fallbackSentAt) return false;
      records.set(id, { ...r, fallbackSentAt: atIso, fallbackReason: reason, updatedAt: atIso });
      return true;
    },
    async listDueFallbacks(nowIso: string, limit: number) {
      return all()
        .filter((r) => r.channel === 'whatsapp' && !r.fallbackSentAt && r.payloadEnc && r.fallbackDueAt && r.fallbackDueAt <= nowIso && (r.status === 'queued' || r.status === 'sent'))
        .sort((a, b) => (a.fallbackDueAt ?? '').localeCompare(b.fallbackDueAt ?? ''))
        .slice(0, limit);
    },
    async getCapability(hash) {
      return capabilities.get(hash) ?? null;
    },
    async setCapability(hash, cap) {
      capabilities.set(hash, { ...cap });
    },
  };
};
