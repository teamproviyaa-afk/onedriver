import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText, Icon } from '@/components/ui';

export interface JobStepperProps {
  steps: { label: string; done: boolean; active: boolean }[];
}

/** "At Store — Delivery — Verify" stepper from current-job / delivery-confirmation bottom drawers. */
export const JobStepper = ({ steps }: JobStepperProps) => (
  <View style={styles.row} accessibilityRole="progressbar">
    {steps.map((s, i) => (
      <View key={s.label} style={[styles.stepWrap, i < steps.length - 1 && styles.grow]}>
        <View style={styles.step}>
          <View style={[styles.dot, (s.done || s.active) && styles.dotActive]}>{s.done ? <Icon name="check" size={12} strokeWidth={3} /> : null}</View>
          <AppText variant={s.active || s.done ? 'titleSm' : 'bodySm'} color={s.active || s.done ? 'ink' : 'textSecondary'}>
            {s.label}
          </AppText>
        </View>
        {i < steps.length - 1 ? <View style={[styles.line, s.done && styles.lineDone]} /> : null}
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  stepWrap: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dotActive: { backgroundColor: colors.lime, borderColor: colors.lime },
  line: { flex: 1, height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md, minWidth: 16 },
  lineDone: { backgroundColor: colors.lime },
});
