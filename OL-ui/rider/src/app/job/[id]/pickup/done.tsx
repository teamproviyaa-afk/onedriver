import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, fontFamily, spacing } from '@/theme';
import { AppText, Badge, Icon, Screen, toast } from '@/components/ui';
import { AppHeader } from '@/components/app';
import { useJobActions } from '@/hooks';
import { useEarningsStore, useRiderStore } from '@/stores';
import { useJobScreen } from '@/features/delivery/useJobScreen';
import { errorMessage } from '@/features/delivery/errors';
import { JobScreenFallback, TintedButton, figmaText } from '@/features/delivery/components';

/**
 * Pickup Confirmed (Figma pickup-confirmed): success state after the merchant check.
 * PROCEED TO DELIVERY moves the job to `picked_up` through the state engine and opens the
 * navigation hand-off. A job that is already picked up is sent straight to navigation.
 */
export default function PickupConfirmedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isLoading, error, refetch, lockRedirect, unlockRedirect } = useJobScreen(id, ['pickup_verified']);
  const { step } = useJobActions();
  const storeLinks = useRiderStore((s) => s.me?.storeLinks);
  const todayJobs = useEarningsStore((s) => s.today.jobs);
  const [busy, setBusy] = useState(false);

  if (!job) return <JobScreenFallback error={isLoading ? null : error} onRetry={refetch} label="Confirming pickup…" />;

  const link = job.pickup.storeId ? storeLinks?.find((l) => l.status === 'active' && l.storeId === job.pickup.storeId) : undefined;
  const bonusTitle = link ? 'Bonus Milestone Achieved' : 'Milestone Bonus';
  const bonusBody = link
    ? `Linked store pickup at ${link.storeName} completed! ${link.payoutMultiplier && link.payoutMultiplier > 1 ? `Orders pay ${link.payoutMultiplier}x while linked and the extra` : 'The linked store bonus'} is credited to your active wallet balance once this delivery is done.`
    : `${todayJobs} deliver${todayJobs === 1 ? 'y' : 'ies'} completed today. Finish this one to move closer to the milestone bonus, credited to your active wallet balance after delivery.`;

  const proceed = async () => {
    setBusy(true);
    lockRedirect();
    try {
      await step(job, 'picked_up');
      router.replace(`/job/${job.id}/navigate` as never);
    } catch (e) {
      unlockRedirect();
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll footer={<TintedButton label="PROCEED TO DELIVERY" background={colors.ink} color={colors.surface} radius={27} height={54} textVariant="buttonSecondary" onPress={() => void proceed()} loading={busy} />}>
      <AppHeader onBack={() => router.replace(`/job/${job.id}/pickup` as never)} />
      <View style={styles.body}>
        <Badge label="Verification success" />
        <View style={styles.checkCircle} accessibilityRole="image" accessibilityLabel="Pickup verified">
          <Icon name="check" size={44} strokeWidth={2.5} />
        </View>
        <View style={styles.texts}>
          <AppText variant="display" align="center" accessibilityRole="header">
            Pickup Confirmed!
          </AppText>
          <AppText style={styles.subtitle} color="textSecondary" align="center">
            Order {job.orderRef} successfully verified with merchant.
          </AppText>
        </View>
        <View style={styles.bonusCard}>
          <View style={styles.bonusHeader}>
            <Icon name="zap" size={20} />
            <AppText variant="title">{bonusTitle}</AppText>
          </View>
          <AppText style={figmaText.body13} color="textSecondary">
            {bonusBody}
          </AppText>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: spacing.gutter, paddingTop: spacing.x5l, paddingBottom: spacing.xxl },
  checkCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.lime, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  texts: { alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: 15, lineHeight: 21 },
  bonusCard: { alignSelf: 'stretch', backgroundColor: colors.surfaceLime, borderWidth: 2, borderColor: colors.border, borderRadius: 32, padding: spacing.x3l, gap: spacing.lg },
  bonusHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
