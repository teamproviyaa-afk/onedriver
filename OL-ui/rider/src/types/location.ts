import type { IsoDate } from './common';

export interface LatLng {
  lat: number;
  lng: number;
}

export type PlaceSource =
  | 'merchant_pin'
  | 'rider_confirmed'
  | 'customer_pin'
  | 'geocoded'
  | 'rider_corrected'
  | 'rider_start';

/** Coordinate-first place. Text is secondary (spec R4). */
export interface PlacePoint extends LatLng {
  accuracyM?: number;
  source?: PlaceSource;
  confidence?: number;
}

export interface RiderPosition extends LatLng {
  accuracyM: number;
  speed?: number;
  heading?: number;
  recordedAt: IsoDate;
  battery?: number;
}

export type TrackingMode = 'off' | 'heartbeat' | 'job_moving' | 'job_stationary';

export interface TrackPoint extends LatLng {
  accuracyM: number;
  speed?: number;
  heading?: number;
  recordedAt: IsoDate;
}

export type LocationPermissionState = 'undetermined' | 'granted' | 'denied';
