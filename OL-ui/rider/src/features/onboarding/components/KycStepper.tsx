import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText } from '@/components/ui';

const STAGES = ['Submitted', 'Under Review', 'Verified'] as const;

export interface KycStepperProps {
  /** Number of completed stages (0–3): the next stage renders as current, the rest as future. */
  completed: number;
}

/** store-kyc stepper row: 20px numbered circles, 25px connectors, labels 10px ExtraBold (future step at 50%). */
export const KycStepper = ({ completed }: KycStepperProps) => (
  <View style={styles.row} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: STAGES.length, now: completed }}>
    {STAGES.map((label, i) => {
      const done = i < completed;
      const current = i === completed;
      const future = !done && !current;
      return (
        <View key={label} style={styles.item}>
          {i > 0 ? <View style={[styles.line, { backgroundColor: future ? colors.borderSubtle : colors.border }]} /> : null}
          <View style={[styles.step, future && styles.future]}>
            <View style={[styles.circle, done ? styles.circleDone : { borderColor: current ? colors.border : colors.borderSubtle }]}>
              <AppText variant="labelXs" color={done ? 'lime' : current ? 'ink' : 'textSecondary'} style={styles.number}>
                {String(i + 1)}
              </AppText>
            </View>
            <AppText variant="labelXs" color={future ? 'textSecondary' : 'ink'} style={future ? styles.futureLabel : undefined}>
              {label}
            </AppText>
          </View>
        </View>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, paddingVertical: 3, alignSelf: 'stretch' },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  step: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  future: { opacity: 0.5 },
  line: { width: 25, height: 2, borderRadius: 1 },
  circle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  circleDone: { backgroundColor: colors.ink, borderColor: colors.ink },
  number: { fontSize: 9, lineHeight: 11 },
  futureLabel: { fontSize: 9, lineHeight: 12 },
});
