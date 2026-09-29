/**
 * OneLocal rider KYC on Cashfree Secure ID — shared types. Runtime-agnostic: fetch + WebCrypto only,
 * erasable TypeScript (Deno on Supabase Edge Functions, Node 22+ for tests).
 *
 * Only what KYC needs is kept, masked: never a full Aadhaar number, never document images. The
 * Aadhaar photo (for the selfie face match) is stored encrypted and deleted after the match or 24 h.
 */
export type KycKind = 'aadhaar' | 'pan' | 'selfie' | 'dl' | 'rc';
export type KycStatus = 'verified' | 'pending' | 'rejected';

/** What the One Local server gets back for one check (maps onto rider_documents). */
export interface KycResult {
  kind: KycKind;
  status: KycStatus;
  numberMasked: string | null;
  /** Why it is pending or rejected, in plain words for the rider. */
  reason: string | null;
  expiresOn: string | null;
  verifiedAt: string | null;
  /** Non-sensitive facts for operations (name match, vehicle model …). */
  details: Record<string, string | number | boolean | null>;
}

export interface KycProfile {
  riderId: string;
  /** Name as on Aadhaar (DigiLocker). */
  legalName: string | null;
  /** YYYY-MM-DD, from Aadhaar — used for the driving licence check. */
  dob: string | null;
  gender: string | null;
  aadhaarLast4: string | null;
  aadhaarVerifiedAt: string | null;
  digilockerVerificationId: string | null;
  digilockerStartedAt: string | null;
  /** AES-GCM encrypted base64 JPEG/PNG of the Aadhaar photo; cleared after the face match or 24 h. */
  aadhaarPhotoEnc: string | null;
  aadhaarPhotoAt: string | null;
  panMasked: string | null;
  panVerifiedAt: string | null;
  livenessScore: number | null;
  faceMatchScore: number | null;
  selfieVerifiedAt: string | null;
  dlMasked: string | null;
  dlVerifiedAt: string | null;
  dlExpiresOn: string | null;
  rcNumber: string | null;
  rcVerifiedAt: string | null;
  rcExpiresOn: string | null;
  updatedAt: string;
}

/** Audit row per Cashfree call (no document numbers or images). Also drives the attempt limit. */
export interface KycCheck {
  id: string;
  riderId: string;
  kind: KycKind;
  verificationId: string;
  status: KycStatus | 'error';
  reason: string | null;
  referenceId: string | null;
  createdAt: string;
}

export interface KycStore {
  getProfile(riderId: string): Promise<KycProfile | null>;
  /** Insert or replace the rider's profile. */
  saveProfile(profile: KycProfile): Promise<void>;
  insertCheck(check: KycCheck): Promise<void>;
  countChecks(riderId: string, kind: KycKind, sinceIso: string): Promise<number>;
}

export type KycErrorCode = 'validation' | 'provider_error' | 'rate_limited' | 'unauthorized' | 'unconfigured' | 'not_found';

export class KycError extends Error {
  readonly code: KycErrorCode;
  readonly status: number;
  readonly meta?: Record<string, unknown>;
  constructor(code: KycErrorCode, message: string, status = 400, meta?: Record<string, unknown>) {
    super(message);
    this.name = 'KycError';
    this.code = code;
    this.status = status;
    this.meta = meta;
  }
}

export const emptyProfile = (riderId: string, nowIso: string): KycProfile => ({
  riderId,
  legalName: null,
  dob: null,
  gender: null,
  aadhaarLast4: null,
  aadhaarVerifiedAt: null,
  digilockerVerificationId: null,
  digilockerStartedAt: null,
  aadhaarPhotoEnc: null,
  aadhaarPhotoAt: null,
  panMasked: null,
  panVerifiedAt: null,
  livenessScore: null,
  faceMatchScore: null,
  selfieVerifiedAt: null,
  dlMasked: null,
  dlVerifiedAt: null,
  dlExpiresOn: null,
  rcNumber: null,
  rcVerifiedAt: null,
  rcExpiresOn: null,
  updatedAt: nowIso,
});
