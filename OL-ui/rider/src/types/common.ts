export type Id = string;
export type IsoDate = string;
export type Rupees = number;

/** Machine error codes returned by the One Local server (spec §5). */
export type ApiErrorCode =
  | 'not_enrolled'
  | 'suspended'
  | 'cash_limit'
  | 'offer_expired'
  | 'already_taken'
  | 'version_conflict'
  | 'too_far'
  | 'otp_invalid'
  | 'otp_locked'
  | 'out_of_zone'
  | 'invalid_transition'
  | 'not_found'
  | 'unauthorized'
  | 'network'
  | 'coming_soon'
  | 'validation'
  | 'rate_limited'
  | 'unknown';

export interface ApiErrorShape {
  detail: string;
  code: ApiErrorCode;
  status?: number;
  meta?: Record<string, unknown>;
}

export class ApiError extends Error implements ApiErrorShape {
  readonly code: ApiErrorCode;
  readonly detail: string;
  readonly status?: number;
  readonly meta?: Record<string, unknown>;

  constructor(shape: ApiErrorShape) {
    super(shape.detail);
    this.name = 'ApiError';
    this.code = shape.code;
    this.detail = shape.detail;
    this.status = shape.status;
    this.meta = shape.meta;
  }

  static is(e: unknown, code?: ApiErrorCode): e is ApiError {
    return e instanceof ApiError && (code === undefined || e.code === code);
  }
}

export type Result<T, E = ApiError> = { ok: true; value: T } | { ok: false; error: E };

export interface Paginated<T> {
  items: T[];
  nextCursor?: string | null;
}
