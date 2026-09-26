import { StyleSheet, View } from 'react-native';

import { colors, fontFamily, spacing } from '@/theme';
import { AppText } from '@/components/ui';
import { formatINR } from '@/utils/format';
import { isSameLocalDay } from '@/utils/time';
import { seriesDate } from '@/features/earnings/week';
import type { DayEarnings } from '@/types';

export interface WeeklyChartProps {
  series: DayEarnings[];
  /** Height of the tallest bar (Figma: 152 in a 160 chart area). */
  barMaxHeight?: number;
  /** The day drawn in lime (Figma "current day"); defaults to today, else the last column. */
  now?: Date;
}

const MIN_BAR = 6;

/**
 * Figma earnings-weekly "DAILY HISTOGRAM": 5–7 columns (value · bar · day label) spread with
 * space-between in a 160px area. Bars are 16 wide, radius 8, #121212; the current day is lime
 * (#76EC00). Pure Views — no chart library.
 */
export const WeeklyChart = ({ series, barMaxHeight = 152, now }: WeeklyChartProps) => {
  const days = series.slice(-7);
  if (!days.length) {
    return (
      <View style={styles.empty}>
        <AppText variant="bodySm" color="textSecondary" align="center">
          No earnings recorded for this week yet.
        </AppText>
      </View>
    );
  }
  const today = now ?? new Date();
  const max = days.reduce((m, d) => Math.max(m, d.total), 0);
  const todayIdx = days.findIndex((d) => isSameLocalDay(seriesDate(d), today));
  const currentIdx = todayIdx === -1 ? days.length - 1 : todayIdx;
  const summary = days.map((d) => `${d.label} ${formatINR(Math.round(d.total))}`).join(', ');
  return (
    <View style={styles.piles} accessible accessibilityRole="image" accessibilityLabel={`Daily earnings: ${summary}`}>
      {days.map((d, i) => {
        const current = i === currentIdx;
        const height = max > 0 ? Math.max(MIN_BAR, Math.round((d.total / max) * barMaxHeight)) : MIN_BAR;
        return (
          <View key={d.date} style={styles.col}>
            <AppText color="textSecondary" style={styles.value} numberOfLines={1}>
              {formatINR(Math.round(d.total))}
            </AppText>
            <View style={[styles.bar, { height }, current && styles.barCurrent]} />
            <AppText variant="label" style={styles.day}>
              {d.label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  piles: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', alignSelf: 'stretch', minHeight: 160 },
  col: { alignItems: 'center', gap: spacing.md, width: 32 },
  value: { fontFamily: fontFamily.manropeBold, fontSize: 10, lineHeight: 14 },
  bar: { width: 16, borderRadius: 8, backgroundColor: colors.ink },
  barCurrent: { backgroundColor: colors.lime },
  day: { lineHeight: 16 },
  empty: { paddingVertical: spacing.x5l, alignItems: 'center' },
});
