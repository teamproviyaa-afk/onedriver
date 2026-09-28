import { DEMO_RIDER_CODE } from '@/demo/constants';
import { DEMO_PAYOUT } from '@/demo/seed';
import { isLocalDemo } from '@/config/env';
import { useWallet } from '@/hooks/queries';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import type { PayoutMethod, Rider } from '@/types';

/** Masks a UPI VPA: `rahul.sharma@ybl` → `ra•••••@ybl`. */
export const maskVpa = (vpa: string): string => {
  const [user = '', handle = ''] = vpa.split('@');
  const head = user.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(3, Math.min(6, user.length - head.length)))}${handle ? `@${handle}` : ''}`;
};

export interface PayoutDisplay {
  title: string;
  subtitle: string;
  method: PayoutMethod['method'];
  status: PayoutMethod['status'];
}

/** Display copy for the profile payout card (always masked — never the full account or VPA). */
export const describePayout = (p: PayoutMethod): PayoutDisplay => {
  const primary = p.isPrimary ? ' · Primary' : '';
  if (p.method === 'upi') {
    return { method: 'upi', status: p.status, title: `UPI${primary}`, subtitle: `UPI: ${p.vpa ? maskVpa(p.vpa) : '••••'}${p.verifiedName ? ` • ${p.verifiedName}` : ''}` };
  }
  return { method: 'bank', status: p.status, title: `Bank account${primary}`, subtitle: `A/C: ****${p.accountLast4 ?? '••••'}${p.ifsc ? ` • ${p.ifsc}` : ''}${p.verifiedName ? ` • ${p.verifiedName}` : ''}` };
};

/**
 * `GET /rider/me` does not carry the payout method: the verified account comes from
 * `GET /rider/wallet`; until that loads (or when it is unavailable) the profile falls back
 * to the onboarding draft (riders who enrolled on this device) and, for the seeded demo
 * rider in local demo mode, to the demo fixture. Returns null when nothing is set up.
 */
export const usePayoutMethod = (rider: Rider | null | undefined): PayoutMethod | null => {
  const draft = useOnboardingStore((s) => s.payout);
  const wallet = useWallet();
  if (wallet.data?.payoutMethod) return wallet.data.payoutMethod;
  if (draft) {
    if (draft.method === 'upi') {
      return { id: 'draft-upi', method: 'upi', vpa: draft.vpa, verifiedName: draft.verifiedName, status: draft.verifiedName ? 'verified' : 'pending', isPrimary: true };
    }
    return { id: 'draft-bank', method: 'bank', holderName: draft.holder, accountLast4: draft.accountLast4, ifsc: draft.ifsc, verifiedName: draft.verifiedName, status: draft.verifiedName ? 'verified' : 'pending', isPrimary: true };
  }
  if (isLocalDemo && rider && rider.riderCode === DEMO_RIDER_CODE) return DEMO_PAYOUT;
  return null;
};
