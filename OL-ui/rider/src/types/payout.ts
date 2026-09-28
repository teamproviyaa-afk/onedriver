import type { IsoDate, Rupees } from './common';

export type PayoutMethodKind = 'bank' | 'upi';

export type PayoutInput =
  | { method: 'bank'; holder: string; accountNo: string; ifsc: string }
  | { method: 'upi'; vpa: string };

/** How closely the name registered at the bank matches the rider's legal name (a poor match is rejected). */
export type PayoutNameMatch = 'good' | 'partial' | 'poor';

export interface PayoutMethod {
  id: string;
  method: PayoutMethodKind;
  holderName?: string;
  accountLast4?: string;
  ifsc?: string;
  vpa?: string;
  bankName?: string;
  verifiedName?: string;
  nameMatch?: PayoutNameMatch;
  verifiedAt?: IsoDate;
  status: 'pending' | 'verified' | 'failed';
  isPrimary: boolean;
  /** Who verified the account and sends the money (Cashfree Payouts in production). */
  provider?: 'cashfree' | 'demo';
}

export type PayoutKind = 'instant' | 'weekly';

/**
 * processing — sent to the bank; unknown — the server is confirming with Cashfree (never re-sent);
 * success — credited (UTR available); failed / reversed — the amount is back in the balance.
 */
export type PayoutTransferStatus = 'processing' | 'unknown' | 'success' | 'failed' | 'reversed';

/** One transfer to the rider's verified account (weekly settlement or an instant withdrawal). */
export interface PayoutTransfer {
  id: string;
  kind: PayoutKind;
  mode: 'upi' | 'imps';
  /** Amount deducted from the balance. */
  amount: Rupees;
  fee: Rupees;
  /** Amount credited to the rider (amount − fee). */
  net: Rupees;
  status: PayoutTransferStatus;
  /** Bank reference number once credited. */
  utr?: string;
  /** Why it failed or was reversed, in plain words. */
  statusDescription?: string;
  /** Masked destination, e.g. "UPI ra•••••@ybl" or "A/C ****4521". */
  destination: string;
  /** Weekly payouts: "21–27 Sep". */
  periodLabel?: string;
  createdAt: IsoDate;
  completedAt?: IsoDate;
}

/** GET /rider/wallet — what the rider can withdraw right now. The server computes every number. */
export interface WalletSummary {
  /** Earnings not yet paid out. */
  balance: Rupees;
  /** Part of the balance the rider can withdraw now. */
  available: Rupees;
  /** Withdrawals still being processed (already deducted from the balance). */
  inFlight: Rupees;
  instant: {
    /** False until the server has a payout provider configured — then only the weekly payout runs. */
    enabled: boolean;
    minAmount: Rupees;
    maxAmount: Rupees;
    /** Flat fee per instant withdrawal (0 = free). */
    fee: Rupees;
    withdrawalsLeftToday: number;
    /** Why a withdrawal is not possible right now (e.g. cash in hand above the limit). */
    blockedReason?: string;
  };
  weekly: { nextPayoutAt: IsoDate; description: string };
  payoutMethod: PayoutMethod | null;
  recent: PayoutTransfer[];
}
