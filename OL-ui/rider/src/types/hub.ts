import type { PlacePoint } from './location';

export type HubKind = 'store' | 'dark_store' | 'rider_start';

export interface Hub extends PlacePoint {
  id: string;
  zoneId: string;
  kind: HubKind;
  organizationId?: string;
  storeId?: string;
  name: string;
  address: string;
  landmark?: string;
  entranceNote?: string;
}

export interface HubInput {
  zoneId: string;
  lat: number;
  lng: number;
  address: string;
  landmark?: string;
  name?: string;
}
