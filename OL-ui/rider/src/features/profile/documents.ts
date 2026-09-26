import type { DocumentKind, RiderDocument, RiderStatus, RiderType, VehicleClass } from '@/types';

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  aadhaar: 'Aadhaar Card',
  pan: 'PAN Card',
  dl: 'Driving License',
  rc: 'Vehicle RC & Plate',
  selfie: 'Selfie',
  permit: 'Permit',
  fitness: 'Fitness Certificate',
};

/** Display order on the profile (matches the Figma KYC card: DL, Aadhaar, RC first). */
const DOCUMENT_ORDER: DocumentKind[] = ['dl', 'aadhaar', 'rc', 'pan', 'selfie', 'permit', 'fitness'];

export type DocPillTone = 'valid' | 'verified' | 'pending' | 'rejected' | 'expired';

export interface DocPill {
  label: 'VALID' | 'VERIFIED' | 'PENDING' | 'REJECTED' | 'EXPIRED';
  tone: DocPillTone;
}

const DATED_KINDS: DocumentKind[] = ['dl', 'rc', 'permit', 'fitness'];

/** Pill for a document: verified dated documents read "VALID", the rest "VERIFIED". */
export const documentPill = (doc: RiderDocument, expiredKinds: DocumentKind[] = []): DocPill => {
  if (doc.status === 'expired' || expiredKinds.includes(doc.kind)) return { label: 'EXPIRED', tone: 'expired' };
  if (doc.status === 'rejected') return { label: 'REJECTED', tone: 'rejected' };
  if (doc.status === 'pending') return { label: 'PENDING', tone: 'pending' };
  if (DATED_KINDS.includes(doc.kind)) {
    if (doc.expiresOn && new Date(doc.expiresOn).getTime() < Date.now()) return { label: 'EXPIRED', tone: 'expired' };
    return { label: 'VALID', tone: 'valid' };
  }
  return { label: 'VERIFIED', tone: 'verified' };
};

export const sortDocuments = (docs: RiderDocument[]): RiderDocument[] =>
  [...docs].sort((a, b) => DOCUMENT_ORDER.indexOf(a.kind) - DOCUMENT_ORDER.indexOf(b.kind));

export type KycSummary = { label: string; tone: 'ok' | 'warning' | 'danger' };

/** Header status for the KYC card ("ALL VERIFIED ✓" when every document is in order). */
export const kycSummary = (docs: RiderDocument[], expiredKinds: DocumentKind[] = []): KycSummary => {
  if (!docs.length) return { label: 'NOT STARTED', tone: 'warning' };
  const pills = docs.map((d) => documentPill(d, expiredKinds));
  if (pills.some((p) => p.tone === 'expired' || p.tone === 'rejected')) return { label: 'ACTION NEEDED', tone: 'danger' };
  const pending = pills.filter((p) => p.tone === 'pending').length;
  if (pending) return { label: `${pending} PENDING`, tone: 'warning' };
  return { label: 'ALL VERIFIED ✓', tone: 'ok' };
};

export const RIDER_TYPE_LABELS: Record<RiderType, string> = { store: 'Store Rider', solo: 'Solo Rider', taxi: 'Taxi Partner' };

export const VEHICLE_CLASS_LABELS: Record<VehicleClass, string> = { '2w': 'Two-wheeler', '3w': 'Three-wheeler', '4w': 'Four-wheeler' };

export const STATUS_LABELS: Record<RiderStatus, string> = {
  draft: 'Onboarding',
  submitted: 'Submitted',
  verification_pending: 'Verification pending',
  approved: 'Approved',
  rejected: 'Rejected',
  documents_expired: 'Documents expired',
  suspended: 'Suspended',
};

/** "+91 98765 43210" from a 10-digit Indian number (leaves other formats untouched). */
export const formatPhoneDisplay = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (local.length !== 10) return phone;
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
};
