import type { LatLng } from '@/types';

/** Navigation handoff URLs — coordinates only, never address text (spec §3.3). */
export const navigationUrls = (dest: LatLng, label?: string) => {
  const q = `${dest.lat},${dest.lng}`;
  const encodedLabel = label ? encodeURIComponent(label) : '';
  return {
    androidTwoWheeler: `google.navigation:q=${q}&mode=l`,
    androidDriving: `google.navigation:q=${q}&mode=d`,
    iosGoogleMaps: `comgooglemaps://?daddr=${q}&directionsmode=driving`,
    iosAppleMaps: `maps://?daddr=${q}${encodedLabel ? `&q=${encodedLabel}` : ''}`,
    web: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
  };
};

/** Ordered attempts per platform; the first that can be opened wins. */
export const navigationAttempts = (platform: 'android' | 'ios' | 'web' | string, dest: LatLng, label?: string): string[] => {
  const u = navigationUrls(dest, label);
  if (platform === 'android') return [u.androidTwoWheeler, u.androidDriving, u.web];
  if (platform === 'ios') return [u.iosGoogleMaps, u.iosAppleMaps, u.web];
  return [u.web];
};
