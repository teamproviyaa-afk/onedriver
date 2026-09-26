import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getDataProvider } from '@/providers';
import { isLocalDemo } from '@/config/env';
import { trackingModeFor, TRACKING } from '@/domain/tracking';
import { stateOrdinal } from '@/state-machine/deliveryStateMachine';
import { useDeliveryStore } from '@/stores/useDeliveryStore';
import { useDevStore } from '@/stores/useDevStore';
import { useRiderStore } from '@/stores/useRiderStore';
import type { LatLng, RiderPosition } from '@/types';
import { log } from '@/utils/logger';
import { DemoRouteSimulator } from './demoRouteSimulator';
import { applyDeviceTrackingMode, stopDeviceTracking, subscribeDevicePosition } from './locationService';
import { TrackBatcher } from './trackBatcher';
import { DEMO_STORE_HUB } from '@/demo/seed';

let simulator: DemoRouteSimulator | null = null;
export const getDemoSimulator = (): DemoRouteSimulator | null => simulator;

/**
 * Mounted once at the root. Applies the GPS cadence rules from the rider's
 * availability and current job state, feeds positions into the delivery store,
 * batches job track points and sends the 30 s heartbeat while online without a job.
 */
export const useLocationEngine = () => {
  const online = useRiderStore((s) => s.online);
  const job = useDeliveryStore((s) => s.job);
  const useDeviceGps = useDevStore((s) => s.useDeviceGps);
  const hub = useRiderStore((s) => s.me?.hub);
  const [batcher] = useState(() => new TrackBatcher());
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpeed = useRef<number | undefined>(undefined);

  const simulated = isLocalDemo && !useDeviceGps;
  const jobId = job?.id ?? null;
  const jobState = job?.state ?? null;
  const onJob = !!job && stateOrdinal(job.state) >= stateOrdinal('accepted') && stateOrdinal(job.state) <= stateOrdinal('proof');

  // Position feed (device or simulator).
  useEffect(() => {
    const onPosition = (p: RiderPosition) => {
      lastSpeed.current = p.speed;
      useDeliveryStore.getState().setPosition(p, simulated ? 'simulated' : 'device');
      if (onJob && jobId) batcher.push({ lat: p.lat, lng: p.lng, accuracyM: p.accuracyM, speed: p.speed, heading: p.heading, recordedAt: p.recordedAt });
    };
    if (simulated) {
      if (!simulator) {
        const start: LatLng = hub ? { lat: hub.lat, lng: hub.lng } : { lat: DEMO_STORE_HUB.lat, lng: DEMO_STORE_HUB.lng };
        simulator = new DemoRouteSimulator(start);
      } else if (hub && !onJob) {
        // Idle rider: keep the demo GPS parked at the rider's own hub.
        simulator.moveTo({ lat: hub.lat, lng: hub.lng });
      }
      const unsub = simulator.subscribe(onPosition);
      if (online || onJob) simulator.start();
      else simulator.stop();
      return () => {
        unsub();
      };
    }
    const unsub = subscribeDevicePosition(onPosition);
    return () => unsub();
  }, [simulated, online, onJob, jobId, hub, batcher]);

  // Cadence / mode.
  useEffect(() => {
    const mode = trackingModeFor(online, onJob, lastSpeed.current);
    if (simulated) {
      void stopDeviceTracking();
      if (simulator) {
        if (onJob && job) {
          const s = job.state;
          const target: LatLng | null =
            s === 'to_pickup' ? { lat: job.pickup.lat, lng: job.pickup.lng } : s === 'to_drop' ? { lat: job.drop.lat, lng: job.drop.lng } : null;
          simulator.setTarget(target);
        } else {
          simulator.setTarget(null);
        }
      }
      return;
    }
    void applyDeviceTrackingMode(mode);
    return () => {
      void stopDeviceTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulated, online, onJob, jobState, jobId]);

  // Track batching lifecycle.
  useEffect(() => {
    if (onJob && jobId) batcher.start(jobId);
    else batcher.stop();
    return () => batcher.stop();
  }, [onJob, jobId, batcher]);

  // Heartbeat every 30 s while online and not on a job.
  useEffect(() => {
    if (heartbeat.current) clearInterval(heartbeat.current);
    heartbeat.current = null;
    if (!online || onJob) return;
    const send = async () => {
      const p = useDeliveryStore.getState().position;
      if (!p) return;
      try {
        await getDataProvider().heartbeat({ lat: p.lat, lng: p.lng, accuracyM: p.accuracyM, battery: p.battery, appState: AppState.currentState === 'active' ? 'active' : 'background' });
      } catch (e) {
        log.debug('heartbeat failed', e);
      }
    };
    void send();
    heartbeat.current = setInterval(send, TRACKING.heartbeatSeconds * 1000);
    return () => {
      if (heartbeat.current) clearInterval(heartbeat.current);
      heartbeat.current = null;
    };
  }, [online, onJob]);
};
