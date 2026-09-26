import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AcceptanceMode, AppLanguage, DeliveryCategory, DocumentKind, DocumentStatus, RiderType, VehicleClass, VehicleOwnership } from '@/types';
import { zustandStorage } from './storage';

export type OnboardingStep =
  | 'profile'
  | 'zone'
  | 'hub'
  | 'hub_confirm'
  | 'notifications'
  | 'type'
  | 'store_link'
  | 'kyc'
  | 'vehicle'
  | 'categories'
  | 'stores'
  | 'acceptance'
  | 'priority'
  | 'payout'
  | 'submitted';

export const STORE_RIDER_STEPS: OnboardingStep[] = ['profile', 'zone', 'hub', 'hub_confirm', 'notifications', 'type', 'store_link', 'kyc', 'vehicle', 'categories', 'stores', 'acceptance', 'priority', 'submitted'];
export const SOLO_RIDER_STEPS: OnboardingStep[] = ['profile', 'zone', 'hub', 'hub_confirm', 'notifications', 'type', 'kyc', 'vehicle', 'categories', 'acceptance', 'payout', 'submitted'];

interface OnboardingDraft {
  fullName: string;
  emergencyPhone: string;
  language: AppLanguage;
  photoUri?: string;
  photoAssetId?: string;
  cityId?: string;
  zoneId?: string;
  zoneName?: string;
  hub?: { lat: number; lng: number; address: string; landmark?: string; name?: string };
  hubConfirmed: boolean;
  riderType?: RiderType;
  storeInviteCode?: string;
  storeLinked?: { storeId: string; storeName: string; organization: string; managerName: string; dailyPayText: string; zoneName: string };
  documents: Partial<Record<DocumentKind, { status: DocumentStatus; assetId?: string; number?: string; source: 'digilocker' | 'upload' }>>;
  vehicle?: { class: VehicleClass; ownership: VehicleOwnership; registrationNo: string; rcAssetId?: string };
  categories: DeliveryCategory[];
  multiStore: boolean;
  storeIds: string[];
  acceptance: AcceptanceMode;
  payout?: { method: 'bank' | 'upi'; verifiedName?: string; vpa?: string; accountLast4?: string; ifsc?: string; holder?: string };
  completed: OnboardingStep[];
}

interface OnboardingState extends OnboardingDraft {
  patch: (p: Partial<OnboardingDraft>) => void;
  complete: (step: OnboardingStep) => void;
  reset: () => void;
}

const initial: OnboardingDraft = {
  fullName: '',
  emergencyPhone: '',
  language: 'en',
  hubConfirmed: false,
  documents: {},
  categories: ['on_order'],
  multiStore: false,
  storeIds: [],
  acceptance: 'auto',
  completed: [],
};

/** Draft answers across onboarding screens (persisted so the rider can resume). */
export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initial,
      patch: (p) => set(p),
      complete: (step) => set((s) => ({ completed: s.completed.includes(step) ? s.completed : [...s.completed, step] })),
      reset: () => set({ ...initial }),
    }),
    { name: 'onelocal.rider.onboarding.v1', storage: zustandStorage },
  ),
);

/** Route for the next incomplete onboarding step given the draft. */
export const nextOnboardingRoute = (s: OnboardingDraft): string => {
  const steps = s.riderType === 'store' ? STORE_RIDER_STEPS : SOLO_RIDER_STEPS;
  const next = steps.find((step) => !s.completed.includes(step)) ?? 'submitted';
  return ONBOARDING_ROUTES[next];
};

export const ONBOARDING_ROUTES: Record<OnboardingStep, string> = {
  profile: '/onboarding/profile',
  zone: '/onboarding/zone',
  hub: '/onboarding/hub',
  hub_confirm: '/onboarding/hub/confirm',
  notifications: '/permissions/notifications',
  type: '/onboarding/type',
  store_link: '/onboarding/store/link',
  kyc: '/onboarding/kyc',
  vehicle: '/onboarding/vehicle',
  categories: '/onboarding/categories',
  stores: '/onboarding/stores',
  acceptance: '/onboarding/acceptance',
  priority: '/onboarding/priority',
  payout: '/onboarding/payout/bank',
  submitted: '/status',
};
