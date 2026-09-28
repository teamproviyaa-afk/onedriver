import type { IsoDate, Rupees } from './common';
import type { LatLng, PlacePoint } from './location';
import type { DeliveryCategory } from './rider';
import type { ProofMethod } from './proof';
import type { MessageReceipt } from './messaging';

/**
 * 12-state delivery engine (spec §4.1 / Figma rider-state-machine).
 * `available` is a rider state (online, no job) and is part of the flow list
 * for completeness; jobs themselves start at `offered`.
 */
export type ActiveJobState =
  | 'offered'
  | 'accepted'
  | 'to_pickup'
  | 'at_pickup'
  | 'pickup_verified'
  | 'picked_up'
  | 'to_drop'
  | 'at_drop'
  | 'handover'
  | 'proof';

export type TerminalJobState = 'delivered' | 'failed' | 'returned' | 'cancelled';
export type JobState = 'created' | ActiveJobState | TerminalJobState;
export type RiderFlowState = 'available' | ActiveJobState | 'delivered';

export interface JobPickup extends PlacePoint {
  name: string;
  address: string;
  area?: string;
  entranceNote?: string;
  phoneMasked: boolean;
  storeId?: string;
}

export interface JobDrop extends PlacePoint {
  area: string;
  /** Full address is only present after pickup_verified (privacy rule). */
  address?: string | null;
  landmark?: string;
  customerFirstName: string;
  instructions?: string;
  flatFloor?: string;
}

export interface JobItem {
  id: string;
  name: string;
  qty: number;
  sku?: string;
}

export interface JobEta {
  toPickupMin: number;
  toDropMin: number;
}

export interface JobDeadlines {
  pickupBy?: IsoDate;
  dropBy?: IsoDate;
}

export interface Job {
  id: string;
  orderRef: string;
  state: JobState;
  version: number;
  category: DeliveryCategory;
  cityId: string;
  pickupZone: string;
  dropZone: string;
  pickup: JobPickup;
  drop: JobDrop;
  items: JobItem[];
  itemsCount: number;
  cashToCollect: Rupees;
  proofMethods: ProofMethod[];
  payoutEstimate: Rupees;
  surgeMultiplier?: number;
  eta: JobEta;
  distanceKm: number;
  pickupDistanceKm?: number;
  deadlines: JobDeadlines;
  merchantNote?: string;
  /** Expected pickup verification code (only in demo; server never sends it). */
  pickupCodeHint?: string;
  otpAttempts: number;
  otpLocked: boolean;
  /** How the customer received the delivery OTP (server-reported; no number). */
  otpDelivery?: MessageReceipt;
  riderId?: string;
  acceptedAt?: IsoDate;
  deliveredAt?: IsoDate;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  /** Merchant readiness (demo/server hint) — used by the Order Not Ready flow. */
  merchantReadyAt?: IsoDate;
  /** Set when the job ended for the rider with an exception. */
  failureReason?: string;
  flags?: string[];
}

export interface DeliveryEvent {
  id: string;
  jobId: string;
  fromState?: JobState;
  toState: JobState;
  actor: 'rider' | 'server' | 'merchant' | 'operations' | 'customer';
  location?: LatLng & { accuracyM?: number };
  reason?: string;
  createdAt: IsoDate;
}

export type StepTarget = 'to_pickup' | 'at_pickup' | 'picked_up' | 'to_drop' | 'at_drop' | 'handover';

export interface StepInput {
  to: StepTarget;
  version: number;
  lat: number;
  lng: number;
  accuracyM: number;
  reason?: string;
}

export type PickupVerifyMethod = 'scan' | 'code' | 'bypass';

export interface PickupVerifyInput {
  method: PickupVerifyMethod;
  code?: string;
  items: { id: string; ok: boolean }[];
  reason?: string;
  version: number;
}

export type PickupVerifyResult =
  | { result: 'verified'; job: Job }
  | { result: 'mismatch'; expectedSku: string; scanned: string; job: Job }
  | { result: 'incomplete'; missing: JobItem[]; job: Job };

export interface JobHistoryItem {
  id: string;
  orderRef: string;
  state: JobState;
  category: DeliveryCategory;
  pickupName: string;
  dropArea: string;
  distanceKm: number;
  earnings: Rupees;
  deliveredAt?: IsoDate;
  createdAt: IsoDate;
  failureReason?: string;
}

export interface JobDetail {
  job: Job;
  events: DeliveryEvent[];
  proof?: { method: ProofMethod; createdAt: IsoDate; distanceFromDropM?: number };
  pickupCheck?: { method: PickupVerifyMethod; result: string; checkedAt: IsoDate };
  earnings?: import('./earnings').JobEarnings;
}
