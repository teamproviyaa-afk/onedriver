import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { ApiError, type DeclineReason, type Job, type Offer } from '@/types';
import { buildQueueItem, runOrQueue } from '@/offline/queueEngine';
import { useDeliveryStore } from '@/stores/useDeliveryStore';
import { queryKeys } from './queryClient';

export type OfferOutcome = { ok: true; job: Job } | { ok: false; code: 'offer_expired' | 'already_taken' | 'network' | 'unknown'; detail: string };

/** Accept / decline with the spec's offer_expired and already_taken outcomes. */
export const useOfferActions = () => {
  const qc = useQueryClient();
  const setJob = useDeliveryStore((s) => s.setJob);
  const setOffer = useDeliveryStore((s) => s.setOffer);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);

  const finish = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.currentOffer });
    void qc.invalidateQueries({ queryKey: queryKeys.currentJob });
    void qc.invalidateQueries({ queryKey: queryKeys.me });
  }, [qc]);

  const accept = useCallback(
    async (offer: Offer): Promise<OfferOutcome> => {
      setBusy('accept');
      try {
        const item = buildQueueItem('offer', offer.id, 'accept', {});
        const res = await runOrQueue<typeof item.payload, Job>(item);
        if (res.queued) return { ok: false, code: 'network', detail: 'No connection. The offer will be accepted when you are back online.' };
        setJob(res.value);
        setOffer(null);
        finish();
        return { ok: true, job: res.value };
      } catch (e) {
        setOffer(null);
        finish();
        if (ApiError.is(e, 'offer_expired')) return { ok: false, code: 'offer_expired', detail: e.detail };
        if (ApiError.is(e, 'already_taken')) return { ok: false, code: 'already_taken', detail: e.detail };
        return { ok: false, code: 'unknown', detail: e instanceof Error ? e.message : 'Could not accept the offer' };
      } finally {
        setBusy(null);
      }
    },
    [finish, setJob, setOffer],
  );

  const decline = useCallback(
    async (offer: Offer, reason: DeclineReason = 'other'): Promise<void> => {
      setBusy('decline');
      try {
        const item = buildQueueItem('offer', offer.id, 'decline', { reason });
        await runOrQueue(item);
      } catch {
        // Declining an already-gone offer is a no-op.
      } finally {
        setOffer(null);
        finish();
        setBusy(null);
      }
    },
    [finish, setOffer],
  );

  return { accept, decline, busy };
};
