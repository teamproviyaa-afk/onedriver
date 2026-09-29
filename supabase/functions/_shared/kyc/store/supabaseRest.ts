/** KycStore on Supabase Postgres (PostgREST, service key). Tables are RLS-locked from clients. */
import type { KycCheck, KycProfile, KycStore } from '../types.ts';
import type { FetchLike } from '../../messaging/providers/http.ts';

const PROFILE_COLS: Record<keyof KycProfile, string> = {
  riderId: 'rider_id', legalName: 'legal_name', dob: 'dob', gender: 'gender', aadhaarLast4: 'aadhaar_last4',
  aadhaarVerifiedAt: 'aadhaar_verified_at', digilockerVerificationId: 'digilocker_verification_id', digilockerStartedAt: 'digilocker_started_at',
  aadhaarPhotoEnc: 'aadhaar_photo_enc', aadhaarPhotoAt: 'aadhaar_photo_at', panMasked: 'pan_masked', panVerifiedAt: 'pan_verified_at',
  livenessScore: 'liveness_score', faceMatchScore: 'face_match_score', selfieVerifiedAt: 'selfie_verified_at', dlMasked: 'dl_masked',
  dlVerifiedAt: 'dl_verified_at', dlExpiresOn: 'dl_expires_on', rcNumber: 'rc_number', rcVerifiedAt: 'rc_verified_at',
  rcExpiresOn: 'rc_expires_on', updatedAt: 'updated_at',
};
const CHECK_COLS: Record<keyof KycCheck, string> = {
  id: 'id', riderId: 'rider_id', kind: 'kind', verificationId: 'verification_id', status: 'status', reason: 'reason',
  referenceId: 'reference_id', createdAt: 'created_at',
};
const TS = new Set(['aadhaar_verified_at', 'digilocker_started_at', 'aadhaar_photo_at', 'pan_verified_at', 'selfie_verified_at', 'dl_verified_at', 'rc_verified_at', 'updated_at', 'created_at']);
const NUM = new Set(['liveness_score', 'face_match_score']);

const toRow = (obj: object, cols: Record<string, string>) => {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (cols[k] && v !== undefined) row[cols[k]] = v;
  return row;
};
const fromRow = <T>(row: Record<string, unknown>, cols: Record<string, string>): T => {
  const out: Record<string, unknown> = {};
  for (const [k, c] of Object.entries(cols)) {
    const v = row[c];
    out[k] = TS.has(c) && typeof v === 'string' ? new Date(v).toISOString() : NUM.has(c) && v !== null && v !== undefined ? Number(v) : (v ?? null);
  }
  return out as T;
};
const q = encodeURIComponent;

export const createSupabaseKycStore = (cfg: { url: string; serviceKey: string; fetch?: FetchLike }): KycStore => {
  const fetchFn: FetchLike = cfg.fetch ?? ((i, init) => fetch(i, init));
  const base = `${cfg.url.replace(/\/$/, '')}/rest/v1`;
  const call = async (method: string, path: string, body?: unknown, prefer?: string) =>
    fetchFn(`${base}/${path}`, {
      method,
      headers: {
        apikey: cfg.serviceKey,
        ...(cfg.serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${cfg.serviceKey}` } : {}),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const check = async (res: Response, what: string) => {
    if (!res.ok) throw new Error(`Supabase ${what} failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 200)}`);
  };

  return {
    async getProfile(riderId) {
      const res = await call('GET', `kyc_profiles?rider_id=eq.${q(riderId)}&limit=1`);
      await check(res, 'get kyc profile');
      const rows = (await res.json().catch(() => [])) as Record<string, unknown>[];
      return Array.isArray(rows) && rows[0] ? fromRow<KycProfile>(rows[0], PROFILE_COLS) : null;
    },
    async saveProfile(p) {
      await check(await call('POST', 'kyc_profiles?on_conflict=rider_id', toRow(p, PROFILE_COLS), 'resolution=merge-duplicates,return=minimal'), 'save kyc profile');
    },
    async insertCheck(c) {
      await check(await call('POST', 'kyc_checks', toRow(c, CHECK_COLS), 'return=minimal'), 'insert kyc check');
    },
    async countChecks(riderId, kind, sinceIso) {
      const res = await call('GET', `kyc_checks?select=id&rider_id=eq.${q(riderId)}&kind=eq.${q(kind)}&created_at=gte.${q(sinceIso)}`, undefined, 'count=exact');
      await check(res, 'count kyc checks');
      const range = res.headers.get('content-range') ?? '';
      const total = Number(range.split('/')[1]);
      if (Number.isFinite(total)) return total;
      const rows = (await res.json().catch(() => [])) as unknown[];
      return Array.isArray(rows) ? rows.length : 0;
    },
  };
};
