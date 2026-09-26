import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import type { LatLng, LocationPermissionState, RiderPosition, TrackingMode } from '@/types';
import { cadenceFor } from '@/domain/tracking';
import { log } from '@/utils/logger';

export const LOCATION_TASK = 'onelocal-rider-job-location';

type Listener = (p: RiderPosition) => void;
const listeners = new Set<Listener>();

const toPosition = (loc: Location.LocationObject): RiderPosition => ({
  lat: loc.coords.latitude,
  lng: loc.coords.longitude,
  accuracyM: Math.round(loc.coords.accuracy ?? 50),
  speed: loc.coords.speed ?? undefined,
  heading: loc.coords.heading ?? undefined,
  recordedAt: new Date(loc.timestamp).toISOString(),
});

// Background task for the Android foreground service during an active job.
// Defined at module scope as required by expo-task-manager.
try {
  TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      log.warn('location task error', error.message);
      return;
    }
    const locs = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
    for (const loc of locs) {
      const p = toPosition(loc);
      for (const l of listeners) l(p);
    }
  });
} catch (e) {
  log.warn('defineTask unavailable', e);
}

export const subscribeDevicePosition = (l: Listener): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getPermissionState = async (): Promise<LocationPermissionState> => {
  try {
    const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') return 'granted';
    return canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'undetermined';
  }
};

export const requestForegroundPermission = async (): Promise<LocationPermissionState> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
};

export const getCurrentPosition = async (): Promise<RiderPosition | null> => {
  try {
    const perm = await getPermissionState();
    if (perm !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return toPosition(loc);
  } catch (e) {
    log.warn('getCurrentPosition failed', e);
    return null;
  }
};

let watchSub: Location.LocationSubscription | null = null;
let serviceRunning = false;
let currentMode: TrackingMode = 'off';

/**
 * Applies the tracking cadence for a mode (spec §3.4):
 *  - off: nothing
 *  - heartbeat: coarse position every 30 s
 *  - job_moving / job_stationary: 5 s / 25 m or 30 s, Android foreground service while on a job.
 */
export const applyDeviceTrackingMode = async (mode: TrackingMode): Promise<void> => {
  if (mode === currentMode) return;
  currentMode = mode;
  await stopDeviceTracking();
  if (mode === 'off') return;
  const perm = await getPermissionState();
  if (perm !== 'granted') return;
  const cadence = cadenceFor(mode);
  const onJob = mode === 'job_moving' || mode === 'job_stationary';
  if (onJob && Platform.OS === 'android') {
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: cadence.timeIntervalMs,
        distanceInterval: cadence.distanceIntervalM,
        foregroundService: {
          notificationTitle: 'OneLocal Rider',
          notificationBody: 'Sharing your location for the active delivery',
          notificationColor: '#76EC00',
          killServiceOnDestroy: true,
        },
      });
      serviceRunning = true;
      return;
    } catch (e) {
      // Expo Go / missing background permission: fall back to foreground watching.
      log.warn('foreground service unavailable, using watchPosition', e);
    }
  }
  try {
    watchSub = await Location.watchPositionAsync(
      {
        accuracy: onJob ? Location.Accuracy.High : Location.Accuracy.Balanced,
        timeInterval: cadence.timeIntervalMs,
        distanceInterval: cadence.distanceIntervalM,
      },
      (loc) => {
        const p = toPosition(loc);
        for (const l of listeners) l(p);
      },
    );
  } catch (e) {
    log.warn('watchPosition failed', e);
  }
};

export const stopDeviceTracking = async (): Promise<void> => {
  watchSub?.remove();
  watchSub = null;
  if (serviceRunning) {
    try {
      const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
      if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    } catch (e) {
      log.warn('stopLocationUpdates failed', e);
    }
    serviceRunning = false;
  }
};

export const resetTrackingMode = () => {
  currentMode = 'off';
};

export const distanceLabel = (a: LatLng | null, b: LatLng | null): string | null => {
  if (!a || !b) return null;
  return null;
};
