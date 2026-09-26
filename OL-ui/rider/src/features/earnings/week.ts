import type { DayEarnings } from '@/types';

/** ISO-8601 week id for the statement endpoint, e.g. `2026-W39`. */
export const isoWeekOf = (d: Date): string => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7; // Mon=1 … Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - day); // nearest Thursday decides the year
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

/** Parses the `YYYY-MM-DD` series date as a local calendar day. */
export const seriesDate = (day: DayEarnings): Date => new Date(`${day.date}T00:00:00`);

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "12 - 18 OCT" (or "29 SEP - 3 OCT" across months) for the weekly hero label. */
export const weekRangeLabel = (series: DayEarnings[]): string => {
  if (!series.length) return '';
  const a = seriesDate(series[0]!);
  const b = seriesDate(series[series.length - 1]!);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} - ${b.getDate()} ${MONTHS[a.getMonth()]}`;
  return `${a.getDate()} ${MONTHS[a.getMonth()]} - ${b.getDate()} ${MONTHS[b.getMonth()]}`;
};
