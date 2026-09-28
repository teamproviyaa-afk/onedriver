import type { IsoDate, Rupees } from './common';
import type { Hub } from './hub';
import type { GeoZone } from './zone';

export type RiderType = 'store' | 'solo' | 'taxi';
export type RiderStatus =
  | 'draft'
  | 'submitted'
  | 'verification_pending'
  | 'approved'
  | 'rejected'
  | 'documents_expired'
  | 'suspended';
export type AcceptanceMode = 'auto' | 'manual';
export type DeliveryCategory = 'quick_drop' | 'on_order' | 'pick_drop';
export type AppLanguage = 'en' | 'hi' | 'mr' | 'kn';
export type VehicleClass = '2w' | '3w' | '4w';
export type VehicleOwnership = 'own' | 'rent';
export type RiderTier = 'bronze' | 'silver' | 'gold' | 'vip';

export type DocumentKind = 'aadhaar' | 'pan' | 'dl' | 'rc' | 'selfie' | 'permit' | 'fitness';
export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'expired';
export type DocumentSource = 'digilocker' | 'upload';

export interface RiderDocument {
  id: string;
  kind: DocumentKind;
  status: DocumentStatus;
  numberMasked?: string;
  assetId?: string;
  source?: DocumentSource;
  expiresOn?: string;
  rejectionReason?: string;
  reviewedAt?: IsoDate;
}

export interface RiderVehicle {
  class: VehicleClass;
  ownership: VehicleOwnership;
  registrationNo: string;
  model?: string;
  rcDocumentId?: string;
}

export interface StoreLink {
  storeId: string;
  storeName: string;
  organization: string;
  zoneName: string;
  managerName: string;
  dailyPayText: string;
  priority: number;
  status: 'active' | 'pending' | 'inactive';
  payoutMultiplier?: number;
}

export interface RiderPreferences {
  categories: DeliveryCategory[];
  acceptance: AcceptanceMode;
  multiStore: boolean;
  storeIds: string[];
}

export interface Rider {
  id: string;
  /** Human-facing id, e.g. RIDER-1001. */
  riderCode: string;
  userId: string;
  phone: string;
  fullName: string;
  photoAssetId?: string;
  photoUri?: string;
  emergencyPhone?: string;
  /** Optional — statements, payout and approval emails. */
  email?: string;
  language: AppLanguage;
  type: RiderType;
  status: RiderStatus;
  statusReason?: string;
  expiredDocuments?: DocumentKind[];
  etaText?: string;
  cityId?: string;
  zoneId?: string;
  hubId?: string;
  organizationId?: string;
  tier: RiderTier;
  preferences: RiderPreferences;
  cashLimit: Rupees;
  referralCode?: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface DaySummary {
  earnings: Rupees;
  jobs: number;
}

/** Response of GET /rider/me. */
export interface RiderMe {
  rider: Rider;
  zone?: GeoZone;
  hub?: Hub;
  vehicle?: RiderVehicle;
  documents: RiderDocument[];
  storeLinks: StoreLink[];
  cashInHand: Rupees;
  cashLimit: Rupees;
  online: boolean;
  today: DaySummary;
  yesterday: DaySummary;
  weekJobs?: number;
}

export interface RegisterInput {
  fullName: string;
  phone: string;
  referralCode?: string;
}

export interface ProfileInput {
  fullName: string;
  photoAssetId?: string;
  photoUri?: string;
  emergencyPhone: string;
  email?: string;
  language: AppLanguage;
}

export interface VehicleInput {
  class: VehicleClass;
  ownership: VehicleOwnership;
  registrationNo: string;
  rcAssetId?: string;
  model?: string;
}

export interface KycDocumentInput {
  kind: DocumentKind;
  assetId?: string;
  number?: string;
  source: DocumentSource;
}

export interface StatusInfo {
  status: RiderStatus;
  reason?: string;
  expiredDocuments: DocumentKind[];
  etaText?: string;
  checks?: { label: string; done: boolean }[];
}
