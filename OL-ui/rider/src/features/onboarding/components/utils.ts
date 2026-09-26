import type { LatLng } from '@/types';

/** Geometric centre of a zone boundary ring — used as the default hub pin when GPS is unavailable. */
export const centroid = (points: LatLng[]): LatLng | null => {
  if (!points.length) return null;
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
};

/** "latur-central" → "Latur Central" (ids are the only city text the draft keeps). */
export const titleCaseId = (id?: string): string =>
  (id ?? '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const STANDARD_REG = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{4})$/;
const BHARAT_REG = /^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/;

export const normalizeRegistration = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Indian vehicle registration: "MH 24 AB 1234", "MH-12-AB-1234", "MH12AB1234" or Bharat series "22 BH 1234 AA". */
export const isValidRegistration = (raw: string): boolean => {
  const v = normalizeRegistration(raw);
  return STANDARD_REG.test(v) || BHARAT_REG.test(v);
};

/** Canonical display form "MH 24 AB 1234" (falls back to the trimmed upper-case input). */
export const formatRegistration = (raw: string): string => {
  const v = normalizeRegistration(raw);
  const std = v.match(STANDARD_REG);
  if (std) return [std[1], std[2], std[3], std[4]].filter(Boolean).join(' ');
  const bh = v.match(BHARAT_REG);
  if (bh) return [bh[1], bh[2], bh[3], bh[4]].join(' ');
  return raw.trim().toUpperCase();
};

export const normalizeLicence = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Driving licence number: state code + 11–14 alphanumerics (lenient — formats vary by RTO and year). */
export const isValidLicence = (raw: string): boolean => /^[A-Z]{2}[A-Z0-9]{11,14}$/.test(normalizeLicence(raw));
