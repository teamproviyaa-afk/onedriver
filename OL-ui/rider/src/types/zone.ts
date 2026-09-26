import type { LatLng } from './location';

export interface GeoState {
  code: string;
  name: string;
  defaultLanguage?: string;
}

export interface GeoCity {
  id: string;
  stateCode: string;
  name: string;
  timezone: string;
  center: LatLng;
}

export interface GeoZone {
  id: string;
  cityId: string;
  name: string;
  /** Simplified polygon (closed ring) for the picker map. */
  boundary: LatLng[];
  neighbours: string[];
  active: boolean;
}

export type ZoneLookup =
  | { status: 'in_zone'; state: GeoState; city: GeoCity; zone: GeoZone; neighbours: GeoZone[] }
  | { status: 'out_of_zone'; nearestCity?: GeoCity };
