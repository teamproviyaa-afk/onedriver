import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { router, usePathname } from 'expo-router';

import { getDataProvider, getDemoProvider } from '@/providers';
import { startConnectivityMonitor } from '@/offline/connectivityMonitor';
import { processQueue } from '@/offline/queueEngine';
import { useLocationEngine } from '@/location/useLocationEngine';
import { useQueueBridge } from '@/hooks/useQueueBridge';
import { queryKeys } from '@/hooks/queryClient';
import { addResponseListener, configureNotificationHandler, presentOfferNotification, registerPushToken, setupNotificationChannels } from '@/notifications/notificationService';
import { routeForJob } from '@/state-machine/deliveryStateMachine';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDeliveryStore } from '@/stores/useDeliveryStore';
import { useRiderStore } from '@/stores/useRiderStore';
import { log } from '@/utils/logger';

/**
 * Background services mounted once at the root: connectivity, GPS engine, offline
 * queue bridge, notifications, provider events (offers) and resume-after-background.
 */
export const useAppServices = () => {
  const qc = useQueryClient();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  const signedIn = useAuthStore((s) => s.status === 'signed_in');
  const approved = useRiderStore((s) => s.me?.rider.status === 'approved');

  useLocationEngine();
  useQueueBridge();

  useEffect(() => startConnectivityMonitor(), []);

  useEffect(() => {
    configureNotificationHandler();
    void setupNotificationChannels();
    return addResponseListener((link) => router.push(link as never));
  }, []);

  useEffect(() => {
    if (signedIn && approved) void registerPushToken();
  }, [signedIn, approved]);

  // Offer / job / notification events from the local demo provider (Realtime channel in production).
  useEffect(() => {
    const demo = getDemoProvider();
    if (!demo) return;
    return demo.onEvent(async (e) => {
      if (e.type === 'offer') {
        void qc.invalidateQueries({ queryKey: queryKeys.currentOffer });
        try {
          const offer = await getDataProvider().getCurrentOffer();
          if (offer && !offer.outcome) {
            useDeliveryStore.getState().setOffer(offer);
            void presentOfferNotification(offer);
            if (!pathRef.current.startsWith('/offer/')) router.push(`/offer/${offer.jobId}` as never);
          } else if (offer?.outcome === 'accepted') {
            useDeliveryStore.getState().setOffer(offer);
            void presentOfferNotification(offer);
            if (!pathRef.current.startsWith('/offer/')) router.push(`/offer/${offer.jobId}` as never);
          }
        } catch (err) {
          log.warn('offer event failed', err);
        }
      }
      if (e.type === 'job') void qc.invalidateQueries({ queryKey: queryKeys.currentJob });
      if (e.type === 'notification') void qc.invalidateQueries({ queryKey: queryKeys.notifications });
      if (e.type === 'status') {
        void qc.invalidateQueries({ queryKey: queryKeys.me });
        void qc.invalidateQueries({ queryKey: queryKeys.status });
      }
    });
  }, [qc]);

  // Resume after background: fetch the latest server state and jump to the right screen.
  useEffect(() => {
    const onChange = async (state: AppStateStatus) => {
      if (state !== 'active' || !signedIn) return;
      void processQueue();
      try {
        const job = await getDataProvider().getCurrentJob();
        const local = useDeliveryStore.getState().job;
        if (job) {
          if (!local || local.id !== job.id || local.version < job.version) useDeliveryStore.getState().setJob(job);
          const route = routeForJob(job);
          if (!pathRef.current.startsWith(`/job/${job.id}`) && !pathRef.current.startsWith('/dev')) router.replace(route as never);
        } else if (local && !useDeliveryStore.getState().pendingSync) {
          useDeliveryStore.getState().setJob(null);
        }
        void qc.invalidateQueries({ queryKey: queryKeys.me });
      } catch (err) {
        log.debug('resume check failed', err);
      }
    };
    const sub = AppState.addEventListener('change', (s) => void onChange(s));
    return () => sub.remove();
  }, [signedIn, qc]);
};
