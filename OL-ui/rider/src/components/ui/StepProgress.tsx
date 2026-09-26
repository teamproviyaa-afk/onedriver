import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';

export interface StepProgressProps {
  step: number;
  total: number;
  label?: string;
}

/** Onboarding progress ("Step 1/5") — lime track segment on a muted rail. */
export const StepProgress = ({ step, total, label }: StepProgressProps) => (
  <View style={styles.wrap} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: step }}>
    <View style={styles.row}>
      <AppText variant="label" color="textSecondary" uppercase>
        {label ?? `Step ${step}/${total}`}
      </AppText>
      <AppText variant="label" color="ink">
        {Math.round((step / total) * 100)}%
      </AppText>
    </View>
    <View style={styles.rail}>
      <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, (step / total) * 100))}%` }]} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, alignSelf: 'stretch' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rail: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.lime, borderRadius: radius.pill },
});
