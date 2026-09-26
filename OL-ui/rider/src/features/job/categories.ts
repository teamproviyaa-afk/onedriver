import type { IconName } from '@/components/ui';
import type { DeliveryCategory } from '@/types';

/** Job badge copy per category (Figma job-offer-manual "FOOD DELIVERY"). */
export const CATEGORY_LABEL: Record<DeliveryCategory, string> = {
  on_order: 'FOOD DELIVERY',
  quick_drop: 'GROCERY',
  pick_drop: 'PARCEL',
};

export const CATEGORY_ICON: Record<DeliveryCategory, IconName> = {
  on_order: 'utensils',
  quick_drop: 'shopping-bag',
  pick_drop: 'package',
};
