import type { IsoDate, Rupees } from './common';

export interface EarningsRule {
  id: string;
  cityId: string;
  version: number;
  base: Rupees;
  perKm: Rupees;
  /** Peak windows: [{ from: 'HH:mm', to: 'HH:mm', amount }] */
  peak: { from: string; to: string; amount: Rupees; label?: string }[];
  waitFreeMin: number;
  waitPerMin: Rupees;
  activeFrom: IsoDate;
}

export interface JobEarnings {
  jobId: string;
  base: Rupees;
  distance: Rupees;
  peak: Rupees;
  wait: Rupees;
  tip: Rupees;
  bonus: Rupees;
  total: Rupees;
  ruleVersion: number;
  distanceKm: number;
  waitMinutes?: number;
  createdAt: IsoDate;
}

export interface EarningsSplit {
  orderPay: Rupees;
  milestoneBonus: Rupees;
  tips: Rupees;
  peakIncentive: Rupees;
}

export interface DayEarnings {
  date: string; // YYYY-MM-DD
  label: string; // Mon, Tue…
  total: Rupees;
  jobs: number;
}

export interface EarningsSummary {
  range: 'today' | 'week' | 'month';
  total: Rupees;
  deliveries: number;
  averagePerTrip: Rupees;
  split: EarningsSplit;
  series: DayEarnings[];
  insights: { title: string; body: string; tone?: 'positive' | 'neutral' | 'warning' }[];
  periodLabel: string;
  bestDay?: DayEarnings;
  ruleVersion: number;
}

export type CashLedgerKind = 'collected' | 'deposited' | 'adjustment';

export interface CashLedgerEntry {
  id: string;
  jobId?: string;
  kind: CashLedgerKind;
  amount: Rupees;
  createdAt: IsoDate;
  note?: string;
}

export interface CashSummary {
  cashInHand: Rupees;
  cashLimit: Rupees;
  blocked: boolean;
  ledger: CashLedgerEntry[];
  depositInstructions: string;
  /** Pay the cash in hand by UPI (Cashfree Payment Gateway). Absent / disabled → counter deposits only. */
  upiDeposit?: { enabled: boolean; minAmount: Rupees; maxAmount: Rupees };
}

/**
 * pending — waiting for the rider to pay on the Cashfree checkout; paid — Cashfree confirmed it and
 * the cash ledger is credited; expired / cancelled / failed — nothing was taken.
 */
export type CashDepositStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed';

export interface CashDeposit {
  id: string;
  amount: Rupees;
  status: CashDepositStatus;
  /** Cashfree checkout page, only while the deposit can be paid. */
  checkoutUrl?: string;
  expiresAt?: IsoDate;
  /** UPI / bank reference once paid. */
  reference?: string;
  /** upi, net_banking … */
  method?: string;
  createdAt: IsoDate;
  paidAt?: IsoDate;
}
