import type { GeofenceCheck } from '@/domain/geofence';
import { checkDropArrival, checkPickupArrival } from '@/domain/geofence';
import type { LatLng, RiderPosition } from '@/types';

/** Result used when the device has not produced a GPS fix yet: never block, ask for a reason. */
const NO_GPS_CHECK: GeofenceCheck = {
  distanceM: Number.POSITIVE_INFINITY,
  allowed: false,
  needsReason: true,
  blocked: false,
  message: 'We cannot read your GPS position. Add a reason to continue.',
};

/** "Arrived at store" geofence (150 m / accuracy ≤ 50 m), tolerant of a missing position. */
export const pickupArrivalCheck = (position: RiderPosition | null, pickup: LatLng): GeofenceCheck =>
  position ? checkPickupArrival(position, pickup, position.accuracyM) : NO_GPS_CHECK;

/** "Arrived at destination" geofence (flag beyond 500 m), tolerant of a missing position. */
export const dropArrivalCheck = (position: RiderPosition | null, drop: LatLng): GeofenceCheck =>
  position ? checkDropArrival(position, drop) : NO_GPS_CHECK;
