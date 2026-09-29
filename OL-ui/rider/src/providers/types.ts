import type {
  CashDeposit,
  CashSummary,
  DeclineReason,
  EarningsSummary,
  ExceptionInput,
  ExceptionResponse,
  GeoZone,
  Hub,
  HubInput,
  Job,
  JobDetail,
  JobEarnings,
  JobHistoryItem,
  KycDocumentInput,
  Offer,
  Paginated,
  PayoutInput,
  PayoutMethod,
  PayoutTransfer,
  WalletSummary,
  PickupVerifyInput,
  PickupVerifyResult,
  ProfileInput,
  ProofInput,
  ProofResult,
  RegisterInput,
  Rider,
  RiderDocument,
  RiderMe,
  RiderNotification,
  RiderPreferences,
  RiderStatus,
  RiderType,
  RiderVehicle,
  SosResult,
  StatusInfo,
  StepInput,
  StoreLink,
  TrackPoint,
  VehicleInput,
  ZoneLookup,
  MessageReceipt,
  OtpDelivery,
} from '@/types';

export interface AuthSession {
  userId: string;
  phone: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  isNewUser?: boolean;
}

export interface OtpChallenge {
  phone: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  /** WhatsApp or SMS (the server falls back to SMS when the number is not on WhatsApp). */
  delivery?: OtpDelivery;
  /** Local demo only — never returned by production providers. */
  demoCode?: string;
}

export interface SendOtpOptions {
  /** "Resend" — the server sends this one by SMS when WhatsApp was just used. */
  resend?: boolean;
}

/** Phone + OTP authentication (Supabase phone auth in production, deterministic demo locally). */
export interface AuthProvider {
  readonly kind: 'demo' | 'supabase';
  restoreSession(): Promise<AuthSession | null>;
  sendOtp(phone: string, options?: SendOtpOptions): Promise<OtpChallenge>;
  verifyOtp(phone: string, code: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string | null>;
}

export interface AvailabilityInput {
  online: boolean;
  lat: number;
  lng: number;
  accuracyM: number;
}

export interface HeartbeatInput {
  lat: number;
  lng: number;
  accuracyM: number;
  battery?: number;
  appState: 'active' | 'background' | 'inactive';
}

export interface SosInput {
  jobId?: string;
  lat: number;
  lng: number;
}

/** Every operation the app performs against the One Local server under /api/rider/* and /api/geo/*. */
export interface RiderDataProvider {
  readonly kind: 'local_demo' | 'one_local_api';

  // ── Onboarding (§5.1) ─────────────────────────────────────────────
  register(input: RegisterInput): Promise<{ riderId: string; status: RiderStatus }>;
  updateProfile(input: ProfileInput): Promise<Rider>;
  lookupZone(lat: number, lng: number): Promise<ZoneLookup>;
  listZones(cityId: string): Promise<GeoZone[]>;
  setHub(input: HubInput): Promise<Hub>;
  setType(type: RiderType): Promise<Rider>;
  linkStore(inviteCode: string): Promise<StoreLink>;
  startDigilocker(): Promise<{ redirectUrl: string }>;
  submitDocument(input: KycDocumentInput): Promise<RiderDocument>;
  setVehicle(input: VehicleInput): Promise<RiderVehicle>;
  setPreferences(input: RiderPreferences): Promise<RiderPreferences>;
  setPayout(input: PayoutInput): Promise<PayoutMethod>;
  submitApplication(): Promise<StatusInfo>;
  getStatus(): Promise<StatusInfo>;
  createUpload(kind: string, contentType: string, localUri: string): Promise<{ assetId: string }>;

  // ── Working day (§5.2) ────────────────────────────────────────────
  getMe(): Promise<RiderMe>;
  setAvailability(input: AvailabilityInput, idempotencyKey?: string): Promise<{ online: boolean }>;
  heartbeat(input: HeartbeatInput): Promise<{ ok: true; serverTime: string }>;
  setPushToken(token: string, platform: string): Promise<void>;

  getCurrentOffer(): Promise<Offer | null>;
  acceptOffer(offerId: string, idempotencyKey?: string): Promise<Job>;
  declineOffer(offerId: string, reason: DeclineReason, idempotencyKey?: string): Promise<void>;

  getCurrentJob(): Promise<Job | null>;
  getJob(id: string): Promise<Job>;
  getJobDetail(id: string): Promise<JobDetail>;
  step(id: string, input: StepInput, idempotencyKey?: string): Promise<Job>;
  verifyPickup(id: string, input: PickupVerifyInput, idempotencyKey?: string): Promise<PickupVerifyResult>;
  track(id: string, points: TrackPoint[]): Promise<void>;
  submitProof(id: string, input: ProofInput, idempotencyKey?: string): Promise<ProofResult>;
  raiseException(id: string, input: ExceptionInput, idempotencyKey?: string): Promise<ExceptionResponse>;
  resolveWait(id: string, kind: 'not_ready' | 'unavailable', outcome: 'continue' | 'escalate'): Promise<ExceptionResponse>;
  sos(input: SosInput, idempotencyKey?: string): Promise<SosResult>;
  getCallNumber(id: string): Promise<{ number: string }>;
  /** Re-sends the customer's delivery OTP (WhatsApp → SMS). The rider never sees the number. */
  resendDeliveryOtp(id: string): Promise<MessageReceipt>;

  // ── Money & history (§5.3) ────────────────────────────────────────
  getEarnings(range: 'today' | 'week' | 'month'): Promise<EarningsSummary>;
  getJobEarnings(id: string): Promise<{ earnings: JobEarnings; job: JobHistoryItem }>;
  listJobs(cursor?: string): Promise<Paginated<JobHistoryItem>>;
  getStatementUrl(week: string): Promise<string>;
  /** Emails the weekly statement to the rider's email on file. */
  emailStatement(week: string): Promise<MessageReceipt>;
  getCash(): Promise<CashSummary>;
  /**
   * Starts a UPI payment of cash in hand (Cashfree Payment Gateway on the server). The same
   * idempotency key always returns the same checkout, so a retry never charges twice.
   */
  createCashDeposit(amount: number, idempotencyKey: string): Promise<CashDeposit>;
  getCashDeposit(id: string): Promise<CashDeposit>;
  /** Balance, withdrawal limits, the verified payout account and recent transfers. */
  getWallet(): Promise<WalletSummary>;
  listPayouts(cursor?: string): Promise<Paginated<PayoutTransfer>>;
  getPayout(id: string): Promise<PayoutTransfer>;
  /**
   * Instant withdrawal to the verified account (Cashfree Payouts on the server). The same
   * idempotency key always maps to the same transfer, so retrying after a timeout never pays twice.
   */
  requestWithdrawal(amount: number, idempotencyKey: string): Promise<PayoutTransfer>;
  listNotifications(cursor?: string): Promise<Paginated<RiderNotification>>;
  markNotificationsRead(ids: string[]): Promise<void>;
}
