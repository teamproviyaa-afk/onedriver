/** Figma shows every job distance with one decimal ("0.8 km", "4.2 km", "2.1 km left"). */
export const formatKm1 = (km: number): string => `${Math.max(0, km).toFixed(1)} km`;

/** Round to the displayed precision so live values only change when the label would. */
export const roundKm1 = (km: number): number => Math.round(km * 10) / 10;
