import type { IsoDate, Rupees } from './common';
import type { Job } from './job';
import type { AcceptanceMode } from './rider';

export interface Offer {
  id: string;
  jobId: string;
  job: Job;
  mode: AcceptanceMode;
  round: number;
  payoutEstimate: Rupees;
  surgeMultiplier: number;
  pickup: { name: string; area: string; distanceKm: number };
  drop: { area: string; distanceKm: number };
  etaMin: number;
  note?: string;
  offeredAt: IsoDate;
  expiresAt: IsoDate;
  outcome?: 'accepted' | 'declined' | 'timed_out' | 'withdrawn';
}

export type DeclineReason = 'too_far' | 'low_payout' | 'break' | 'vehicle' | 'other';
