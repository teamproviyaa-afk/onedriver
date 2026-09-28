/**
 * OneLocalApiProvider — talks to the One Local server under /api/rider/* and
 * /api/geo/* (spec §5). Activated when PROVIYAA_API_BASE_URL is set.
 * Privileged operations (pricing, geofence decisions, state) are decided by the server.
 */
import { HttpClient } from '@/api/httpClient';
import type { EarningsDto, JobDto, JobEarningsDto, MeDto, MessageReceiptDto, NotificationDto, OfferDto, PayoutMethodDto, PayoutTransferDto, SosResultDto, WalletDto } from '@/api/dto';
import { mapEarnings, mapJob, mapJobEarnings, mapMe, mapMessageReceipt, mapNotification, mapOffer, mapPayoutMethod, mapPayoutTransfer, mapRider, mapWallet } from '@/api/mappers';
import type {
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
  StatusInfo,
  WalletSummary,
  StepInput,
  StoreLink,
  TrackPoint,
  VehicleInput,
  ZoneLookup,
  MessageReceipt,
  SosResult,
} from '@/types';
import type { AvailabilityInput, HeartbeatInput, RiderDataProvider, SosInput } from './types';

export class OneLocalApiProvider implements RiderDataProvider {
  readonly kind = 'one_local_api' as const;
  private readonly http: HttpClient;

  constructor(baseUrl: string, getAccessToken: () => Promise<string | null>) {
    this.http = new HttpClient({ baseUrl, getAccessToken });
  }

  // Onboarding
  async register(input: RegisterInput) {
    const r = await this.http.post<{ rider_id: string; status: string }>('/rider/register', {
      full_name: input.fullName,
      referral_code: input.referralCode,
    });
    return { riderId: r.rider_id, status: r.status as RiderStatus };
  }
  async updateProfile(input: ProfileInput): Promise<Rider> {
    const r = await this.http.put<Parameters<typeof mapRider>[0]>('/rider/profile', {
      full_name: input.fullName,
      photo_asset_id: input.photoAssetId,
      emergency_phone: input.emergencyPhone,
      email: input.email,
      language: input.language,
    });
    return mapRider(r);
  }
  async lookupZone(lat: number, lng: number): Promise<ZoneLookup> {
    const r = await this.http.get<{ status?: string; state?: unknown; city?: unknown; zone?: unknown; neighbours?: unknown[] } | { code: 'out_of_zone' }>('/geo/zones', { lat, lng });
    if ('code' in r && r.code === 'out_of_zone') return { status: 'out_of_zone' };
    const z = r as { state: ZoneLookup extends { status: 'in_zone' } ? never : never } & Record<string, unknown>;
    return {
      status: 'in_zone',
      state: z.state as never,
      city: z.city as never,
      zone: z.zone as never,
      neighbours: (z.neighbours as never[]) ?? [],
    };
  }
  listZones(cityId: string): Promise<GeoZone[]> {
    return this.http.get<GeoZone[]>(`/geo/cities/${encodeURIComponent(cityId)}/zones`);
  }
  setHub(input: HubInput): Promise<Hub> {
    return this.http.put<Hub>('/rider/hub', { zone_id: input.zoneId, lat: input.lat, lng: input.lng, address: input.address, landmark: input.landmark });
  }
  async setType(type: RiderType): Promise<Rider> {
    return mapRider(await this.http.put<Parameters<typeof mapRider>[0]>('/rider/type', { type }));
  }
  async linkStore(inviteCode: string): Promise<StoreLink> {
    const r = await this.http.post<{ organization: string; store: { id: string; name: string; zone?: string }; manager_name: string; daily_pay_text: string }>('/rider/store-link', { invite_code: inviteCode });
    return { storeId: r.store.id, storeName: r.store.name, organization: r.organization, zoneName: r.store.zone ?? '', managerName: r.manager_name, dailyPayText: r.daily_pay_text, priority: 1, status: 'active' };
  }
  startDigilocker(): Promise<{ redirectUrl: string }> {
    return this.http.post<{ redirect_url: string }>('/rider/kyc/digilocker/start').then((r) => ({ redirectUrl: r.redirect_url }));
  }
  submitDocument(input: KycDocumentInput): Promise<RiderDocument> {
    return this.http.post<RiderDocument>('/rider/kyc/documents', { kind: input.kind, asset_id: input.assetId, number: input.number, source: input.source });
  }
  setVehicle(input: VehicleInput): Promise<RiderVehicle> {
    return this.http.put<RiderVehicle>('/rider/vehicle', { class: input.class, ownership: input.ownership, registration_no: input.registrationNo, rc_asset_id: input.rcAssetId });
  }
  setPreferences(input: RiderPreferences): Promise<RiderPreferences> {
    return this.http.put<RiderPreferences>('/rider/preferences', { categories: input.categories, acceptance: input.acceptance, multi_store: input.multiStore, store_ids: input.storeIds });
  }
  setPayout(input: PayoutInput): Promise<PayoutMethod> {
    const body = input.method === 'bank' ? { method: 'bank', holder: input.holder, account_no: input.accountNo, ifsc: input.ifsc } : { method: 'upi', vpa: input.vpa };
    // The server verifies the account with Cashfree (bank / UPI name match) before saving it.
    return this.http.put<PayoutMethodDto>('/rider/payout', body).then(mapPayoutMethod);
  }
  async submitApplication(): Promise<StatusInfo> {
    await this.http.post('/rider/submit');
    return this.getStatus();
  }
  async getStatus(): Promise<StatusInfo> {
    const r = await this.http.get<{ status: string; reason?: string; expired_documents?: string[]; eta_text?: string }>('/rider/status');
    return { status: r.status as RiderStatus, reason: r.reason, expiredDocuments: (r.expired_documents ?? []) as StatusInfo['expiredDocuments'], etaText: r.eta_text };
  }
  async createUpload(kind: string, contentType: string, localUri: string): Promise<{ assetId: string }> {
    const r = await this.http.post<{ asset_id: string; upload_url: string }>('/rider/uploads', { kind, content_type: contentType });
    const blob = await (await fetch(localUri)).blob();
    const put = await fetch(r.upload_url, { method: 'PUT', headers: { 'content-type': contentType }, body: blob });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    return { assetId: r.asset_id };
  }

  // Working day
  async getMe(): Promise<RiderMe> {
    return mapMe(await this.http.get<MeDto>('/rider/me'));
  }
  setAvailability(input: AvailabilityInput, idempotencyKey?: string) {
    return this.http.post<{ online: boolean }>('/rider/availability', { online: input.online, lat: input.lat, lng: input.lng, accuracy_m: input.accuracyM }, idempotencyKey);
  }
  heartbeat(input: HeartbeatInput) {
    return this.http.post<{ ok: true; server_time: string }>('/rider/heartbeat', { lat: input.lat, lng: input.lng, accuracy_m: input.accuracyM, battery: input.battery, app_state: input.appState }).then((r) => ({ ok: true as const, serverTime: r.server_time }));
  }
  async setPushToken(token: string, platform: string) {
    await this.http.put('/rider/push-token', { expo_push_token: token, platform });
  }
  async getCurrentOffer(): Promise<Offer | null> {
    const r = await this.http.get<OfferDto | undefined>('/rider/offers/current');
    return r ? mapOffer(r) : null;
  }
  async acceptOffer(offerId: string, idempotencyKey?: string): Promise<Job> {
    return mapJob(await this.http.post<JobDto>(`/rider/offers/${offerId}/accept`, {}, idempotencyKey));
  }
  async declineOffer(offerId: string, reason: DeclineReason, idempotencyKey?: string) {
    await this.http.post(`/rider/offers/${offerId}/decline`, { reason }, idempotencyKey);
  }
  async getCurrentJob(): Promise<Job | null> {
    const r = await this.http.get<JobDto | undefined>('/rider/jobs/current');
    return r ? mapJob(r) : null;
  }
  async getJob(id: string): Promise<Job> {
    return mapJob(await this.http.get<JobDto>(`/rider/jobs/${id}`));
  }
  async getJobDetail(id: string): Promise<JobDetail> {
    const r = await this.http.get<{ job: JobDto; events: JobDetail['events']; proof?: JobDetail['proof']; pickup_check?: JobDetail['pickupCheck']; earnings?: JobEarningsDto }>(`/rider/jobs/${id}`, { detail: true });
    return { job: mapJob(r.job), events: r.events ?? [], proof: r.proof, pickupCheck: r.pickup_check, earnings: r.earnings ? mapJobEarnings(r.earnings) : undefined };
  }
  async step(id: string, input: StepInput, idempotencyKey?: string): Promise<Job> {
    return mapJob(await this.http.post<JobDto>(`/rider/jobs/${id}/step`, { to: input.to, version: input.version, lat: input.lat, lng: input.lng, accuracy_m: input.accuracyM, reason: input.reason }, idempotencyKey));
  }
  async verifyPickup(id: string, input: PickupVerifyInput, idempotencyKey?: string): Promise<PickupVerifyResult> {
    const r = await this.http.post<{ result: string; expected_sku?: string; scanned?: string; missing?: JobDetail['job']['items']; job: JobDto }>(`/rider/jobs/${id}/pickup/verify`, { method: input.method, code: input.code, items: input.items, reason: input.reason, version: input.version }, idempotencyKey);
    const job = mapJob(r.job);
    if (r.result === 'mismatch') return { result: 'mismatch', expectedSku: r.expected_sku ?? '', scanned: r.scanned ?? input.code ?? '', job };
    if (r.result === 'incomplete') return { result: 'incomplete', missing: r.missing ?? [], job };
    return { result: 'verified', job };
  }
  async track(id: string, points: TrackPoint[]) {
    await this.http.post(`/rider/jobs/${id}/track`, { points: points.slice(-60).map((p) => ({ lat: p.lat, lng: p.lng, accuracy_m: p.accuracyM, speed: p.speed, heading: p.heading, recorded_at: p.recordedAt })) });
  }
  async submitProof(id: string, input: ProofInput, idempotencyKey?: string): Promise<ProofResult> {
    const body = input.method === 'otp' ? { method: 'otp', code: input.code } : { method: input.method, asset_id: input.assetId };
    const r = await this.http.post<{ job: JobDto; earnings: JobEarningsDto; flagged?: boolean; distance_from_drop_m?: number }>(`/rider/jobs/${id}/proof`, { ...body, version: input.version, lat: input.lat, lng: input.lng, cash_collected: input.cashCollected }, idempotencyKey);
    return { job: mapJob(r.job), earnings: mapJobEarnings(r.earnings), flagged: r.flagged, distanceFromDropM: r.distance_from_drop_m };
  }
  raiseException(id: string, input: ExceptionInput, idempotencyKey?: string): Promise<ExceptionResponse> {
    return this.http.post<ExceptionResponse>(`/rider/jobs/${id}/exception`, { kind: input.kind, note: input.note, asset_id: input.assetId, lat: input.lat, lng: input.lng, corrected_lat: input.correctedLat, corrected_lng: input.correctedLng, version: input.version }, idempotencyKey);
  }
  resolveWait(id: string, kind: 'not_ready' | 'unavailable', outcome: 'continue' | 'escalate'): Promise<ExceptionResponse> {
    return this.http.post<ExceptionResponse>(`/rider/jobs/${id}/exception/resolve`, { kind, outcome });
  }
  async sos(input: SosInput, idempotencyKey?: string): Promise<SosResult> {
    const r = await this.http.post<SosResultDto | undefined>('/rider/sos', { job_id: input.jobId, lat: input.lat, lng: input.lng }, idempotencyKey);
    return { contactAlert: r?.contact_alert ? mapMessageReceipt(r.contact_alert) : null };
  }
  /** Server re-sends the customer's delivery OTP (WhatsApp → SMS); 429 rate_limited on cooldown. */
  async resendDeliveryOtp(id: string): Promise<MessageReceipt> {
    return mapMessageReceipt(await this.http.post<MessageReceiptDto>(`/rider/jobs/${id}/otp/resend`));
  }
  getCallNumber(id: string): Promise<{ number: string }> {
    return this.http.post<{ number: string }>(`/rider/jobs/${id}/call`);
  }

  // Money
  async getEarnings(range: 'today' | 'week' | 'month'): Promise<EarningsSummary> {
    return mapEarnings(await this.http.get<EarningsDto>('/rider/earnings', { range }));
  }
  async getJobEarnings(id: string): Promise<{ earnings: JobEarnings; job: JobHistoryItem }> {
    const r = await this.http.get<{ earnings: JobEarningsDto; job: JobHistoryItem }>(`/rider/earnings/jobs/${id}`);
    return { earnings: mapJobEarnings(r.earnings), job: r.job };
  }
  listJobs(cursor?: string): Promise<Paginated<JobHistoryItem>> {
    return this.http.get<{ items: JobHistoryItem[]; next_cursor?: string | null }>('/rider/jobs', { cursor }).then((r) => ({ items: r.items, nextCursor: r.next_cursor ?? null }));
  }
  async emailStatement(week: string): Promise<MessageReceipt> {
    return mapMessageReceipt(await this.http.post<MessageReceiptDto>(`/rider/statements/${week}/email`));
  }
  async getStatementUrl(week: string): Promise<string> {
    return `${(this.http as unknown as { baseUrl: string }).baseUrl}/rider/statements/${week}.pdf`;
  }
  getCash(): Promise<CashSummary> {
    return this.http.get<{ cash_in_hand: number; cash_limit: number; ledger: CashSummary['ledger']; deposit_instructions: string }>('/rider/cash').then((r) => ({ cashInHand: r.cash_in_hand, cashLimit: r.cash_limit, blocked: r.cash_in_hand >= r.cash_limit, ledger: r.ledger, depositInstructions: r.deposit_instructions }));
  }
  getWallet(): Promise<WalletSummary> {
    return this.http.get<WalletDto>('/rider/wallet').then(mapWallet);
  }
  listPayouts(cursor?: string): Promise<Paginated<PayoutTransfer>> {
    return this.http.get<{ items: PayoutTransferDto[]; next_cursor?: string | null }>('/rider/payouts', { cursor }).then((r) => ({ items: r.items.map(mapPayoutTransfer), nextCursor: r.next_cursor ?? null }));
  }
  getPayout(id: string): Promise<PayoutTransfer> {
    return this.http.get<PayoutTransferDto>(`/rider/payouts/${encodeURIComponent(id)}`).then(mapPayoutTransfer);
  }
  /** The server forwards the Idempotency-Key to Cashfree as the transfer id seed — a retry never pays twice. */
  requestWithdrawal(amount: number, idempotencyKey: string): Promise<PayoutTransfer> {
    return this.http.post<PayoutTransferDto>('/rider/payouts/withdraw', { amount }, idempotencyKey).then(mapPayoutTransfer);
  }
  listNotifications(cursor?: string): Promise<Paginated<RiderNotification>> {
    return this.http.get<{ items: NotificationDto[]; next_cursor?: string | null }>('/rider/notifications', { cursor }).then((r) => ({ items: r.items.map(mapNotification), nextCursor: r.next_cursor ?? null }));
  }
  async markNotificationsRead(ids: string[]) {
    await this.http.post('/rider/notifications/read', { ids });
  }
}
