import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { Job, PickupVerifyResult, ProofResult } from '@/types';
import { ApiError } from '@/types';
import { onQueueResult } from '@/offline/queueEngine';
import { getDataProvider } from '@/providers';
import { useDeliveryStore } from '@/stores/useDeliveryStore';
import { useEarningsStore } from '@/stores/useEarningsStore';
import { queryKeys } from './queryClient';

/**
 * Applies replayed queue results to app state: successful steps/proofs update the
 * job, conflicts refetch the server copy (server wins), and caches are invalidated.
 */
export const useQueueBridge = () => {
  const qc = useQueryClient();
  useEffect(
    () =>
      onQueueResult(async (item, result) => {
        const store = useDeliveryStore.getState();
        const relevant = ['job', 'pickup_verify', 'proof', 'exception', 'offer'].includes(item.entityType);
        if (result.ok) {
          if (item.entityType === 'job' && item.action === 'step') store.setJob(result.value as Job);
          if (item.entityType === 'pickup_verify') store.setJob((result.value as PickupVerifyResult).job);
          if (item.entityType === 'proof') {
            const r = result.value as ProofResult;
            store.setLastProof(r);
            useEarningsStore.getState().addDelivered(r.earnings);
            store.setJob(null);
            void qc.invalidateQueries({ queryKey: ['earnings'] });
          }
          if (item.entityType === 'offer' && item.action === 'accept') store.setJob(result.value as Job);
        } else if (relevant && ApiError.is(result.error, 'version_conflict')) {
          try {
            const server = await getDataProvider().getCurrentJob();
            store.setJob(server);
          } catch {
            /* stay on local copy */
          }
        }
        if (relevant) {
          void qc.invalidateQueries({ queryKey: queryKeys.currentJob });
          void qc.invalidateQueries({ queryKey: queryKeys.me });
          void qc.invalidateQueries({ queryKey: queryKeys.history });
          void qc.invalidateQueries({ queryKey: queryKeys.notifications });
        }
      }),
    [qc],
  );
};
