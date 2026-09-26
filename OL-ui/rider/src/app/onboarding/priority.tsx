import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, Icon, PrimaryButton, Screen, toast } from '@/components/ui';
import { StepHeader, stepPosition } from '@/features/onboarding-setup/StepHeader';
import { getDataProvider } from '@/providers';
import { useOnboardingStore, useRiderStore } from '@/stores';
import { colors, spacing } from '@/theme';
import { ApiError } from '@/types';

const RULES = [
  { n: '1', title: 'Linked Store First Priority', body: 'Riders permanently waiting at the hub receive premium long-mile payouts and batch orders first.' },
  { n: '2', title: 'Nearby Solo Fallback', body: 'If the linked store has zero order volume, dispatch automatically rolls over to matching nearby Solo deliveries.' },
];

/** Onboarding — Rider Priority Rules (store 4/5): explainer, then the application is submitted for review. */
export default function PriorityScreen() {
  const riderType = useOnboardingStore((s) => s.riderType);
  const draftStoreName = useOnboardingStore((s) => s.storeLinked?.storeName);
  const serverStoreName = useRiderStore((s) => s.me?.storeLinks[0]?.storeName);
  const complete = useOnboardingStore((s) => s.complete);
  const storeName = draftStoreName ?? serverStoreName;
  const [busy, setBusy] = useState(false);
  const { step, total } = stepPosition(riderType, 'priority');

  const onSubmit = async () => {
    setBusy(true);
    try {
      await getDataProvider().submitApplication();
      complete('priority');
      complete('submitted');
      router.replace('/status' as never);
    } catch (e) {
      toast.error(ApiError.is(e) ? e.detail : 'Could not submit your application. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll footer={<PrimaryButton label="Submit application" onPress={() => void onSubmit()} loading={busy} />}>
      <View style={styles.body}>
        <StepHeader step={step} total={total} title="Rider Priority Rules" subtitle="How store linked assignments operate." backFallback="/onboarding/acceptance" />

        <View style={styles.graphic} accessibilityRole="summary">
          <Icon name="crown" size={64} color="lime" strokeWidth={1.75} />
          <AppText variant="titleLg" style={styles.graphicTitle} align="center">
            Store Priority Active
          </AppText>
          <AppText variant="bodySm" color="textSecondary" align="center">
            {storeName ? `Priority dispatch is bound to ${storeName}` : 'Priority dispatch is bound to your linked hub'}
          </AppText>
        </View>

        <View style={styles.rules}>
          {RULES.map((r, i) => (
            <View key={r.n} style={styles.rule}>
              <View style={[styles.bullet, i === 0 && styles.bulletActive]}>
                <AppText variant="label">{r.n}</AppText>
              </View>
              <View style={styles.ruleText}>
                <AppText variant="title">{r.title}</AppText>
                <AppText variant="bodySm" color="textSecondary">
                  {r.body}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.gutter, paddingBottom: spacing.x3l },
  graphic: { height: 180, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 32, padding: spacing.x3l, gap: spacing.lg, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  graphicTitle: { fontSize: 15, lineHeight: 20 },
  rules: { gap: spacing.xxl, alignSelf: 'stretch' },
  rule: { flexDirection: 'row', gap: spacing.xxl, alignItems: 'flex-start' },
  bullet: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  bulletActive: { backgroundColor: colors.lime },
  ruleText: { flex: 1, gap: spacing.xs },
});
