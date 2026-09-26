import type { TrackingMode } from '@/types';

/** Location cadence (spec §3.4 / R8). */
export const TRACKING = {
  heartbeatSeconds: 30,
  jobMovingSeconds: 5,
  jobMovingDistanceM: 25,
  jobStationarySeconds: 30,
  batchFlushSeconds: 10,
  batchMaxPoints: 60,
  stationarySpeedMps: 0.5,
  heartbeatSilenceOfflineSeconds: 60,
} as const;

export const cadenceFor = (mode: TrackingMode): { timeIntervalMs: number; distanceIntervalM: number } => {
  switch (mode) {
    case 'heartbeat':
      return { timeIntervalMs: TRACKING.heartbeatSeconds * 1000, distanceIntervalM: 100 };
    case 'job_moving':
      return { timeIntervalMs: TRACKING.jobMovingSeconds * 1000, distanceIntervalM: TRACKING.jobMovingDistanceM };
    case 'job_stationary':
      return { timeIntervalMs: TRACKING.jobStationarySeconds * 1000, distanceIntervalM: TRACKING.jobMovingDistanceM };
    default:
      return { timeIntervalMs: 0, distanceIntervalM: 0 };
  }
};

export const trackingModeFor = (online: boolean, onJob: boolean, speedMps?: number): TrackingMode => {
  if (!online) return 'off';
  if (!onJob) return 'heartbeat';
  return (speedMps ?? 1) > TRACKING.stationarySpeedMps ? 'job_moving' : 'job_stationary';
};
