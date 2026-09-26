import { isLocalDemo } from '@/config/env';
import { toast } from '@/components/ui';
import { openDialer } from '@/navigation/openNavigation';

/** Demo merchant desk number — the server never exposes merchant phones to the app. */
const MERCHANT_DEMO_NUMBER = '+91 98220 11223';

/**
 * "Contact Merchant" on the order-not-ready / mismatch / incomplete screens. The local demo
 * dials the demo desk; other builds get a coming-soon toast until the merchant call bridge ships.
 */
export const contactMerchant = async (): Promise<void> => {
  if (!isLocalDemo) {
    toast.show('Calling the merchant is coming soon');
    return;
  }
  const ok = await openDialer(MERCHANT_DEMO_NUMBER);
  if (!ok) toast.error('Could not open the dialer');
};
