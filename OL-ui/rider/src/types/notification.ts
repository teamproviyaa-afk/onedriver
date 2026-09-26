import type { IsoDate } from './common';

export type NotificationKind =
  | 'new_delivery'
  | 'incentive'
  | 'document_expiry'
  | 'payment_disbursed'
  | 'order_reassigned'
  | 'tier_upgrade'
  | 'system';

export interface RiderNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: IsoDate;
  readAt?: IsoDate | null;
  /** Deep link inside the app, e.g. /offer/abc or /earnings/week. */
  deepLink?: string;
  data?: Record<string, unknown>;
}
