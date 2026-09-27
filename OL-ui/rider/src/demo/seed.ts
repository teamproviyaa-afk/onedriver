/**
 * Deterministic demo world for DATA_MODE=local_demo.
 * All amounts are illustrative samples — never production rates (spec R10).
 */
import type {
  CashLedgerEntry,
  EarningsRule,
  GeoCity,
  GeoState,
  GeoZone,
  Hub,
  Job,
  JobEarnings,
  LatLng,
  PayoutMethod,
  Rider,
  RiderDocument,
  RiderNotification,
  RiderVehicle,
  StoreLink,
} from '@/types';
import { DEMO_RETURNING_PHONE, DEMO_RIDER_CODE, DEMO_RIDER_NAME } from './constants';

export const LATUR_CENTER: LatLng = { lat: 18.4088, lng: 76.5604 };
export const PUNE_CENTER: LatLng = { lat: 18.5204, lng: 73.8567 };

const box = (c: LatLng, dLat: number, dLng: number): LatLng[] => [
  { lat: c.lat + dLat, lng: c.lng - dLng },
  { lat: c.lat + dLat, lng: c.lng + dLng },
  { lat: c.lat - dLat, lng: c.lng + dLng },
  { lat: c.lat - dLat, lng: c.lng - dLng },
];

export const DEMO_STATE: GeoState = { code: 'MH', name: 'Maharashtra', defaultLanguage: 'mr' };
export const DEMO_CITY: GeoCity = { id: 'latur', stateCode: 'MH', name: 'Latur', timezone: 'Asia/Kolkata', center: LATUR_CENTER };

export const DEMO_ZONES: GeoZone[] = [
  { id: 'latur-central', cityId: 'latur', name: 'Latur Central', boundary: box({ lat: 18.407, lng: 76.568 }, 0.02, 0.02), neighbours: ['latur-east', 'latur-west', 'latur-north'], active: true },
  { id: 'latur-east', cityId: 'latur', name: 'Latur East', boundary: box({ lat: 18.407, lng: 76.608 }, 0.02, 0.02), neighbours: ['latur-central', 'latur-north'], active: true },
  { id: 'latur-west', cityId: 'latur', name: 'Latur West', boundary: box({ lat: 18.407, lng: 76.528 }, 0.02, 0.02), neighbours: ['latur-central'], active: true },
  { id: 'latur-north', cityId: 'latur', name: 'Latur North', boundary: box({ lat: 18.447, lng: 76.568 }, 0.02, 0.02), neighbours: ['latur-central', 'latur-east'], active: true },
];

export const DEMO_STORE_HUB: Hub = {
  id: 'hub-store-a',
  zoneId: 'latur-central',
  kind: 'store',
  storeId: 'store-express-megamart',
  organizationId: 'org-express',
  name: 'Store A',
  address: 'Express MegaMart, Main Road, Latur Central',
  landmark: 'Opp. Ganesh Mandir',
  lat: 18.4062,
  lng: 76.5711,
  accuracyM: 6,
  source: 'merchant_pin',
  entranceNote: 'Delivery counter at the side gate',
};

export const DEMO_STORE_LINK: StoreLink = {
  storeId: 'store-express-megamart',
  storeName: 'Express MegaMart',
  organization: 'Express Retail Pvt Ltd',
  zoneName: 'Latur Central',
  managerName: 'Priya Deshmukh',
  dailyPayText: '₹450/day guaranteed + per-order pay',
  priority: 1,
  status: 'active',
  payoutMultiplier: 1.2,
};

export const DEMO_EARNINGS_RULE: EarningsRule = {
  id: 'rule-latur-3',
  cityId: 'latur',
  version: 3,
  base: 45,
  perKm: 6,
  peak: [
    { from: '12:00', to: '14:00', amount: 15, label: 'Lunch peak' },
    { from: '19:00', to: '22:00', amount: 15, label: 'Dinner peak' },
  ],
  waitFreeMin: 10,
  waitPerMin: 2,
  activeFrom: '2026-09-01T00:00:00+05:30',
};

const now = () => new Date();
const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number, h = 10, m = 0) => {
  const d = now();
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d;
};
/** Today's entries are relative to now so they never sort into the future early in the day. */
const minutesAgo = (m: number) => new Date(now().getTime() - m * 60000);

export const makeDemoRider = (over: Partial<Rider> = {}): Rider => ({
  id: 'rider-1001',
  riderCode: DEMO_RIDER_CODE,
  userId: `demo-user-${DEMO_RETURNING_PHONE}`,
  phone: DEMO_RETURNING_PHONE,
  fullName: DEMO_RIDER_NAME,
  emergencyPhone: '9822011223',
  language: 'en',
  type: 'store',
  status: 'approved',
  cityId: 'latur',
  zoneId: 'latur-central',
  hubId: DEMO_STORE_HUB.id,
  organizationId: 'org-express',
  tier: 'vip',
  preferences: { categories: ['on_order', 'quick_drop'], acceptance: 'manual', multiStore: false, storeIds: ['store-express-megamart'] },
  cashLimit: 2000,
  referralCode: 'RAHUL10',
  createdAt: iso(daysAgo(40)),
  updatedAt: iso(now()),
  ...over,
});

export const DEMO_VEHICLE: RiderVehicle = { class: '2w', ownership: 'own', registrationNo: 'MH 24 AB 1234', model: 'TVS iQube', rcDocumentId: 'doc-rc' };

export const DEMO_DOCUMENTS: RiderDocument[] = [
  { id: 'doc-aadhaar', kind: 'aadhaar', status: 'verified', numberMasked: 'XXXX XXXX 4821', source: 'digilocker', reviewedAt: iso(daysAgo(38)) },
  { id: 'doc-pan', kind: 'pan', status: 'verified', numberMasked: 'ABCPS****K', source: 'digilocker', reviewedAt: iso(daysAgo(38)) },
  { id: 'doc-dl', kind: 'dl', status: 'verified', numberMasked: 'MH24 2019******', source: 'upload', expiresOn: '2029-03-14', reviewedAt: iso(daysAgo(37)) },
  { id: 'doc-rc', kind: 'rc', status: 'verified', numberMasked: 'MH 24 AB 1234', source: 'upload', expiresOn: '2038-01-01', reviewedAt: iso(daysAgo(37)) },
  { id: 'doc-selfie', kind: 'selfie', status: 'verified', source: 'upload', reviewedAt: iso(daysAgo(38)) },
];

export const DEMO_PAYOUT: PayoutMethod = { id: 'payout-1', method: 'upi', vpa: 'rahul.sharma@ybl', verifiedName: 'RAHUL SHARMA', verifiedAt: iso(daysAgo(36)), status: 'verified', isPrimary: true };

const baseJob = (over: Partial<Job> & Pick<Job, 'id' | 'orderRef' | 'pickup' | 'drop'>): Job => ({
  state: 'created',
  version: 0,
  category: 'on_order',
  cityId: 'latur',
  pickupZone: 'latur-central',
  dropZone: 'latur-east',
  items: [],
  itemsCount: 1,
  cashToCollect: 0,
  proofMethods: ['otp', 'photo'],
  payoutEstimate: 0,
  eta: { toPickupMin: 6, toDropMin: 14 },
  distanceKm: 4.2,
  pickupDistanceKm: 1.2,
  deadlines: {},
  otpAttempts: 0,
  otpLocked: false,
  createdAt: iso(now()),
  updatedAt: iso(now()),
  ...over,
});

/** Jobs waiting to be dispatched to the demo rider, in order. */
export const makePendingJobs = (): Job[] => [
  baseJob({
    id: 'job-9830',
    orderRef: '#9830',
    category: 'on_order',
    pickup: { name: 'Gourmet Kitchen', address: 'Sector 4, Block B', area: 'Latur Central', lat: 18.4088, lng: 76.5604, accuracyM: 8, source: 'merchant_pin', entranceNote: 'Side gate', phoneMasked: true, storeId: 'store-gourmet' },
    drop: { area: 'Shanti Enclave', address: 'Apt 4B, Shanti Enclave, Sector 15', lat: 18.4211, lng: 76.5793, accuracyM: 12, source: 'customer_pin', confidence: 0.86, landmark: 'Opp. temple', customerFirstName: 'Amit', instructions: 'Leave at door, contactless', flatFloor: 'Apt 4B, 2nd floor' },
    items: [
      { id: 'i1', name: 'Paneer Butter Masala', qty: 1, sku: 'GK-PBM' },
      { id: 'i2', name: 'Butter Naan (2 pcs)', qty: 2, sku: 'GK-BN' },
      { id: 'i3', name: 'Masala Chaas', qty: 1, sku: 'GK-MC' },
    ],
    itemsCount: 3,
    payoutEstimate: 142.5,
    surgeMultiplier: 1.5,
    eta: { toPickupMin: 6, toDropMin: 14 },
    distanceKm: 4.2,
    pickupDistanceKm: 1.4,
    merchantNote: 'Order includes hot items — use the insulated bag.',
    pickupCodeHint: 'OL-9830',
  }),
  baseJob({
    id: 'job-9824',
    orderRef: '#9824',
    category: 'quick_drop',
    dropZone: 'latur-central',
    pickup: { name: 'Express MegaMart', address: 'Main Road, Latur Central', area: 'Latur Central', lat: DEMO_STORE_HUB.lat, lng: DEMO_STORE_HUB.lng, accuracyM: 6, source: 'merchant_pin', entranceNote: 'Delivery counter at the side gate', phoneMasked: true, storeId: 'store-express-megamart' },
    drop: { area: 'Ganesh Nagar', address: 'House 12, Lane 3, Ganesh Nagar', lat: 18.399, lng: 76.582, accuracyM: 9, source: 'customer_pin', confidence: 0.92, landmark: 'Near water tank', customerFirstName: 'Sneha', instructions: 'Ring the bell twice' },
    items: [
      { id: 'g1', name: 'Amul Milk 1L', qty: 2, sku: 'EM-MILK' },
      { id: 'g2', name: 'Brown Bread', qty: 1, sku: 'EM-BREAD' },
      { id: 'g3', name: 'Bananas (dozen)', qty: 1, sku: 'EM-BAN' },
      { id: 'g4', name: 'Eggs (6)', qty: 1, sku: 'EM-EGG' },
    ],
    itemsCount: 4,
    cashToCollect: 486,
    proofMethods: ['otp', 'photo'],
    payoutEstimate: 78,
    eta: { toPickupMin: 3, toDropMin: 9 },
    distanceKm: 2.6,
    pickupDistanceKm: 0.3,
    pickupCodeHint: 'OL-9824',
  }),
  baseJob({
    id: 'job-9825',
    orderRef: '#9825',
    category: 'pick_drop',
    dropZone: 'latur-north',
    pickup: { name: 'Sai Courier Point', address: 'Shop 3, Station Road', area: 'Latur Central', lat: 18.4041, lng: 76.5622, accuracyM: 10, source: 'merchant_pin', phoneMasked: true, storeId: 'store-sai-courier' },
    drop: { area: 'Ram Nagar', address: 'Plot 22, Ram Nagar, Latur North', lat: 18.4392, lng: 76.5665, accuracyM: 15, source: 'geocoded', confidence: 0.58, landmark: 'Behind bus depot', customerFirstName: 'Vikram', instructions: 'Collect signature from Vikram only' },
    items: [{ id: 'p1', name: 'Sealed document parcel', qty: 1, sku: 'SC-DOC' }],
    itemsCount: 1,
    proofMethods: ['signature', 'photo'],
    payoutEstimate: 96,
    eta: { toPickupMin: 5, toDropMin: 16 },
    distanceKm: 4.9,
    pickupDistanceKm: 1.1,
    merchantNote: 'Address confidence is low — call before arrival.',
    pickupCodeHint: 'OL-9825',
  }),
];

/** Completed history (today + yesterday) with computed earnings. */
export const makeHistory = (): { job: Job; earnings?: JobEarnings }[] => {
  const mk = (id: string, ref: string, pickupName: string, dropArea: string, km: number, when: Date, total: number, opts: Partial<Job> = {}, earn: Partial<JobEarnings> = {}): { job: Job; earnings?: JobEarnings } => {
    const state = opts.state ?? 'delivered';
    const job = baseJob({
      id,
      orderRef: ref,
      pickup: { name: pickupName, address: 'Latur Central', area: 'Latur Central', lat: DEMO_STORE_HUB.lat, lng: DEMO_STORE_HUB.lng, accuracyM: 8, source: 'merchant_pin', phoneMasked: true },
      drop: { area: dropArea, address: null, lat: 18.41, lng: 76.58, accuracyM: 10, source: 'customer_pin', customerFirstName: 'Customer' },
      state,
      version: 12,
      distanceKm: km,
      payoutEstimate: total,
      createdAt: iso(when),
      updatedAt: iso(when),
      acceptedAt: iso(when),
      deliveredAt: state === 'delivered' ? iso(new Date(when.getTime() + 25 * 60000)) : undefined,
      ...opts,
    });
    const earnings: JobEarnings | undefined =
      state === 'delivered'
        ? {
            jobId: id,
            base: 45,
            distance: Math.round(km * 6 * 100) / 100,
            peak: 0,
            wait: 0,
            tip: 0,
            bonus: 0,
            total,
            ruleVersion: 3,
            distanceKm: km,
            createdAt: iso(new Date(when.getTime() + 25 * 60000)),
            ...earn,
          }
        : undefined;
    return { job, earnings };
  };
  // Today: 4 delivered = ₹780 (sample amounts)
  const today = [
    mk('job-9818', '#9818', 'Express MegaMart', 'Shivaji Nagar', 5.5, minutesAgo(265), 210, { category: 'quick_drop' }, { base: 45, distance: 33, peak: 15, tip: 20, bonus: 97, total: 210 }),
    mk('job-9815', '#9815', 'Gourmet Kitchen', 'Nanded Road', 4.1, minutesAgo(190), 195, {}, { base: 45, distance: 24.6, peak: 15, tip: 10, bonus: 100.4, total: 195 }),
    mk('job-9812', '#9812', 'Express MegaMart', 'Ausa Road', 3.8, minutesAgo(105), 185, { category: 'quick_drop', cashToCollect: 320 }, { base: 45, distance: 22.8, peak: 15, tip: 0, bonus: 102.2, total: 185 }),
    mk('job-9807', '#9807', 'Sai Courier Point', 'MIDC Latur', 6.2, minutesAgo(45), 190, { category: 'pick_drop', proofMethods: ['signature'] }, { base: 45, distance: 37.2, peak: 15, tip: 0, bonus: 92.8, total: 190 }),
  ];
  const yesterday = [
    mk('job-9790', '#9790', 'Express MegaMart', 'Shanti Enclave', 4.0, daysAgo(1, 9, 10), 220, {}, { base: 45, distance: 24, peak: 0, tip: 25, bonus: 126, total: 220 }),
    mk('job-9785', '#9785', 'Gourmet Kitchen', 'Ganesh Nagar', 3.2, daysAgo(1, 13, 5), 210, {}, { base: 45, distance: 19.2, peak: 15, tip: 10, bonus: 120.8, total: 210 }),
    mk('job-9781', '#9781', 'Express MegaMart', 'Ram Nagar', 5.1, daysAgo(1, 18, 20), 210, {}, { base: 45, distance: 30.6, peak: 0, tip: 0, bonus: 134.4, total: 210 }),
    mk('job-9777', '#9777', 'Sai Courier Point', 'Barshi Road', 7.3, daysAgo(1, 20, 15), 0, { state: 'failed', failureReason: 'Customer unavailable — returned to store' }),
  ];
  return [...today, ...yesterday];
};

export const makeNotifications = (): RiderNotification[] => [
  { id: 'n-1', kind: 'incentive', title: 'Peak incentive active', body: 'Earn ₹50 extra on every order between 7–10 PM today.', createdAt: iso(minutesAgo(320)), readAt: null, deepLink: '/earnings' },
  { id: 'n-2', kind: 'payment_disbursed', title: 'Weekly payout sent', body: '₹3,120 was transferred to rahul.sharma@ybl.', createdAt: iso(daysAgo(1, 9, 0)), readAt: iso(daysAgo(1, 9, 30)), deepLink: '/earnings/week' },
  { id: 'n-3', kind: 'document_expiry', title: 'Driving licence check', body: 'Your DL is valid until 14 Mar 2029. No action needed.', createdAt: iso(daysAgo(2, 10, 0)), readAt: iso(daysAgo(2, 12, 0)), deepLink: '/profile' },
  { id: 'n-4', kind: 'tier_upgrade', title: "You're now a VIP rider", body: 'Priority dispatch and 1.2x payout on linked store orders.', createdAt: iso(daysAgo(3, 15, 0)), readAt: iso(daysAgo(3, 15, 5)), deepLink: '/profile' },
  { id: 'n-5', kind: 'order_reassigned', title: 'Order #9770 reassigned', body: 'The order was reassigned after a vehicle breakdown report. No penalty applied.', createdAt: iso(daysAgo(4, 19, 40)), readAt: iso(daysAgo(4, 20, 0)), deepLink: '/tasks' },
];

export const makeLedger = (): CashLedgerEntry[] => [
  { id: 'l-1', jobId: 'job-9812', kind: 'collected', amount: 320, createdAt: iso(minutesAgo(70)), note: 'COD #9812' },
  { id: 'l-2', kind: 'deposited', amount: 1500, createdAt: iso(daysAgo(1, 21, 0)), note: 'Deposited at Store A' },
  { id: 'l-3', jobId: 'job-9781', kind: 'collected', amount: 640, createdAt: iso(daysAgo(1, 18, 50)), note: 'COD #9781' },
  { id: 'l-4', jobId: 'job-9790', kind: 'collected', amount: 860, createdAt: iso(daysAgo(1, 9, 40)), note: 'COD #9790' },
];

/** Weekly series (sample): Mon…Sun ending today = ₹3,420. */
export const makeWeekSeries = () => {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const amounts = [560, 690, 750, 640, 780]; // 5 working days back to today
  const jobs = [3, 4, 4, 3, 4];
  const series = [] as { date: string; label: string; total: number; jobs: number }[];
  for (let i = amounts.length - 1; i >= 0; i--) {
    const d = daysAgo(i);
    series.push({ date: d.toISOString().slice(0, 10), label: labels[d.getDay()]!, total: amounts[amounts.length - 1 - i]!, jobs: jobs[jobs.length - 1 - i]! });
  }
  return series;
};
