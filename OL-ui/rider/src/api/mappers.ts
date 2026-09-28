import type {
  MessageFallbackReason,
  MessageReceipt,
  DeliveryCategory,
  EarningsSummary,
  GeoZone,
  Hub,
  Job,
  JobEarnings,
  JobState,
  Offer,
  PayoutMethod,
  PayoutTransfer,
  PlaceSource,
  ProofMethod,
  Rider,
  RiderDocument,
  RiderMe,
  RiderNotification,
  StoreLink,
  WalletSummary,
} from '@/types';
import type { EarningsDto, JobDto, JobEarningsDto, MeDto, MessageReceiptDto, NotificationDto, OfferDto, PayoutMethodDto, PayoutTransferDto, RiderDto, WalletDto } from './dto';

const asCategory = (c: string): DeliveryCategory =>
  c === 'quick_drop' || c === 'pick_drop' ? c : 'on_order';

export const mapJob = (d: JobDto): Job => ({
  id: d.id,
  orderRef: d.order_ref,
  state: d.state as JobState,
  version: d.version,
  category: asCategory(d.category),
  cityId: d.city_id,
  pickupZone: d.pickup_zone,
  dropZone: d.drop_zone,
  pickup: {
    lat: d.pickup.lat,
    lng: d.pickup.lng,
    accuracyM: d.pickup.accuracy_m,
    source: d.pickup.source as PlaceSource | undefined,
    name: d.pickup.name,
    address: d.pickup.address,
    area: d.pickup.area,
    entranceNote: d.pickup.entrance_note,
    phoneMasked: d.pickup.phone_masked ?? true,
    storeId: d.pickup.store_id,
  },
  drop: {
    lat: d.drop.lat,
    lng: d.drop.lng,
    accuracyM: d.drop.accuracy_m,
    source: d.drop.source as PlaceSource | undefined,
    confidence: d.drop.confidence,
    area: d.drop.area,
    address: d.drop.address ?? null,
    landmark: d.drop.landmark,
    customerFirstName: d.drop.customer_first_name,
    instructions: d.drop.instructions,
    flatFloor: d.drop.flat_floor,
  },
  items: d.items ?? [],
  itemsCount: d.items_count,
  cashToCollect: d.cash_to_collect,
  proofMethods: d.proof_methods as ProofMethod[],
  payoutEstimate: d.payout_estimate,
  surgeMultiplier: d.surge_multiplier,
  eta: { toPickupMin: d.eta.to_pickup_min, toDropMin: d.eta.to_drop_min },
  distanceKm: d.distance_km,
  pickupDistanceKm: d.pickup_distance_km,
  deadlines: { pickupBy: d.deadlines?.pickup_by, dropBy: d.deadlines?.drop_by },
  merchantNote: d.merchant_note,
  otpAttempts: d.otp_attempts ?? 0,
  otpLocked: d.otp_locked ?? false,
  otpDelivery: d.otp_delivery ? mapMessageReceipt(d.otp_delivery) : undefined,
  riderId: d.rider_id,
  acceptedAt: d.accepted_at,
  deliveredAt: d.delivered_at,
  createdAt: d.created_at,
  updatedAt: d.updated_at,
  failureReason: d.failure_reason,
  flags: d.flags,
});

export const mapOffer = (d: OfferDto): Offer => ({
  id: d.offer_id,
  jobId: d.job.id,
  job: mapJob(d.job),
  mode: d.mode ?? 'manual',
  round: d.round ?? 1,
  payoutEstimate: d.payout_estimate,
  surgeMultiplier: d.surge_multiplier,
  pickup: { name: d.pickup.name, area: d.pickup.area, distanceKm: d.pickup.distance_km },
  drop: { area: d.drop.area, distanceKm: d.drop.distance_km },
  etaMin: d.eta_min,
  note: d.note,
  offeredAt: d.offered_at ?? new Date().toISOString(),
  expiresAt: d.expires_at,
});

export const mapRider = (d: RiderDto): Rider => ({
  id: d.id,
  riderCode: d.rider_code ?? `RIDER-${d.id.slice(-4).toUpperCase()}`,
  userId: d.user_id,
  phone: d.phone,
  fullName: d.full_name,
  photoAssetId: d.photo_asset_id,
  emergencyPhone: d.emergency_phone,
  email: d.email,
  language: (d.language as Rider['language']) ?? 'en',
  type: d.type as Rider['type'],
  status: d.status as Rider['status'],
  statusReason: d.status_reason,
  cityId: d.city_id,
  zoneId: d.zone_id,
  hubId: d.hub_id,
  organizationId: d.organization_id,
  tier: (d.tier as Rider['tier']) ?? 'bronze',
  preferences: {
    categories: d.categories.map(asCategory),
    acceptance: d.acceptance === 'auto' ? 'auto' : 'manual',
    multiStore: d.multi_store,
    storeIds: d.store_ids ?? [],
  },
  cashLimit: d.cash_limit ?? 0,
  referralCode: d.referral_code,
  createdAt: d.created_at,
  updatedAt: d.updated_at,
});

export const mapMe = (d: MeDto): RiderMe => ({
  rider: mapRider(d.rider),
  zone: d.zone
    ? ({ id: d.zone.id, cityId: d.zone.city_id, name: d.zone.name, boundary: d.zone.boundary ?? [], neighbours: d.zone.neighbours ?? [], active: d.zone.active ?? true } satisfies GeoZone)
    : undefined,
  hub: d.hub
    ? ({
        id: d.hub.id,
        zoneId: d.hub.zone_id,
        kind: d.hub.kind as Hub['kind'],
        name: d.hub.name ?? 'Start hub',
        lat: d.hub.lat,
        lng: d.hub.lng,
        address: d.hub.address ?? '',
        landmark: d.hub.landmark,
        accuracyM: d.hub.accuracy_m,
        source: d.hub.source as PlaceSource | undefined,
        entranceNote: d.hub.entrance_note,
        storeId: d.hub.store_id,
      } satisfies Hub)
    : undefined,
  vehicle: d.vehicle
    ? { class: d.vehicle.class as '2w' | '3w' | '4w', ownership: d.vehicle.ownership as 'own' | 'rent', registrationNo: d.vehicle.registration_no, model: d.vehicle.model, rcDocumentId: d.vehicle.rc_document_id }
    : undefined,
  documents: (d.documents ?? []).map(
    (x): RiderDocument => ({
      id: x.id,
      kind: x.kind as RiderDocument['kind'],
      status: x.status as RiderDocument['status'],
      numberMasked: x.number_masked,
      source: x.source as RiderDocument['source'],
      expiresOn: x.expires_on,
      rejectionReason: x.rejection_reason,
    }),
  ),
  storeLinks: (d.store_links ?? []).map(
    (s): StoreLink => ({
      storeId: s.store_id,
      storeName: s.store_name,
      organization: s.organization,
      zoneName: s.zone_name ?? '',
      managerName: s.manager_name ?? '',
      dailyPayText: s.daily_pay_text ?? '',
      priority: s.priority,
      status: s.status as StoreLink['status'],
      payoutMultiplier: s.payout_multiplier,
    }),
  ),
  cashInHand: d.cash_in_hand,
  cashLimit: d.cash_limit,
  online: d.online,
  today: d.today,
  yesterday: d.yesterday,
});

export const mapEarnings = (d: EarningsDto): EarningsSummary => ({
  range: d.range,
  total: d.total,
  deliveries: d.deliveries,
  averagePerTrip: d.average_per_trip,
  split: {
    orderPay: d.split.order_pay,
    milestoneBonus: d.split.milestone_bonus,
    tips: d.split.tips,
    peakIncentive: d.split.peak_incentive ?? 0,
  },
  series: d.series,
  insights: d.insights ?? [],
  periodLabel: d.period_label,
  ruleVersion: d.rule_version,
});

export const mapJobEarnings = (d: JobEarningsDto): JobEarnings => ({
  jobId: d.job_id,
  base: d.base,
  distance: d.distance,
  peak: d.peak,
  wait: d.wait,
  tip: d.tip,
  bonus: d.bonus,
  total: d.total,
  ruleVersion: d.rule_version,
  distanceKm: d.distance_km,
  waitMinutes: d.wait_minutes,
  createdAt: d.created_at,
});

export const mapNotification = (d: NotificationDto): RiderNotification => ({
  id: String(d.id),
  kind: d.kind as RiderNotification['kind'],
  title: d.title,
  body: d.body ?? '',
  createdAt: d.created_at,
  readAt: d.read_at ?? null,
  deepLink: typeof d.data?.deep_link === 'string' ? d.data.deep_link : undefined,
  data: d.data,
});

export const mapMessageReceipt = (d: MessageReceiptDto): MessageReceipt => ({
  channel: d.channel,
  status: d.status,
  fallbackUsed: d.fallback_used,
  fallbackReason: d.fallback_reason as MessageFallbackReason | undefined,
  fallbackPending: d.fallback_pending ?? false,
  toMasked: d.to_masked,
  sentAt: d.sent_at,
  resendAfterSeconds: d.resend_after_seconds,
});

export const mapPayoutMethod = (d: PayoutMethodDto): PayoutMethod => ({
  id: d.id ?? `payout-${d.method}`,
  method: d.method,
  holderName: d.holder_name,
  accountLast4: d.account_last4,
  ifsc: d.ifsc,
  vpa: d.vpa,
  bankName: d.bank_name,
  verifiedName: d.verified_name,
  nameMatch: d.name_match,
  verifiedAt: d.verified_at,
  status: d.status,
  isPrimary: d.is_primary ?? true,
  provider: d.provider,
});

export const mapPayoutTransfer = (d: PayoutTransferDto): PayoutTransfer => {
  const fee = d.fee ?? 0;
  return {
    id: d.id,
    kind: d.kind,
    mode: d.mode,
    amount: d.amount,
    fee,
    net: d.net ?? Math.round((d.amount - fee) * 100) / 100,
    status: d.status,
    utr: d.utr ?? undefined,
    statusDescription: d.status_description ?? undefined,
    destination: d.destination,
    periodLabel: d.period_label ?? undefined,
    createdAt: d.created_at,
    completedAt: d.completed_at ?? undefined,
  };
};

export const mapWallet = (d: WalletDto): WalletSummary => ({
  balance: d.balance,
  available: d.available,
  inFlight: d.in_flight,
  instant: {
    enabled: d.instant.enabled,
    minAmount: d.instant.min_amount,
    maxAmount: d.instant.max_amount,
    fee: d.instant.fee,
    withdrawalsLeftToday: d.instant.withdrawals_left_today,
    blockedReason: d.instant.blocked_reason ?? undefined,
  },
  weekly: { nextPayoutAt: d.weekly.next_payout_at, description: d.weekly.description },
  payoutMethod: d.payout_method ? mapPayoutMethod(d.payout_method) : null,
  recent: d.recent.map(mapPayoutTransfer),
});
