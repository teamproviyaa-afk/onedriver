/**
 * LocalDemoProvider — a deterministic, fully offline "server" for DATA_MODE=local_demo.
 *
 * It implements the same RiderDataProvider contract as the One Local API provider,
 * enforces the 12-state engine, versions, geofences, OTP rules, dispatch rounds,
 * cash limits and privacy rules locally, and persists its world to AsyncStorage so
 * an app kill mid-job resumes correctly. Nothing here is a production rate or secret.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from '@/types';
import type {
  CashLedgerEntry,
  CashSummary,
  DeclineReason,
  DeliveryEvent,
  DeliveryException,
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
  JobState,
  KycDocumentInput,
  LatLng,
  Offer,
  Paginated,
  PayoutInput,
  PayoutMethod,
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
  StepInput,
  StoreLink,
  TrackPoint,
  VehicleInput,
  ZoneLookup,
} from '@/types';
import { canRaiseException, exceptionOutcome, isTerminal, transition, TransitionError } from '@/state-machine/deliveryStateMachine';
import { haversineM, pointInPolygon } from '@/domain/geo';
import { GEOFENCE, checkProofDistance } from '@/domain/geofence';
import { DISPATCH } from '@/domain/dispatch';
import { computeEarnings } from '@/domain/earnings';
import { cashLedgerBalance, canGoOnlineWithCash } from '@/domain/cash';
import { canCallCustomer } from '@/domain/privacy';
import { OTP } from '@/domain/otp';
import {
  DEMO_CITY,
  DEMO_DOCUMENTS,
  DEMO_EARNINGS_RULE,
  DEMO_PAYOUT,
  DEMO_STATE,
  DEMO_STORE_HUB,
  DEMO_STORE_LINK,
  DEMO_VEHICLE,
  DEMO_ZONES,
  LATUR_CENTER,
  PUNE_CENTER,
  makeDemoRider,
  makeHistory,
  makeLedger,
  makeNotifications,
  makePendingJobs,
  makeWeekSeries,
} from '@/demo/seed';
import {
  DEMO_OFFER_DELAY_SECONDS,
  DEMO_REOFFER_DELAY_SECONDS,
  DEMO_RETURNING_PHONE,
  DEMO_STATUS_STEP_SECONDS,
  DEMO_STORAGE_KEY,
  DEMO_STORE_INVITE_CODES,
} from '@/demo/constants';
import { newId } from '@/utils/ids';
import { isSameLocalDay } from '@/utils/time';
import { log } from '@/utils/logger';
import type { AvailabilityInput, HeartbeatInput, RiderDataProvider, SosInput } from './types';

export type DemoScenarioId =
  | 'manual_offer'
  | 'auto_accept'
  | 'order_not_ready'
  | 'mismatch'
  | 'incomplete'
  | 'vehicle_breakdown'
  | 'customer_unavailable'
  | 'wrong_address'
  | 'customer_refused'
  | 'otp_failed'
  | 'photo_proof'
  | 'signature_proof'
  | 'offline_job'
  | 'version_conflict'
  | 'cash_limit'
  | 'suspended_rider'
  | 'out_of_zone';

export interface DemoScenario {
  id: DemoScenarioId;
  title: string;
  description: string;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  { id: 'manual_offer', title: 'Manual Offer', description: 'Go online → 30 s offer for #9830 (Gourmet Kitchen). Accept / decline.' },
  { id: 'auto_accept', title: 'Auto Accept', description: 'Acceptance mode auto → #9824 is assigned instantly.' },
  { id: 'order_not_ready', title: 'Order Not Ready', description: 'At pickup the merchant is still preparing; wait timer + compensation.' },
  { id: 'mismatch', title: 'Package Mismatch', description: 'First pickup scan returns a different barcode.' },
  { id: 'incomplete', title: 'Package Incomplete', description: 'First pickup check reports a missing item.' },
  { id: 'vehicle_breakdown', title: 'Vehicle Breakdown', description: 'Report a breakdown on the way; job is re-dispatched.' },
  { id: 'customer_unavailable', title: 'Customer Unavailable', description: 'At drop the customer does not answer; mandatory wait then escalate.' },
  { id: 'wrong_address', title: 'Wrong Address', description: 'Low-confidence pin; share location / dispute.' },
  { id: 'customer_refused', title: 'Customer Refused', description: 'Customer rejects the package at handover; return to store.' },
  { id: 'otp_failed', title: 'OTP Failed', description: 'Enter 5 wrong OTPs → locked → photo fallback.' },
  { id: 'photo_proof', title: 'Photo Proof', description: 'Contactless order that requires a photo.' },
  { id: 'signature_proof', title: 'Signature Proof', description: 'Pick & Drop parcel that requires a signature.' },
  { id: 'offline_job', title: 'Offline Job', description: 'Network drops mid-job; steps are queued and replayed.' },
  { id: 'version_conflict', title: 'Version Conflict', description: 'Server has already advanced; the next step returns version_conflict.' },
  { id: 'cash_limit', title: 'Cash Limit', description: 'Cash in hand is above the city limit; GO ONLINE is blocked.' },
  { id: 'suspended_rider', title: 'Suspended Rider', description: 'Account suspended; access restricted.' },
  { id: 'out_of_zone', title: 'Out-of-zone Rider', description: 'Rider is outside every zone; going online is refused.' },
];

interface DemoFlags {
  versionConflictOnce?: boolean;
  mismatchOnce?: boolean;
  incompleteOnce?: boolean;
  notReady?: boolean;
  outOfZone?: boolean;
  forceAuto?: boolean;
  statusOverride?: RiderStatus;
}

interface StoredAsset {
  id: string;
  kind: string;
  contentType: string;
  localUri: string;
  createdAt: string;
}

interface DemoWorld {
  v: 1;
  phone: string | null;
  rider: Rider | null;
  documents: RiderDocument[];
  vehicle?: RiderVehicle;
  payout?: PayoutMethod;
  storeLinks: StoreLink[];
  hub?: Hub;
  zoneId?: string;
  online: boolean;
  lastPosition?: LatLng & { accuracyM: number; at: string };
  pushToken?: string;
  pendingJobs: Job[];
  jobs: Record<string, Job>;
  earnings: Record<string, JobEarnings>;
  events: DeliveryEvent[];
  exceptions: DeliveryException[];
  proofs: Record<string, { method: 'otp' | 'photo' | 'signature'; createdAt: string; distanceFromDropM?: number }>;
  pickupChecks: Record<string, { method: 'scan' | 'code' | 'bypass'; result: string; checkedAt: string }>;
  currentOffer: Offer | null;
  currentJobId: string | null;
  lastAcceptedOfferId?: string | null;
  nextDispatchAt: string | null;
  rounds: Record<string, number>;
  otpByJob: Record<string, string>;
  waits: Record<string, { kind: 'not_ready' | 'unavailable'; startedAt: string; seconds: number }>;
  notifications: RiderNotification[];
  ledger: CashLedgerEntry[];
  assets: StoredAsset[];
  submittedAt?: string;
  scenario: DemoScenarioId;
  flags: DemoFlags;
  sos: { at: string; jobId?: string; lat: number; lng: number }[];
}

type Listener = (event: { type: 'offer' | 'job' | 'notification' | 'status' | 'world' }) => void;

const iso = () => new Date().toISOString();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const DEMO_OTPS: Record<string, string> = { 'job-9830': '4821', 'job-9824': '7364', 'job-9825': '1905' };

const freshWorld = (phone: string | null): DemoWorld => ({
  v: 1,
  phone,
  rider: null,
  documents: [],
  storeLinks: [],
  online: false,
  pendingJobs: makePendingJobs(),
  jobs: {},
  earnings: {},
  events: [],
  exceptions: [],
  proofs: {},
  pickupChecks: {},
  currentOffer: null,
  currentJobId: null,
  nextDispatchAt: null,
  rounds: {},
  otpByJob: { ...DEMO_OTPS },
  waits: {},
  notifications: [],
  ledger: [],
  assets: [],
  scenario: 'manual_offer',
  flags: {},
  sos: [],
});

/** Seeds the returning demo rider (Rahul Sharma, approved Store Rider). */
const seedReturningRider = (w: DemoWorld): DemoWorld => {
  const world = { ...w };
  world.rider = makeDemoRider();
  world.documents = clone(DEMO_DOCUMENTS);
  world.vehicle = clone(DEMO_VEHICLE);
  world.payout = clone(DEMO_PAYOUT);
  world.storeLinks = [clone(DEMO_STORE_LINK)];
  world.hub = clone(DEMO_STORE_HUB);
  world.zoneId = 'latur-central';
  for (const h of makeHistory()) {
    world.jobs[h.job.id] = h.job;
    if (h.earnings) world.earnings[h.job.id] = h.earnings;
    world.events.push({ id: newId('ev'), jobId: h.job.id, fromState: 'proof', toState: h.job.state, actor: 'rider', createdAt: h.job.deliveredAt ?? h.job.updatedAt });
  }
  world.notifications = makeNotifications();
  world.ledger = makeLedger();
  return world;
};

export class LocalDemoProvider implements RiderDataProvider {
  readonly kind = 'local_demo' as const;
  private world: DemoWorld = freshWorld(null);
  private readonly ready: Promise<void>;
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.ready = this.load();
  }

  // ── Persistence & events ──────────────────────────────────────────
  private async load() {
    try {
      const raw = await AsyncStorage.getItem(DEMO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoWorld;
        if (parsed.v === 1) this.world = parsed;
      }
    } catch (e) {
      log.warn('demo world load failed', e);
    }
  }

  private save() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      AsyncStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(this.world)).catch((e) => log.warn('demo world save failed', e));
    }, 150);
  }

  onEvent(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(type: Parameters<Listener>[0]['type']) {
    for (const l of this.listeners) l({ type });
  }

  private touch(type: Parameters<Listener>[0]['type'] = 'world') {
    this.save();
    this.emit(type);
  }

  // ── Demo controls (development only) ──────────────────────────────
  getScenarios(): DemoScenario[] {
    return DEMO_SCENARIOS;
  }

  getScenario(): DemoScenarioId {
    return this.world.scenario;
  }

  /** Signs the demo world in for a phone: the returning phone gets the seeded approved rider. */
  async attachPhone(phone: string): Promise<void> {
    await this.ready;
    if (this.world.phone === phone && this.world.rider) return;
    this.world = phone === DEMO_RETURNING_PHONE ? seedReturningRider(freshWorld(phone)) : freshWorld(phone);
    this.touch('status');
  }

  async detachPhone(): Promise<void> {
    await this.ready;
    this.world = freshWorld(null);
    await AsyncStorage.removeItem(DEMO_STORAGE_KEY);
    this.emit('status');
  }

  async resetWorld(): Promise<void> {
    await this.ready;
    const phone = this.world.phone;
    this.world = phone === DEMO_RETURNING_PHONE ? seedReturningRider(freshWorld(phone)) : freshWorld(phone);
    this.touch('status');
  }

  async applyScenario(id: DemoScenarioId): Promise<void> {
    await this.ready;
    const w = this.world;
    // Reset the dispatch pipeline but keep history.
    w.scenario = id;
    w.flags = {};
    w.currentOffer = null;
    w.currentJobId = null;
    w.online = false;
    w.pendingJobs = makePendingJobs();
    w.rounds = {};
    w.waits = {};
    w.otpByJob = { ...DEMO_OTPS };
    w.ledger = w.ledger.filter((l) => l.note !== 'Demo: large COD batch');
    w.lastAcceptedOfferId = null;
    if (w.rider) {
      w.rider = { ...w.rider, status: 'approved', statusReason: undefined, preferences: { ...w.rider.preferences, acceptance: 'manual' } };
      w.documents = w.documents.map((d) => ({ ...d, status: 'verified' }));
    }
    const first = (jobId: string) => {
      const idx = w.pendingJobs.findIndex((j) => j.id === jobId);
      if (idx > 0) {
        const [j] = w.pendingJobs.splice(idx, 1);
        w.pendingJobs.unshift(j!);
      }
    };
    switch (id) {
      case 'auto_accept':
        first('job-9824');
        if (w.rider) w.rider.preferences.acceptance = 'auto';
        break;
      case 'order_not_ready':
        w.flags.notReady = true;
        break;
      case 'mismatch':
        w.flags.mismatchOnce = true;
        break;
      case 'incomplete':
        w.flags.incompleteOnce = true;
        break;
      case 'wrong_address':
        first('job-9825');
        break;
      case 'signature_proof':
        first('job-9825');
        break;
      case 'photo_proof':
        first('job-9830');
        w.pendingJobs[0] = { ...w.pendingJobs[0]!, proofMethods: ['photo'], drop: { ...w.pendingJobs[0]!.drop, instructions: 'Contactless — leave at the door and take a photo' } };
        break;
      case 'version_conflict':
        w.flags.versionConflictOnce = true;
        break;
      case 'cash_limit':
        w.ledger = [...w.ledger, { id: newId('l'), kind: 'collected', amount: 2400, createdAt: iso(), note: 'Demo: large COD batch' }];
        break;
      case 'suspended_rider':
        if (w.rider) w.rider = { ...w.rider, status: 'suspended', statusReason: 'Multiple customer complaints under review' };
        break;
      case 'out_of_zone':
        w.flags.outOfZone = true;
        break;
      default:
        break;
    }
    this.touch('status');
  }

  /** Dev helper: make the next offer appear immediately. */
  async forceDispatchNow(): Promise<void> {
    await this.ready;
    this.world.nextDispatchAt = iso();
    this.tick();
  }

  /** Dev helper: simulate the server advancing the job (another device / operations). */
  async simulateServerAdvance(): Promise<void> {
    await this.ready;
    this.world.flags.versionConflictOnce = true;
    this.touch('job');
  }

  /** Dev helper: expire a document so going online is blocked until it is re-uploaded. */
  async expireDocument(kind: RiderDocument['kind']): Promise<void> {
    await this.ready;
    this.world.documents = this.world.documents.map((d) => (d.kind === kind ? { ...d, status: 'expired', expiresOn: '2026-01-01' } : d));
    if (this.world.rider) this.world.rider = { ...this.world.rider, status: 'documents_expired', statusReason: `${kind.toUpperCase()} expired` };
    this.touch('status');
  }

  // ── Internal helpers ──────────────────────────────────────────────
  private requireRider(): Rider {
    const r = this.world.rider;
    if (!r) throw new ApiError({ code: 'not_enrolled', detail: 'Complete your rider application first', status: 403 });
    return r;
  }

  private requireApproved(): Rider {
    const r = this.requireRider();
    if (r.status === 'suspended') throw new ApiError({ code: 'suspended', detail: r.statusReason ?? 'Your account is suspended. Contact support.', status: 403 });
    if (r.status !== 'approved') throw new ApiError({ code: 'not_enrolled', detail: 'Your application is not approved yet', status: 403 });
    return r;
  }

  private requireJob(id: string): Job {
    const job = this.world.jobs[id];
    if (!job || (job.riderId && this.world.rider && job.riderId !== this.world.rider.id)) {
      throw new ApiError({ code: 'not_found', detail: 'Job not found', status: 404 });
    }
    return job;
  }

  private pushEvent(job: Job, from: JobState | undefined, to: JobState, actor: DeliveryEvent['actor'], extra: Partial<DeliveryEvent> = {}) {
    this.world.events.push({ id: newId('ev'), jobId: job.id, fromState: from, toState: to, actor, createdAt: iso(), ...extra });
  }

  private notify(n: Omit<RiderNotification, 'id' | 'createdAt' | 'readAt'>) {
    this.world.notifications.unshift({ id: newId('n'), createdAt: iso(), readAt: null, ...n });
    this.emit('notification');
  }

  private cashInHand(): number {
    return cashLedgerBalance(this.world.ledger);
  }

  private zoneFor(p: LatLng): GeoZone | undefined {
    return DEMO_ZONES.find((z) => pointInPolygon(p, z.boundary));
  }

  private applyTransition(job: Job, to: JobState, version: number, actor: DeliveryEvent['actor'], extra: Partial<DeliveryEvent> = {}): Job {
    try {
      const next = transition(job, to, { expectedVersion: version });
      this.world.jobs[job.id] = next;
      this.pushEvent(job, job.state, to, actor, extra);
      return next;
    } catch (e) {
      if (e instanceof TransitionError) {
        if (e.code === 'version_conflict') {
          throw new ApiError({ code: 'version_conflict', detail: 'This job was updated elsewhere. Refreshing…', status: 409, meta: { serverVersion: job.version, serverState: job.state } });
        }
        throw new ApiError({ code: 'invalid_transition', detail: `Cannot move from ${job.state} to ${to}`, status: 409 });
      }
      throw e;
    }
  }

  /** Time-driven simulation: dispatch offers, expire offers, progress application status. */
  private tick() {
    const w = this.world;
    const now = Date.now();
    // Offer expiry (manual offers only)
    if (w.currentOffer && w.currentOffer.mode === 'manual' && !w.currentOffer.outcome && new Date(w.currentOffer.expiresAt).getTime() <= now) {
      const offer = w.currentOffer;
      w.currentOffer = null;
      this.requeueAfterOffer(offer, 'timed_out');
    }
    // Dispatch
    if (w.online && !w.currentJobId && !w.currentOffer && w.pendingJobs.length && w.nextDispatchAt && new Date(w.nextDispatchAt).getTime() <= now) {
      this.createOffer();
    }
  }

  private requeueAfterOffer(offer: Offer, outcome: 'declined' | 'timed_out') {
    const w = this.world;
    const job = w.jobs[offer.jobId] ?? offer.job;
    const round = (w.rounds[offer.jobId] ?? 1) + 1;
    w.rounds[offer.jobId] = round;
    this.pushEvent(job, 'offered', 'offered', 'server', { reason: outcome });
    if (round > DISPATCH.maxRounds) {
      // After 3 rounds the merchant and operations are alerted; the job leaves this rider's queue.
      delete w.jobs[offer.jobId];
      w.pendingJobs = w.pendingJobs.filter((j) => j.id !== offer.jobId);
      this.notify({ kind: 'order_reassigned', title: `Order ${offer.job.orderRef} escalated`, body: 'No rider accepted after 3 rounds. Merchant and operations have been alerted.', deepLink: '/alerts' });
    } else {
      const reset: Job = { ...job, state: 'created', version: 0, riderId: undefined };
      w.jobs[offer.jobId] = reset;
      if (!w.pendingJobs.some((j) => j.id === offer.jobId)) w.pendingJobs.unshift(reset);
    }
    w.nextDispatchAt = new Date(Date.now() + DEMO_REOFFER_DELAY_SECONDS * 1000).toISOString();
    this.touch('offer');
  }

  private createOffer() {
    const w = this.world;
    const rider = w.rider!;
    const pending = w.pendingJobs.shift()!;
    const round = w.rounds[pending.id] ?? 1;
    w.rounds[pending.id] = round;
    const mode = w.flags.forceAuto || rider.preferences.acceptance === 'auto' ? 'auto' : 'manual';
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (mode === 'auto' ? 60 : DISPATCH.offerWindowSeconds) * 1000).toISOString();
    let job: Job = { ...pending, state: 'created', version: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), riderId: rider.id };
    // Privacy: drop address hidden until pickup verification.
    w.jobs[job.id] = job;
    job = this.applyTransition(job, 'offered', 0, 'server', { reason: `round ${round}` });
    const offer: Offer = {
      id: newId('offer'),
      jobId: job.id,
      job,
      mode,
      round,
      payoutEstimate: job.payoutEstimate,
      surgeMultiplier: job.surgeMultiplier ?? 1,
      pickup: { name: job.pickup.name, area: job.pickup.area ?? job.pickup.address, distanceKm: job.pickupDistanceKm ?? 1 },
      drop: { area: job.drop.area, distanceKm: job.distanceKm },
      etaMin: job.eta.toPickupMin + job.eta.toDropMin,
      note: job.merchantNote,
      offeredAt: now.toISOString(),
      expiresAt,
    };
    if (mode === 'auto') {
      job = this.applyTransition(job, 'accepted', job.version, 'server', { reason: 'auto-accept' });
      offer.job = job;
      offer.outcome = 'accepted';
      w.currentJobId = job.id;
    }
    w.currentOffer = offer;
    w.nextDispatchAt = null;
    this.notify({
      kind: 'new_delivery',
      title: mode === 'auto' ? `Job auto-accepted · ${job.orderRef}` : `New delivery offer · ${job.orderRef}`,
      body: `${job.pickup.name} → ${job.drop.area} · est. ₹${job.payoutEstimate}`,
      deepLink: `/offer/${job.id}`,
    });
    this.touch('offer');
  }

  private scheduleNextDispatch(seconds = DEMO_OFFER_DELAY_SECONDS) {
    this.world.nextDispatchAt = new Date(Date.now() + seconds * 1000).toISOString();
  }

  // ── Onboarding (§5.1) ─────────────────────────────────────────────
  async register(input: RegisterInput) {
    await this.ready;
    const w = this.world;
    if (w.rider) return { riderId: w.rider.id, status: w.rider.status };
    const digits = input.phone.replace(/\D/g, '');
    w.phone = w.phone ?? digits;
    w.rider = makeDemoRider({
      id: `rider-${digits.slice(-4)}`,
      riderCode: `RIDER-${1000 + Number(digits.slice(-3))}`,
      userId: `demo-user-${digits}`,
      phone: digits,
      fullName: input.fullName,
      status: 'draft',
      type: 'solo',
      tier: 'bronze',
      zoneId: undefined,
      hubId: undefined,
      organizationId: undefined,
      referralCode: input.referralCode,
      preferences: { categories: ['on_order'], acceptance: 'manual', multiStore: false, storeIds: [] },
      emergencyPhone: undefined,
    });
    this.touch('status');
    return { riderId: w.rider.id, status: w.rider.status };
  }

  async updateProfile(input: ProfileInput): Promise<Rider> {
    await this.ready;
    const r = this.requireRider();
    this.world.rider = { ...r, fullName: input.fullName, emergencyPhone: input.emergencyPhone, language: input.language, photoAssetId: input.photoAssetId, photoUri: input.photoUri, updatedAt: iso() };
    this.touch('status');
    return this.world.rider;
  }

  async lookupZone(lat: number, lng: number): Promise<ZoneLookup> {
    await this.ready;
    if (this.world.flags.outOfZone) return { status: 'out_of_zone', nearestCity: DEMO_CITY };
    const p = { lat, lng };
    // Anywhere on earth that is not in Latur resolves to Latur Central so testers can complete the flow;
    // Pune is the deterministic out-of-zone location used by tests.
    if (haversineM(p, PUNE_CENTER) < 30000) return { status: 'out_of_zone', nearestCity: DEMO_CITY };
    const zone = this.zoneFor(p) ?? DEMO_ZONES[0]!;
    return { status: 'in_zone', state: DEMO_STATE, city: DEMO_CITY, zone, neighbours: DEMO_ZONES.filter((z) => zone.neighbours.includes(z.id)) };
  }

  async listZones(cityId: string): Promise<GeoZone[]> {
    await this.ready;
    return DEMO_ZONES.filter((z) => z.cityId === cityId);
  }

  async setHub(input: HubInput): Promise<Hub> {
    await this.ready;
    const r = this.requireRider();
    const zone = DEMO_ZONES.find((z) => z.id === input.zoneId);
    if (!zone) throw new ApiError({ code: 'validation', detail: 'Unknown zone', status: 400 });
    const p = { lat: input.lat, lng: input.lng };
    const inside = pointInPolygon(p, zone.boundary);
    // The server validates the pin is inside the zone. Testers far from Latur are snapped to the zone centre.
    const farFromLatur = haversineM(p, LATUR_CENTER) > 50000;
    if (!inside && !farFromLatur) {
      throw new ApiError({ code: 'out_of_zone', detail: `This pin is outside ${zone.name}. Move the pin inside your zone.`, status: 422 });
    }
    const hub: Hub = {
      id: r.type === 'store' && this.world.storeLinks.length ? DEMO_STORE_HUB.id : `hub-${r.id}`,
      zoneId: zone.id,
      kind: r.type === 'store' && this.world.storeLinks.length ? 'store' : 'rider_start',
      name: input.name ?? (r.type === 'store' ? DEMO_STORE_HUB.name : 'My start point'),
      address: input.address,
      landmark: input.landmark,
      lat: farFromLatur ? zone.boundary[0]!.lat - 0.01 : input.lat,
      lng: farFromLatur ? zone.boundary[0]!.lng + 0.02 : input.lng,
      accuracyM: 10,
      source: 'rider_start',
    };
    this.world.hub = hub;
    this.world.zoneId = zone.id;
    this.world.rider = { ...r, zoneId: zone.id, hubId: hub.id, cityId: zone.cityId, updatedAt: iso() };
    this.touch('status');
    return hub;
  }

  async setType(type: RiderType): Promise<Rider> {
    await this.ready;
    const r = this.requireRider();
    if (type === 'taxi') throw new ApiError({ code: 'coming_soon', detail: 'Taxi Partner is coming soon', status: 409 });
    this.world.rider = { ...r, type, updatedAt: iso() };
    this.touch('status');
    return this.world.rider;
  }

  async linkStore(inviteCode: string): Promise<StoreLink> {
    await this.ready;
    this.requireRider();
    const code = inviteCode.trim().toUpperCase();
    if (!DEMO_STORE_INVITE_CODES.includes(code)) {
      throw new ApiError({ code: 'not_found', detail: 'Invalid invite code. Ask your store manager for the current code.', status: 404 });
    }
    const link = clone(DEMO_STORE_LINK);
    this.world.storeLinks = [link];
    this.world.rider = { ...this.world.rider!, organizationId: 'org-express', preferences: { ...this.world.rider!.preferences, storeIds: [link.storeId] } };
    this.touch('status');
    return link;
  }

  async startDigilocker(): Promise<{ redirectUrl: string }> {
    await this.ready;
    return { redirectUrl: 'onelocalrider://onboarding/kyc?digilocker=demo' };
  }

  async submitDocument(input: KycDocumentInput): Promise<RiderDocument> {
    await this.ready;
    this.requireRider();
    const doc: RiderDocument = {
      id: `doc-${input.kind}`,
      kind: input.kind,
      status: input.source === 'digilocker' ? 'verified' : 'pending',
      numberMasked: input.number ? maskNumber(input.number) : undefined,
      assetId: input.assetId,
      source: input.source,
      expiresOn: input.kind === 'dl' ? '2029-03-14' : input.kind === 'rc' ? '2038-01-01' : undefined,
      reviewedAt: input.source === 'digilocker' ? iso() : undefined,
    };
    this.world.documents = [...this.world.documents.filter((d) => d.kind !== input.kind), doc];
    this.touch('status');
    return doc;
  }

  async setVehicle(input: VehicleInput): Promise<RiderVehicle> {
    await this.ready;
    this.requireRider();
    const v: RiderVehicle = { class: input.class, ownership: input.ownership, registrationNo: input.registrationNo.toUpperCase(), model: input.model, rcDocumentId: input.rcAssetId ? 'doc-rc' : undefined };
    this.world.vehicle = v;
    if (input.rcAssetId) {
      this.world.documents = [...this.world.documents.filter((d) => d.kind !== 'rc'), { id: 'doc-rc', kind: 'rc', status: 'pending', numberMasked: v.registrationNo, assetId: input.rcAssetId, source: 'upload' }];
    }
    this.touch('status');
    return v;
  }

  async setPreferences(input: RiderPreferences): Promise<RiderPreferences> {
    await this.ready;
    const r = this.requireRider();
    this.world.rider = { ...r, preferences: { ...input }, updatedAt: iso() };
    this.touch('status');
    return input;
  }

  async setPayout(input: PayoutInput): Promise<PayoutMethod> {
    await this.ready;
    const r = this.requireRider();
    if (input.method === 'upi') {
      if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(input.vpa)) throw new ApiError({ code: 'validation', detail: 'Enter a valid UPI ID like name@bank', status: 400 });
      this.world.payout = { id: newId('payout'), method: 'upi', vpa: input.vpa, verifiedName: r.fullName.toUpperCase(), verifiedAt: iso(), status: 'verified', isPrimary: true };
    } else {
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(input.ifsc)) throw new ApiError({ code: 'validation', detail: 'Enter a valid IFSC code', status: 400 });
      if (input.accountNo.replace(/\D/g, '').length < 9) throw new ApiError({ code: 'validation', detail: 'Enter a valid account number', status: 400 });
      this.world.payout = { id: newId('payout'), method: 'bank', holderName: input.holder, accountLast4: input.accountNo.slice(-4), ifsc: input.ifsc.toUpperCase(), verifiedName: input.holder.toUpperCase(), verifiedAt: iso(), status: 'verified', isPrimary: true };
    }
    this.touch('status');
    return this.world.payout;
  }

  async submitApplication(): Promise<StatusInfo> {
    await this.ready;
    const r = this.requireRider();
    this.world.rider = { ...r, status: 'submitted', updatedAt: iso() };
    this.world.submittedAt = iso();
    this.notify({ kind: 'system', title: 'Application submitted', body: "We've received your registration packet. Verification usually takes under 24 hours.", deepLink: '/status' });
    this.touch('status');
    return this.getStatus();
  }

  async getStatus(): Promise<StatusInfo> {
    await this.ready;
    const w = this.world;
    const r = this.requireRider();
    let status = r.status;
    if (w.flags.statusOverride) status = w.flags.statusOverride;
    else if ((status === 'submitted' || status === 'verification_pending') && w.submittedAt) {
      const elapsed = (Date.now() - new Date(w.submittedAt).getTime()) / 1000;
      if (elapsed >= DEMO_STATUS_STEP_SECONDS.verificationPending) status = 'approved';
      else if (elapsed >= DEMO_STATUS_STEP_SECONDS.submitted) status = 'verification_pending';
    }
    if (status !== r.status) {
      w.rider = { ...r, status, updatedAt: iso() };
      if (status === 'approved') {
        w.documents = w.documents.map((d) => ({ ...d, status: 'verified', reviewedAt: iso() }));
        w.rider.tier = w.rider.tier ?? 'bronze';
        this.notify({ kind: 'system', title: "You're approved!", body: 'Welcome to OneLocal. Go online to receive your first order.', deepLink: '/home' });
      }
      this.touch('status');
    }
    const expired = w.documents.filter((d) => d.status === 'expired').map((d) => d.kind);
    return {
      status,
      reason: w.rider?.statusReason,
      expiredDocuments: expired,
      etaText: status === 'submitted' || status === 'verification_pending' ? 'Usually under 24 hours' : undefined,
      checks: [
        { label: 'Identity (Aadhaar & PAN)', done: w.documents.some((d) => d.kind === 'aadhaar' && d.status === 'verified') },
        { label: 'Selfie liveness', done: w.documents.some((d) => d.kind === 'selfie' && d.status !== 'rejected') },
        { label: 'Driving licence', done: w.documents.some((d) => d.kind === 'dl' && d.status !== 'rejected') },
        { label: 'Vehicle & RC', done: !!w.vehicle },
        { label: 'Background check', done: status === 'approved' },
      ],
    };
  }

  async createUpload(kind: string, contentType: string, localUri: string): Promise<{ assetId: string }> {
    await this.ready;
    const id = newId('asset');
    // Private storage: the URI stays on the device only; nothing is uploaded in demo mode.
    this.world.assets.push({ id, kind, contentType, localUri, createdAt: iso() });
    this.save();
    return { assetId: id };
  }

  // ── Working day (§5.2) ────────────────────────────────────────────
  async getMe(): Promise<RiderMe> {
    await this.ready;
    this.tick();
    const w = this.world;
    const rider = this.requireRider();
    const todayJobs = Object.values(w.jobs).filter((j) => j.state === 'delivered' && j.deliveredAt && isSameLocalDay(j.deliveredAt, new Date()));
    const yday = new Date();
    yday.setDate(yday.getDate() - 1);
    const ydayJobs = Object.values(w.jobs).filter((j) => j.state === 'delivered' && j.deliveredAt && isSameLocalDay(j.deliveredAt, yday));
    const sum = (jobs: Job[]) => Math.round(jobs.reduce((s, j) => s + (w.earnings[j.id]?.total ?? 0), 0) * 100) / 100;
    return {
      rider,
      zone: DEMO_ZONES.find((z) => z.id === (w.zoneId ?? rider.zoneId)),
      hub: w.hub,
      vehicle: w.vehicle,
      documents: w.documents,
      storeLinks: w.storeLinks,
      cashInHand: this.cashInHand(),
      cashLimit: rider.cashLimit,
      online: w.online,
      today: { earnings: sum(todayJobs), jobs: todayJobs.length },
      yesterday: { earnings: sum(ydayJobs), jobs: ydayJobs.length },
      weekJobs: makeWeekSeries().reduce((s, d) => s + d.jobs, 0),
    };
  }

  async setAvailability(input: AvailabilityInput): Promise<{ online: boolean }> {
    await this.ready;
    const w = this.world;
    const rider = this.requireApproved();
    if (input.online) {
      if (w.documents.some((d) => d.status === 'expired')) throw new ApiError({ code: 'not_enrolled', detail: 'A document has expired. Upload a valid one to go online.', status: 403 });
      if (!canGoOnlineWithCash(this.cashInHand(), rider.cashLimit)) {
        throw new ApiError({ code: 'cash_limit', detail: `Cash in hand (₹${this.cashInHand()}) is above your limit of ₹${rider.cashLimit}. Deposit cash to go online.`, status: 403, meta: { cashInHand: this.cashInHand(), cashLimit: rider.cashLimit } });
      }
      const lookup = await this.lookupZone(input.lat, input.lng);
      if (lookup.status === 'out_of_zone') throw new ApiError({ code: 'out_of_zone', detail: "You're outside your operating zone. Move closer to your hub to go online.", status: 403 });
      w.online = true;
      w.lastPosition = { lat: input.lat, lng: input.lng, accuracyM: input.accuracyM, at: iso() };
      if (!w.currentJobId && !w.currentOffer) this.scheduleNextDispatch();
    } else {
      w.online = false;
      w.nextDispatchAt = null;
      if (w.currentOffer && w.currentOffer.mode === 'manual' && !w.currentOffer.outcome) {
        const offer = w.currentOffer;
        w.currentOffer = null;
        this.requeueAfterOffer(offer, 'declined');
      }
    }
    this.touch('status');
    return { online: w.online };
  }

  async heartbeat(input: HeartbeatInput) {
    await this.ready;
    this.world.lastPosition = { lat: input.lat, lng: input.lng, accuracyM: input.accuracyM, at: iso() };
    this.tick();
    this.save();
    return { ok: true as const, serverTime: iso() };
  }

  async setPushToken(token: string): Promise<void> {
    await this.ready;
    this.world.pushToken = token;
    this.save();
  }

  async getCurrentOffer(): Promise<Offer | null> {
    await this.ready;
    this.tick();
    const o = this.world.currentOffer;
    if (!o) return null;
    return { ...o, job: this.world.jobs[o.jobId] ?? o.job };
  }

  async acceptOffer(offerId: string): Promise<Job> {
    await this.ready;
    this.tick();
    const w = this.world;
    this.requireApproved();
    const offer = w.currentOffer;
    if (!offer || offer.id !== offerId) {
      const job = w.currentJobId ? w.jobs[w.currentJobId] : undefined;
      if (job && job.state === 'accepted' && w.lastAcceptedOfferId === offerId) return job; // idempotent replay
      throw new ApiError({ code: 'offer_expired', detail: 'This offer has expired', status: 410 });
    }
    if (offer.outcome === 'accepted') {
      // Auto-accepted: acknowledge and clear.
      w.currentOffer = null;
      w.lastAcceptedOfferId = offer.id;
      this.touch('offer');
      return w.jobs[offer.jobId]!;
    }
    if (new Date(offer.expiresAt).getTime() <= Date.now()) {
      w.currentOffer = null;
      this.requeueAfterOffer(offer, 'timed_out');
      throw new ApiError({ code: 'offer_expired', detail: 'This offer has expired', status: 410 });
    }
    let job = w.jobs[offer.jobId]!;
    job = this.applyTransition(job, 'accepted', job.version, 'rider');
    w.currentJobId = job.id;
    w.currentOffer = null;
    w.lastAcceptedOfferId = offer.id;
    this.touch('job');
    return job;
  }

  async declineOffer(offerId: string, reason: DeclineReason): Promise<void> {
    await this.ready;
    const w = this.world;
    const offer = w.currentOffer;
    if (!offer || offer.id !== offerId) return;
    w.currentOffer = null;
    this.pushEvent(offer.job, 'offered', 'offered', 'rider', { reason: `declined:${reason}` });
    this.requeueAfterOffer(offer, 'declined');
  }

  async getCurrentJob(): Promise<Job | null> {
    await this.ready;
    this.tick();
    const id = this.world.currentJobId;
    if (!id) return null;
    const job = this.world.jobs[id];
    if (!job || isTerminal(job.state)) {
      this.world.currentJobId = null;
      return null;
    }
    return job;
  }

  async getJob(id: string): Promise<Job> {
    await this.ready;
    return this.requireJob(id);
  }

  async getJobDetail(id: string): Promise<JobDetail> {
    await this.ready;
    const job = this.requireJob(id);
    return {
      job,
      events: this.world.events.filter((e) => e.jobId === id),
      proof: this.world.proofs[id],
      pickupCheck: this.world.pickupChecks[id],
      earnings: this.world.earnings[id],
    };
  }

  async step(id: string, input: StepInput): Promise<Job> {
    await this.ready;
    const w = this.world;
    this.requireApproved();
    let job = this.requireJob(id);
    if (w.flags.versionConflictOnce) {
      // Simulate the server having advanced the job on another device.
      w.flags.versionConflictOnce = false;
      throw new ApiError({ code: 'version_conflict', detail: 'This job was updated elsewhere. Refreshing…', status: 409, meta: { serverVersion: job.version, serverState: job.state } });
    }
    const target = job.pickup;
    const dropTarget = job.drop;
    const here = { lat: input.lat, lng: input.lng };
    if (input.to === 'at_pickup') {
      const d = haversineM(here, target);
      if (d > GEOFENCE.arrivedFarM && !input.reason) {
        throw new ApiError({ code: 'too_far', detail: `You are ${Math.round(d)} m from the store. Add a reason to continue.`, status: 422, meta: { distanceM: Math.round(d) } });
      }
      if (d > GEOFENCE.arrivedFarM) job = { ...job, flags: [...(job.flags ?? []), `pickup_arrival_far:${Math.round(d)}m`] };
      if (w.flags.notReady) job = { ...job, merchantReadyAt: new Date(Date.now() + 45 * 1000).toISOString() };
    }
    if (input.to === 'at_drop') {
      const d = haversineM(here, dropTarget);
      if (d > GEOFENCE.arrivedFarM && !input.reason) {
        throw new ApiError({ code: 'too_far', detail: `You are ${Math.round(d)} m from the drop pin. Add a reason — this will be reviewed.`, status: 422, meta: { distanceM: Math.round(d) } });
      }
      if (d > GEOFENCE.arrivedFarM) job = { ...job, flags: [...(job.flags ?? []), `drop_arrival_far:${Math.round(d)}m`] };
    }
    w.jobs[job.id] = job;
    const next = this.applyTransition(job, input.to, input.version, 'rider', { location: { lat: input.lat, lng: input.lng, accuracyM: input.accuracyM }, reason: input.reason });
    this.touch('job');
    return next;
  }

  async verifyPickup(id: string, input: PickupVerifyInput): Promise<PickupVerifyResult> {
    await this.ready;
    const w = this.world;
    this.requireApproved();
    const job = this.requireJob(id);
    if (job.state !== 'at_pickup') throw new ApiError({ code: 'invalid_transition', detail: 'Arrive at the store before verifying the pickup', status: 409 });
    if (job.version !== input.version) throw new ApiError({ code: 'version_conflict', detail: 'This job was updated elsewhere. Refreshing…', status: 409 });
    const expected = job.pickupCodeHint ?? `OL-${job.orderRef.replace('#', '')}`;
    const scanned = (input.code ?? '').trim().toUpperCase();
    const record = (result: string) => {
      w.pickupChecks[id] = { method: input.method, result, checkedAt: iso() };
    };
    if (w.flags.mismatchOnce && input.method !== 'bypass') {
      w.flags.mismatchOnce = false;
      record('mismatch');
      this.touch('job');
      return { result: 'mismatch', expectedSku: expected, scanned: scanned || 'OL-9831', job };
    }
    if (w.flags.incompleteOnce && input.method !== 'bypass') {
      w.flags.incompleteOnce = false;
      record('incomplete');
      this.touch('job');
      return { result: 'incomplete', missing: job.items.slice(-1), job };
    }
    if (input.method !== 'bypass' && scanned !== expected.toUpperCase()) {
      record('mismatch');
      this.touch('job');
      return { result: 'mismatch', expectedSku: expected, scanned: scanned || '—', job };
    }
    const notOk = input.items.filter((i) => !i.ok);
    if (input.method !== 'bypass' && notOk.length) {
      record('incomplete');
      this.touch('job');
      return { result: 'incomplete', missing: job.items.filter((i) => notOk.some((n) => n.id === i.id)), job };
    }
    record('verified');
    const next = this.applyTransition(job, 'pickup_verified', input.version, 'rider', { reason: input.method === 'bypass' ? `bypass:${input.reason ?? ''}` : input.method });
    this.touch('job');
    return { result: 'verified', job: next };
  }

  async track(id: string, points: TrackPoint[]): Promise<void> {
    await this.ready;
    const last = points[points.length - 1];
    if (last) this.world.lastPosition = { lat: last.lat, lng: last.lng, accuracyM: last.accuracyM, at: last.recordedAt };
    this.save();
  }

  async submitProof(id: string, input: ProofInput): Promise<ProofResult> {
    await this.ready;
    const w = this.world;
    this.requireApproved();
    let job = this.requireJob(id);
    if (job.state !== 'handover' && job.state !== 'proof') throw new ApiError({ code: 'invalid_transition', detail: 'Start the handover before submitting proof', status: 409 });
    if (job.version !== input.version) throw new ApiError({ code: 'version_conflict', detail: 'This job was updated elsewhere. Refreshing…', status: 409 });
    if (job.state === 'handover') job = this.applyTransition(job, 'proof', job.version, 'rider');
    if (input.method === 'otp' && job.otpLocked) throw new ApiError({ code: 'otp_locked', detail: 'OTP locked after 5 wrong attempts. Use photo proof.', status: 423, meta: { job } });
    const allowed = job.otpLocked ? [...job.proofMethods.filter((m) => m !== 'otp'), 'photo'] : job.proofMethods;
    if (!allowed.includes(input.method)) throw new ApiError({ code: 'validation', detail: `${input.method} proof is not allowed for this order`, status: 400 });
    if (input.method === 'otp') {
      const expected = w.otpByJob[id] ?? '0000';
      if (input.code !== expected) {
        const attempts = job.otpAttempts + 1;
        const locked = attempts >= OTP.maxAttempts;
        job = { ...job, otpAttempts: attempts, otpLocked: locked, proofMethods: locked && !job.proofMethods.includes('photo') ? [...job.proofMethods, 'photo'] : job.proofMethods };
        w.jobs[id] = job;
        this.touch('job');
        if (locked) throw new ApiError({ code: 'otp_locked', detail: 'OTP locked after 5 wrong attempts. Use photo proof.', status: 423, meta: { job } });
        throw new ApiError({ code: 'otp_invalid', detail: `Wrong OTP. ${OTP.maxAttempts - attempts} attempts left.`, status: 400, meta: { attemptsLeft: OTP.maxAttempts - attempts, job } });
      }
    }
    const { distanceM, flagged } = checkProofDistance({ lat: input.lat, lng: input.lng }, job.drop);
    if (flagged) job = { ...job, flags: [...(job.flags ?? []), `proof_far:${Math.round(distanceM)}m`] };
    w.jobs[id] = job;
    const delivered = this.applyTransition(job, 'delivered', job.version, 'rider', { location: { lat: input.lat, lng: input.lng, accuracyM: input.accuracyM } });
    w.proofs[id] = { method: input.method, createdAt: iso(), distanceFromDropM: Math.round(distanceM) };
    const waitedMin = w.waits[id]?.kind === 'not_ready' ? Math.round((Date.now() - new Date(w.waits[id]!.startedAt).getTime()) / 60000) : 0;
    const tip = id === 'job-9830' ? 10 : id === 'job-9824' ? 0 : 20;
    const bonus = id === 'job-9830' ? 20 : 0;
    const pickupTime = new Date().toTimeString().slice(0, 5);
    const earnings = computeEarnings(DEMO_EARNINGS_RULE, { jobId: id, distanceKm: job.distanceKm, waitMinutes: waitedMin, tip, bonus, pickupTime, surgeMultiplier: job.surgeMultiplier });
    w.earnings[id] = earnings;
    if (job.cashToCollect > 0) {
      w.ledger.push({ id: newId('l'), jobId: id, kind: 'collected', amount: input.cashCollected ?? job.cashToCollect, createdAt: iso(), note: `COD ${job.orderRef}` });
    }
    w.currentJobId = null;
    delete w.waits[id];
    this.notify({ kind: 'payment_disbursed', title: `₹${earnings.total} added for ${job.orderRef}`, body: `Base ₹${earnings.base} + distance ₹${earnings.distance}${earnings.peak ? ` + peak ₹${earnings.peak}` : ''}${earnings.tip ? ` + tip ₹${earnings.tip}` : ''}`, deepLink: `/earnings/job/${id}` });
    if (w.online) this.scheduleNextDispatch(6);
    this.touch('job');
    return { job: delivered, earnings, flagged, distanceFromDropM: Math.round(distanceM) };
  }

  async raiseException(id: string, input: ExceptionInput): Promise<ExceptionResponse> {
    await this.ready;
    const w = this.world;
    this.requireApproved();
    let job = this.requireJob(id);
    if (!canRaiseException(job.state, input.kind)) {
      throw new ApiError({ code: 'invalid_transition', detail: `"${input.kind}" cannot be reported while ${job.state}`, status: 409 });
    }
    const exception: DeliveryException = { id: newId('exc'), jobId: id, kind: input.kind, note: input.note, status: 'open', createdAt: iso() };
    w.exceptions.push(exception);
    const outcome = exceptionOutcome(input.kind);
    let waitSeconds: number | undefined;
    let message: string | undefined;
    if (input.kind === 'not_ready') {
      w.waits[id] = { kind: 'not_ready', startedAt: iso(), seconds: DEMO_EARNINGS_RULE.waitFreeMin * 60 };
      waitSeconds = DEMO_EARNINGS_RULE.waitFreeMin * 60;
      message = `Wait compensation starts after ${DEMO_EARNINGS_RULE.waitFreeMin} minutes.`;
      this.pushEvent(job, job.state, job.state, 'rider', { reason: 'exception:not_ready' });
    } else if (input.kind === 'unavailable') {
      w.waits[id] = { kind: 'unavailable', startedAt: iso(), seconds: 300 };
      waitSeconds = 300;
      message = 'Wait 5 minutes and try calling twice before escalating.';
      this.pushEvent(job, job.state, job.state, 'rider', { reason: 'exception:unavailable' });
    } else if (input.kind === 'address') {
      if (input.correctedLat !== undefined && input.correctedLng !== undefined) {
        job = { ...job, drop: { ...job.drop, lat: input.correctedLat, lng: input.correctedLng, source: 'rider_corrected', confidence: Math.max(0.2, (job.drop.confidence ?? 0.7) - 0.2) }, version: job.version + 1, updatedAt: iso() };
        w.jobs[id] = job;
        message = 'Address dispute submitted. Operations will confirm the corrected pin with the customer.';
      } else {
        message = 'Your live location was shared with the customer and operations.';
      }
      this.pushEvent(job, job.state, job.state, 'rider', { reason: 'exception:address' });
    } else if (outcome.endsJob && outcome.resultState) {
      job = this.applyTransition(job, outcome.resultState, input.version, 'rider', { reason: `exception:${input.kind}`, location: { lat: input.lat, lng: input.lng } });
      job = { ...job, failureReason: input.kind === 'vehicle' ? 'Vehicle breakdown — order reassigned' : input.kind === 'refused' ? 'Customer refused — returned to store' : input.note };
      w.jobs[id] = job;
      w.currentJobId = null;
      exception.status = 'resolved';
      exception.resolvedAt = iso();
      exception.resolution = input.kind === 'vehicle' ? 'reassigned' : 'returned';
      this.notify({ kind: 'order_reassigned', title: `Order ${job.orderRef} ${input.kind === 'vehicle' ? 'reassigned' : 'returned'}`, body: input.kind === 'vehicle' ? 'Another rider has been dispatched. No penalty applied.' : 'Please return the package to the store. Operations will follow up.', deepLink: `/tasks/${id}` });
      message = input.kind === 'vehicle' ? 'Operations will re-dispatch the order. Stay safe.' : 'Return the package to the store.';
      if (w.online) this.scheduleNextDispatch(10);
    } else if (input.kind === 'safety') {
      w.sos.push({ at: iso(), jobId: id, lat: input.lat, lng: input.lng });
      message = 'Operations alerted and your live location is shared. Help is on the way.';
      this.pushEvent(job, job.state, job.state, 'rider', { reason: 'exception:safety' });
    } else if (input.kind === 'proof_failed') {
      job = { ...job, proofMethods: job.proofMethods.includes('photo') ? job.proofMethods : [...job.proofMethods, 'photo'] };
      w.jobs[id] = job;
      message = 'Photo proof unlocked. Operations will review it.';
    } else {
      message = 'Reported to operations. They will contact you shortly.';
      this.pushEvent(job, job.state, job.state, 'rider', { reason: `exception:${input.kind}` });
    }
    this.touch('job');
    return { exception, jobState: w.jobs[id]?.state ?? job.state, nextActions: outcome.nextActions, waitSeconds, message };
  }

  async resolveWait(id: string, kind: 'not_ready' | 'unavailable', outcome: 'continue' | 'escalate'): Promise<ExceptionResponse> {
    await this.ready;
    const w = this.world;
    let job = this.requireJob(id);
    const open = w.exceptions.filter((e) => e.jobId === id && e.kind === kind && e.status === 'open');
    for (const e of open) {
      e.status = 'resolved';
      e.resolvedAt = iso();
      e.resolution = outcome;
    }
    if (kind === 'not_ready' && outcome === 'continue') {
      job = { ...job, merchantReadyAt: undefined };
      w.jobs[id] = job;
      w.flags.notReady = false;
    }
    if (kind === 'unavailable' && outcome === 'escalate') {
      job = this.applyTransition(job, 'returned', job.version, 'operations', { reason: 'unavailable:escalated' });
      job = { ...job, failureReason: 'Customer unavailable — returned to store' };
      w.jobs[id] = job;
      w.currentJobId = null;
      delete w.waits[id];
      this.notify({ kind: 'order_reassigned', title: `Order ${job.orderRef} returned`, body: 'Customer unavailable after the mandatory wait. Return the package to the store.', deepLink: `/tasks/${id}` });
      if (w.online) this.scheduleNextDispatch(10);
    }
    this.touch('job');
    const ex = open[0] ?? { id: newId('exc'), jobId: id, kind, status: 'resolved' as const, createdAt: iso() };
    return { exception: ex, jobState: job.state, nextActions: outcome === 'continue' ? ['continue'] : ['return_to_store'] };
  }

  async sos(input: SosInput): Promise<void> {
    await this.ready;
    this.world.sos.push({ at: iso(), jobId: input.jobId, lat: input.lat, lng: input.lng });
    this.notify({ kind: 'system', title: 'SOS received', body: 'Operations have been alerted and can see your live location. Stay where it is safe.', deepLink: input.jobId ? `/job/${input.jobId}/sos` : '/home' });
    this.touch('notification');
  }

  async getCallNumber(id: string): Promise<{ number: string }> {
    await this.ready;
    const job = this.requireJob(id);
    if (!canCallCustomer(job.state)) throw new ApiError({ code: 'unauthorized', detail: 'Customer number is only available during the job', status: 403 });
    return { number: '+91 98220 44556' };
  }

  // ── Money & history (§5.3) ────────────────────────────────────────
  async getEarnings(range: 'today' | 'week' | 'month'): Promise<EarningsSummary> {
    await this.ready;
    const w = this.world;
    const delivered = Object.values(w.jobs).filter((j) => j.state === 'delivered' && j.deliveredAt);
    const today = delivered.filter((j) => isSameLocalDay(j.deliveredAt!, new Date()));
    const lines = (jobs: Job[]) => jobs.map((j) => w.earnings[j.id]).filter((e): e is JobEarnings => !!e);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const split = (es: JobEarnings[]) => ({
      orderPay: r2(es.reduce((s, e) => s + e.base + e.distance + e.wait, 0)),
      milestoneBonus: r2(es.reduce((s, e) => s + e.bonus, 0)),
      tips: r2(es.reduce((s, e) => s + e.tip, 0)),
      peakIncentive: r2(es.reduce((s, e) => s + e.peak, 0)),
    });
    if (range === 'today') {
      const es = lines(today);
      const total = r2(es.reduce((s, e) => s + e.total, 0));
      return {
        range,
        total,
        deliveries: today.length,
        averagePerTrip: today.length ? r2(total / today.length) : 0,
        split: split(es),
        series: [{ date: new Date().toISOString().slice(0, 10), label: 'Today', total, jobs: today.length }],
        insights: [
          { title: 'Peak incentive active', body: 'Orders between 7–10 PM earn ₹15 extra per trip.', tone: 'positive' },
          { title: 'Linked store bonus', body: 'Express MegaMart orders pay 1.2x while linked.', tone: 'neutral' },
        ],
        periodLabel: 'Today',
        ruleVersion: DEMO_EARNINGS_RULE.version,
      };
    }
    const series = makeWeekSeries();
    const todayTotal = r2(lines(today).reduce((s, e) => s + e.total, 0));
    const last = series[series.length - 1]!;
    last.total = todayTotal;
    last.jobs = today.length;
    const total = r2(series.reduce((s, d) => s + d.total, 0));
    const deliveries = series.reduce((s, d) => s + d.jobs, 0);
    const es = lines(delivered);
    const best = series.reduce((b, d) => (d.total > b.total ? d : b), series[0]!);
    return {
      range,
      total,
      deliveries,
      averagePerTrip: deliveries ? r2(total / deliveries) : 0,
      split: { ...split(es), orderPay: r2(total - split(es).milestoneBonus - split(es).tips - split(es).peakIncentive) },
      series,
      insights: [
        { title: `Best day: ${best.label}`, body: `You earned ₹${best.total} on ${best.label} with ${best.jobs} deliveries.`, tone: 'positive' },
        { title: 'Evening peaks pay more', body: 'Most of your peak incentive came from 7–10 PM orders.', tone: 'neutral' },
        { title: 'Weekly payout', body: 'Payouts are sent every Monday to your verified UPI / bank account.', tone: 'neutral' },
      ],
      periodLabel: 'This week',
      bestDay: best,
      ruleVersion: DEMO_EARNINGS_RULE.version,
    };
  }

  async getJobEarnings(id: string): Promise<{ earnings: JobEarnings; job: JobHistoryItem }> {
    await this.ready;
    const job = this.requireJob(id);
    const earnings = this.world.earnings[id];
    if (!earnings) throw new ApiError({ code: 'not_found', detail: 'No earnings recorded for this job yet', status: 404 });
    return { earnings, job: toHistoryItem(job, earnings) };
  }

  async listJobs(): Promise<Paginated<JobHistoryItem>> {
    await this.ready;
    const items = Object.values(this.world.jobs)
      .filter((j) => isTerminal(j.state))
      .sort((a, b) => new Date(b.deliveredAt ?? b.updatedAt).getTime() - new Date(a.deliveredAt ?? a.updatedAt).getTime())
      .map((j) => toHistoryItem(j, this.world.earnings[j.id]));
    return { items, nextCursor: null };
  }

  async getStatementUrl(week: string): Promise<string> {
    await this.ready;
    return `onelocalrider://statements/${week}.pdf`;
  }

  async getCash(): Promise<CashSummary> {
    await this.ready;
    const rider = this.requireRider();
    const cashInHand = this.cashInHand();
    return {
      cashInHand,
      cashLimit: rider.cashLimit,
      blocked: !canGoOnlineWithCash(cashInHand, rider.cashLimit),
      ledger: [...this.world.ledger].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      depositInstructions: 'Deposit cash at Store A (Express MegaMart) counter or via the OneLocal UPI collect request. Deposits reflect within 30 minutes.',
    };
  }

  /** Demo only: records a deposit so the tester can clear the cash limit. */
  async recordDeposit(amount: number): Promise<CashSummary> {
    await this.ready;
    this.world.ledger.push({ id: newId('l'), kind: 'deposited', amount, createdAt: iso(), note: 'Deposited at Store A' });
    this.touch('status');
    return this.getCash();
  }

  async listNotifications(): Promise<Paginated<RiderNotification>> {
    await this.ready;
    return { items: [...this.world.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), nextCursor: null };
  }

  async markNotificationsRead(ids: string[]): Promise<void> {
    await this.ready;
    const set = new Set(ids);
    this.world.notifications = this.world.notifications.map((n) => (set.has(n.id) && !n.readAt ? { ...n, readAt: iso() } : n));
    this.touch('notification');
  }

  /** Demo-only hint so testers can complete the OTP proof without an SMS. */
  async getDemoDeliveryOtp(jobId: string): Promise<string | undefined> {
    await this.ready;
    return this.world.otpByJob[jobId];
  }

  /** Demo-only pickup code hint (the merchant's receipt QR value). */
  async getDemoPickupCode(jobId: string): Promise<string | undefined> {
    await this.ready;
    return this.world.jobs[jobId]?.pickupCodeHint;
  }

  getWaits() {
    return this.world.waits;
  }
}

const maskNumber = (n: string): string => {
  const clean = n.replace(/\s/g, '');
  if (clean.length <= 4) return clean;
  return `${'X'.repeat(Math.max(0, clean.length - 4)).replace(/(.{4})/g, '$1 ').trim()} ${clean.slice(-4)}`.trim();
};

const toHistoryItem = (j: Job, e?: JobEarnings): JobHistoryItem => ({
  id: j.id,
  orderRef: j.orderRef,
  state: j.state,
  category: j.category,
  pickupName: j.pickup.name,
  dropArea: j.drop.area,
  distanceKm: j.distanceKm,
  earnings: e?.total ?? 0,
  deliveredAt: j.deliveredAt,
  createdAt: j.createdAt,
  failureReason: j.failureReason,
});
