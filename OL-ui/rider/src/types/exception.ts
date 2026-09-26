import type { IsoDate } from './common';
import type { JobState } from './job';

export type ExceptionKind =
  | 'not_ready'
  | 'mismatch'
  | 'incomplete'
  | 'vehicle'
  | 'safety'
  | 'unavailable'
  | 'address'
  | 'refused'
  | 'proof_failed'
  | 'cannot_access'
  | 'other';

export interface ExceptionInput {
  kind: ExceptionKind;
  note?: string;
  assetId?: string;
  lat: number;
  lng: number;
  correctedLat?: number;
  correctedLng?: number;
  version: number;
}

export type ExceptionNextAction =
  | 'wait'
  | 'call_customer'
  | 'call_merchant'
  | 'escalate'
  | 'continue'
  | 'return_to_store'
  | 'photo_fallback'
  | 'await_operations'
  | 'reassigned'
  | 'share_location'
  | 'dispute_address';

export interface DeliveryException {
  id: string;
  jobId: string;
  kind: ExceptionKind;
  note?: string;
  status: 'open' | 'resolved';
  resolution?: string;
  createdAt: IsoDate;
  resolvedAt?: IsoDate;
}

export interface ExceptionResponse {
  exception: DeliveryException;
  jobState: JobState;
  nextActions: ExceptionNextAction[];
  waitSeconds?: number;
  message?: string;
}
