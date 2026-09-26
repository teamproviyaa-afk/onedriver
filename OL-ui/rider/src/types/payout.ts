import type { IsoDate, Rupees } from './common';

export type PayoutMethodKind = 'bank' | 'upi';

export type PayoutInput =
  | { method: 'bank'; holder: string; accountNo: string; ifsc: string }
  | { method: 'upi'; vpa: string };

export interface PayoutMethod {
  id: string;
  method: PayoutMethodKind;
  holderName?: string;
  accountLast4?: string;
  ifsc?: string;
  vpa?: string;
  verifiedName?: string;
  verifiedAt?: IsoDate;
  status: 'pending' | 'verified' | 'failed';
  isPrimary: boolean;
}

export interface Payout {
  id: string;
  periodStart: string;
  periodEnd: string;
  amount: Rupees;
  status: 'pending' | 'paid' | 'failed';
  reference?: string;
  paidAt?: IsoDate;
}
