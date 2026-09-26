import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppText, Card, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { AppHeader } from '@/components/app';
import { useJobEarnings } from '@/hooks';
import { colors, fontFamily, spacing } from '@/theme';
import { ApiError, type JobEarnings } from '@/types';
import { formatINR, formatKm } from '@/utils/format';

const inr = (n: number) => formatINR(n, { decimals: 2 });

/** Payout calculation lines — every component of `earnings = base + distance + peak + wait + tip + bonus`. */
const lines = (e: JobEarnings): { label: string; value: number }[] => {
  const distanceLabel = e.distanceKm > 0 ? `Distance Incentive (${e.distanceKm.toFixed(1)}km)` : 'Distance Incentive';
  const waitLabel = e.waitMinutes ? `Wait Compensation (${Math.round(e.waitMinutes)} min)` : 'Wait Compensation';
  return [
    { label: 'Base Delivery Fee', value: e.base },
    { label: distanceLabel, value: e.distance },
    { label: 'Peak Hour Surcharge', value: e.peak },
    { label: waitLabel, value: e.wait },
    { label: 'Customer Tip', value: e.tip },
    { label: 'Milestone Bonus', value: e.bonus },
  ];
};

const goHome = () => router.replace('/home' as never);

/** Figma earnings-breakdown: completed route (merchant → customer) + payout calculation receipt. */
export default function EarningsBreakdownScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useJobEarnings(id);
  const notFound = ApiError.is(error, 'not_found');

  return (
    <Screen
      scroll
      footer={
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss to homepage" onPress={goHome} style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}>
          <AppText variant="buttonSecondary" color="surface">
            DISMISS TO HOMEPAGE
          </AppText>
        </Pressable>
      }>
      <AppHeader title="Earnings Breakdown" backIcon="chevron-left" onHelp={() => router.push('/support' as never)} />

      {isLoading && !data ? (
        <LoadingState label="Loading payout…" />
      ) : notFound ? (
        <EmptyState icon="indian-rupee" title="No earnings for this job" body="Earnings are recorded once a delivery is completed." actionLabel="View task" onAction={() => router.push(`/tasks/${id}` as never)} />
      ) : error && !data ? (
        <ErrorState title="Couldn't load the payout" body={error instanceof Error ? error.message : 'Check your connection and try again.'} onRetry={() => void refetch()} />
      ) : data ? (
        <View style={styles.body}>
          <Card radius={32} padding={spacing.xxl} borderWidth={1} borderColor={colors.borderSubtle} gap={spacing.lg}>
            <AppText color="textSecondary" style={styles.routeLabel}>
              COMPLETED ROUTE
            </AppText>
            <View style={styles.timeline}>
              <View style={styles.stop}>
                <Image source={require('@/assets/figma/route-dot-merchant.png')} style={styles.dot} resizeMode="contain" accessibilityIgnoresInvertColors />
                <View style={styles.stopTexts}>
                  <AppText variant="chip" numberOfLines={1}>
                    {data.job.pickupName} (Merchant)
                  </AppText>
                  <AppText color="textSecondary" style={styles.stopSub}>
                    Order {data.job.orderRef.startsWith('#') ? data.job.orderRef : `#${data.job.orderRef}`}
                  </AppText>
                </View>
              </View>
              <View style={styles.stop}>
                <Image source={require('@/assets/figma/route-dot-customer.png')} style={styles.dot} resizeMode="contain" accessibilityIgnoresInvertColors />
                <View style={styles.stopTexts}>
                  <AppText variant="chip" numberOfLines={1}>
                    {data.job.dropArea} (Customer)
                  </AppText>
                  <AppText color="textSecondary" style={styles.stopSub}>
                    Distance covered: {formatKm(data.earnings.distanceKm || data.job.distanceKm)}
                  </AppText>
                </View>
              </View>
            </View>
          </Card>

          <Card radius={32} padding={spacing.x3l} borderWidth={2} borderColor={colors.border} gap={spacing.xl}>
            <AppText variant="title">PAYOUT CALCULATION</AppText>
            {lines(data.earnings).map((row) => (
              <View key={row.label} style={styles.line}>
                <AppText variant="body" color="textSecondary" style={styles.lineLabel}>
                  {row.label}
                </AppText>
                <AppText variant="bodyBold">{inr(row.value)}</AppText>
              </View>
            ))}
            <Image source={require('@/assets/figma/dashed-divider.png')} style={styles.divider} resizeMode="repeat" accessibilityIgnoresInvertColors />
            <View style={styles.line}>
              <AppText variant="titleLg">Total Payout</AppText>
              <AppText variant="h3" accessibilityLabel={`Total payout ${inr(data.earnings.total)}`}>
                {inr(data.earnings.total)}
              </AppText>
            </View>
            <AppText variant="bodySm" color="textMuted">
              Rule version v{data.earnings.ruleVersion}
            </AppText>
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.x3l, paddingTop: spacing.lg },
  routeLabel: { fontFamily: fontFamily.manropeExtraBold, fontSize: 11, lineHeight: 15 },
  timeline: { gap: spacing.lg, alignSelf: 'stretch' },
  stop: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  stopTexts: { flex: 1, gap: spacing.xxs },
  stopSub: { fontFamily: fontFamily.manropeMedium, fontSize: 11, lineHeight: 15 },
  dot: { width: 12, height: 12 },
  line: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.lg },
  lineLabel: { flexShrink: 1 },
  divider: { width: '100%', height: 1 },
  dismiss: { backgroundColor: colors.ink, borderRadius: 27, paddingVertical: spacing.xxl, paddingHorizontal: spacing.gutter, alignItems: 'center', justifyContent: 'center', minHeight: 54, alignSelf: 'stretch' },
  dismissPressed: { opacity: 0.85 },
});
