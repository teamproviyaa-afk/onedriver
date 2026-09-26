import type { Rupees } from './common';

export type ProofMethod = 'otp' | 'photo' | 'signature';

export type ProofInput = (
  | { method: 'otp'; code: string }
  | { method: 'photo'; assetId: string; localUri?: string }
  | { method: 'signature'; assetId: string; localUri?: string }
) & {
  version: number;
  lat: number;
  lng: number;
  accuracyM?: number;
  cashCollected?: Rupees;
};

export interface ProofResult {
  job: import('./job').Job;
  earnings: import('./earnings').JobEarnings;
  flagged?: boolean;
  distanceFromDropM?: number;
}
