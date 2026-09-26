/**
 * Earnings = base + distance + peak/surge + wait compensation + tip (100 % rider).
 * Rules are configuration (spec R10); the rule version is stored with the job.
 */
import type { EarningsRule, JobEarnings } from '@/types';

export interface EarningsInput {
  jobId: string;
  distanceKm: number;
  /** Minutes waited at pickup (compensated beyond rule.waitFreeMin). */
  waitMinutes?: number;
  tip?: number;
  bonus?: number;
  /** Local time of pickup, HH:mm, used to match peak windows. */
  pickupTime?: string;
  surgeMultiplier?: number;
  at?: string;
}

const inWindow = (hhmm: string, from: string, to: string): boolean => {
  const [h, m] = hhmm.split(':').map(Number);
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const t = h! * 60 + m!;
  const f = fh! * 60 + fm!;
  const e = th! * 60 + tm!;
  return f <= e ? t >= f && t < e : t >= f || t < e; // handles windows crossing midnight
};

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const peakAmount = (rule: EarningsRule, pickupTime?: string): number => {
  if (!pickupTime) return 0;
  return rule.peak.filter((w) => inWindow(pickupTime, w.from, w.to)).reduce((sum, w) => sum + w.amount, 0);
};

export const waitCompensation = (rule: EarningsRule, waitMinutes = 0): number => {
  const billable = Math.max(0, waitMinutes - rule.waitFreeMin);
  return round2(billable * rule.waitPerMin);
};

export const computeEarnings = (rule: EarningsRule, input: EarningsInput): JobEarnings => {
  const base = round2(rule.base);
  const distance = round2(input.distanceKm * rule.perKm);
  const surge = input.surgeMultiplier && input.surgeMultiplier > 1 ? round2((base + distance) * (input.surgeMultiplier - 1)) : 0;
  const peak = round2(peakAmount(rule, input.pickupTime) + surge);
  const wait = waitCompensation(rule, input.waitMinutes);
  const tip = round2(input.tip ?? 0); // 100 % to the rider
  const bonus = round2(input.bonus ?? 0);
  const total = round2(base + distance + peak + wait + tip + bonus);
  return {
    jobId: input.jobId,
    base,
    distance,
    peak,
    wait,
    tip,
    bonus,
    total,
    ruleVersion: rule.version,
    distanceKm: input.distanceKm,
    waitMinutes: input.waitMinutes,
    createdAt: input.at ?? new Date().toISOString(),
  };
};

/** Estimate shown on the offer card (no tip / wait yet). */
export const estimatePayout = (rule: EarningsRule, distanceKm: number, surgeMultiplier = 1, pickupTime?: string): number =>
  computeEarnings(rule, { jobId: 'estimate', distanceKm, surgeMultiplier, pickupTime }).total;
