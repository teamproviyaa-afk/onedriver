/**
 * Database / server DTOs (snake_case, spec §5 and §6). The UI never touches
 * these — `mappers.ts` converts them into domain models.
 */
export interface PlaceDto {
  lat: number;
  lng: number;
  accuracy_m?: number;
  source?: string;
  confidence?: number;
}

export interface JobDto {
  id: string;
  order_ref: string;
  state: string;
  version: number;
  category: string;
  city_id: string;
  pickup_zone: string;
  drop_zone: string;
  pickup: PlaceDto & { name: string; address: string; area?: string; entrance_note?: string; phone_masked?: boolean; store_id?: string };
  drop: PlaceDto & {
    area: string;
    address?: string | null;
    landmark?: string;
    customer_first_name: string;
    instructions?: string;
    flat_floor?: string;
  };
  items?: { id: string; name: string; qty: number; sku?: string }[];
  items_count: number;
  cash_to_collect: number;
  proof_methods: string[];
  payout_estimate: number;
  surge_multiplier?: number;
  eta: { to_pickup_min: number; to_drop_min: number };
  distance_km: number;
  pickup_distance_km?: number;
  deadlines?: { pickup_by?: string; drop_by?: string };
  merchant_note?: string;
  otp_attempts?: number;
  otp_locked?: boolean;
  otp_delivery?: MessageReceiptDto;
  rider_id?: string;
  accepted_at?: string;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
  failure_reason?: string;
  flags?: string[];
}

export interface OfferDto {
  offer_id: string;
  job: JobDto;
  mode?: 'auto' | 'manual';
  round?: number;
  payout_estimate: number;
  surge_multiplier: number;
  pickup: { name: string; area: string; distance_km: number };
  drop: { area: string; distance_km: number };
  eta_min: number;
  note?: string;
  offered_at?: string;
  expires_at: string;
}

export interface RiderDto {
  id: string;
  rider_code?: string;
  user_id: string;
  phone: string;
  full_name: string;
  photo_asset_id?: string;
  emergency_phone?: string;
  email?: string;
  language?: string;
  type: string;
  status: string;
  status_reason?: string;
  city_id?: string;
  zone_id?: string;
  hub_id?: string;
  organization_id?: string;
  acceptance: string;
  categories: string[];
  multi_store: boolean;
  store_ids?: string[];
  cash_limit?: number;
  referral_code?: string;
  tier?: string;
  created_at: string;
  updated_at: string;
}

export interface MeDto {
  rider: RiderDto;
  zone?: { id: string; city_id: string; name: string; boundary?: { lat: number; lng: number }[]; neighbours?: string[]; active?: boolean };
  hub?: { id: string; zone_id: string; kind: string; name?: string; lat: number; lng: number; address?: string; landmark?: string; accuracy_m?: number; source?: string; entrance_note?: string; store_id?: string };
  vehicle?: { class: string; ownership: string; registration_no: string; model?: string; rc_document_id?: string };
  documents?: { id: string; kind: string; status: string; number_masked?: string; source?: string; expires_on?: string; rejection_reason?: string }[];
  store_links?: { store_id: string; store_name: string; organization: string; zone_name?: string; manager_name?: string; daily_pay_text?: string; priority: number; status: string; payout_multiplier?: number }[];
  cash_in_hand: number;
  cash_limit: number;
  online: boolean;
  today: { earnings: number; jobs: number };
  yesterday: { earnings: number; jobs: number };
}

export interface EarningsDto {
  range: 'today' | 'week' | 'month';
  total: number;
  deliveries: number;
  average_per_trip: number;
  split: { order_pay: number; milestone_bonus: number; tips: number; peak_incentive?: number };
  series: { date: string; label: string; total: number; jobs: number }[];
  insights?: { title: string; body: string; tone?: 'positive' | 'neutral' | 'warning' }[];
  period_label: string;
  rule_version: number;
}

export interface JobEarningsDto {
  job_id: string;
  base: number;
  distance: number;
  peak: number;
  wait: number;
  tip: number;
  bonus: number;
  total: number;
  rule_version: number;
  distance_km: number;
  wait_minutes?: number;
  created_at: string;
}

export interface NotificationDto {
  id: string | number;
  kind: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  read_at?: string | null;
  created_at: string;
}

export interface ErrorDto {
  detail: string;
  code: string;
}

/** Response of the messaging endpoints (otp/resend, statements/:week/email, sos). */
export interface MessageReceiptDto {
  channel: 'whatsapp' | 'sms' | 'email' | null;
  status: 'sent' | 'failed' | 'skipped';
  fallback_used: boolean;
  fallback_reason?: string;
  fallback_pending?: boolean;
  to_masked?: string;
  sent_at: string;
  resend_after_seconds?: number;
}

export interface SosResultDto {
  contact_alert?: MessageReceiptDto | null;
}
