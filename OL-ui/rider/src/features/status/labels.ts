import type { DocumentKind, DocumentStatus, RiderType, VehicleClass } from '@/types';

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  aadhaar: 'Aadhaar Card',
  pan: 'PAN Card',
  dl: 'Driving Licence',
  rc: 'Vehicle RC',
  selfie: 'Selfie',
  permit: 'Commercial Permit',
  fitness: 'Vehicle Fitness Certificate',
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
  expired: 'Expired',
};

export const RIDER_TYPE_LABELS: Record<RiderType, string> = {
  store: 'Store-linked rider',
  solo: 'Solo rider',
  taxi: 'Taxi partner',
};

export const VEHICLE_CLASS_LABELS: Record<VehicleClass, string> = {
  '2w': 'Two-wheeler',
  '3w': 'Three-wheeler',
  '4w': 'Four-wheeler',
};
