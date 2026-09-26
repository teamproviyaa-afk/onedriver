import type { LatLng } from '@/types';

const R = 6371000; // metres
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export const haversineM = (a: LatLng, b: LatLng): number => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

export const haversineKm = (a: LatLng, b: LatLng): number => haversineM(a, b) / 1000;

/** Ray-casting point-in-polygon (polygon is a closed or open ring). */
export const pointInPolygon = (p: LatLng, ring: LatLng[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]!.lng;
    const yi = ring[i]!.lat;
    const xj = ring[j]!.lng;
    const yj = ring[j]!.lat;
    const intersect = yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi + 0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

/** Straight-line ETA fallback: distance × 1.35 at 22 km/h (spec §3.5). */
export const fallbackEtaMin = (a: LatLng, b: LatLng): number => {
  const km = haversineKm(a, b) * 1.35;
  return Math.max(1, Math.round((km / 22) * 60));
};

export const bearing = (a: LatLng, b: LatLng): number => {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180) / Math.PI;
};

/** Move a coordinate by metres along a bearing (used by the demo GPS simulator). */
export const offsetM = (p: LatLng, dNorthM: number, dEastM: number): LatLng => ({
  lat: p.lat + dNorthM / 111320,
  lng: p.lng + dEastM / (111320 * Math.cos(toRad(p.lat))),
});

export const midpoint = (a: LatLng, b: LatLng): LatLng => ({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 });
