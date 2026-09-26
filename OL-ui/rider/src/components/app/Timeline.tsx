import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText, Icon } from '@/components/ui';

export interface TimelineStepProps {
  title: string;
  subtitle?: string;
  time?: string;
  state: 'done' | 'active' | 'pending' | 'failed';
  last?: boolean;
}

export const TimelineStep = ({ title, subtitle, time, state, last }: TimelineStepProps) => (
  <View style={styles.step}>
    <View style={styles.rail}>
      <View style={[styles.node, state === 'done' && styles.nodeDone, state === 'active' && styles.nodeActive, state === 'failed' && styles.nodeFailed]}>
        {state === 'done' ? <Icon name="check" size={10} strokeWidth={3} /> : state === 'failed' ? <Icon name="x" size={10} color="surface" strokeWidth={3} /> : null}
      </View>
      {!last ? <View style={[styles.line, state === 'done' && styles.lineDone]} /> : null}
    </View>
    <View style={[styles.body, !last && styles.bodyGap]}>
      <View style={styles.titleRow}>
        <AppText variant={state === 'pending' ? 'bodySemi' : 'bodyBold'} color={state === 'pending' ? 'textSecondary' : 'ink'} style={styles.title}>
          {title}
        </AppText>
        {time ? (
          <AppText variant="bodySm" color="textSecondary">
            {time}
          </AppText>
        ) : null}
      </View>
      {subtitle ? (
        <AppText variant="bodySm" color="textSecondary">
          {subtitle}
        </AppText>
      ) : null}
    </View>
  </View>
);

export const Timeline = ({ steps }: { steps: Omit<TimelineStepProps, 'last'>[] }) => (
  <View>
    {steps.map((s, i) => (
      <TimelineStep key={`${s.title}-${i}`} {...s} last={i === steps.length - 1} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: spacing.lg },
  rail: { alignItems: 'center', width: 20 },
  node: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  nodeDone: { backgroundColor: colors.lime, borderColor: colors.lime },
  nodeActive: { borderColor: colors.ink },
  nodeFailed: { backgroundColor: colors.danger, borderColor: colors.danger },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  lineDone: { backgroundColor: colors.lime },
  body: { flex: 1, gap: 2, paddingTop: 1 },
  bodyGap: { paddingBottom: spacing.xxl },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  title: { flex: 1 },
});
