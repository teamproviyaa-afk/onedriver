import { useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, Card, ConfirmationSheet, ErrorState, Icon, LoadingState, PrimaryButton, Screen } from '@/components/ui';
import { PillTabs } from '@/components/app/PillTabs';
import { useEarnings } from '@/hooks';
import { colors, fontFamily, spacing } from '@/theme';
import { formatINR } from '@/utils/format';

type Tab = 'earnings' | 'trips' | 'rewards';
type Sheet = 'withdraw' | 'rewards' | null;

const TABS: { value: Tab; label: string }[] = [
  { value: 'earnings', label: 'EARNINGS' },
  { value: 'trips', label: 'TRIPS LOG' },
  { value: 'rewards', label: 'REWARDS' },
];

const inr = (n: number) => formatINR(n, { decimals: 2 });

/** Figma earnings-today: today's payout hero, deliveries / avg per trip, quick payout split, WITHDRAW EARNINGS (coming soon). */
export default function EarningsScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useEarnings('today');
  const [sheet, setSheet] = useState<Sheet>(null);

  const onTab = (tab: Tab) => {
    if (tab === 'trips') router.push('/tasks' as never);
    else if (tab === 'rewards') setSheet('rewards');
  };

  const split = data
    ? [
        { label: 'Order Payout', value: data.split.orderPay },
        { label: 'Milestone Bonus', value: data.split.milestoneBonus },
        { label: 'Customer Tips', value: data.split.tips },
        ...(data.split.peakIncentive > 0 ? [{ label: 'Peak Incentive', value: data.split.peakIncentive }] : []),
      ]
    : [];

  return (
    <Screen padded={false} footer={<PrimaryButton label="WITHDRAW EARNINGS" onPress={() => setSheet('withdraw')} disabled={!data} />} footerStyle={styles.footer}>
      <View style={styles.tabs}>
        <PillTabs options={TABS} value="earnings" onChange={onTab} />
      </View>

      {isLoading && !data ? (
        <LoadingState label="Loading today's earnings…" />
      ) : error && !data ? (
        <ErrorState title="Couldn't load earnings" body={error instanceof Error ? error.message : 'Check your connection and try again.'} onRetry={() => void refetch()} />
      ) : data ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.ink} colors={[colors.ink]} />}>
          <Card radius={32} padding={spacing.gutter} borderWidth={2} borderColor={colors.border} style={styles.hero} gap={spacing.md}>
            <AppText variant="chip" color="textSecondary" align="center">
              {"TODAY'S TOTAL PAYOUT"}
            </AppText>
            <AppText variant="hero" style={styles.heroAmount} align="center" accessibilityLabel={`Today's total payout ${inr(data.total)}`}>
              {inr(data.total)}
            </AppText>
            <View style={styles.statusRow}>
              <Image source={require('@/assets/figma/payout-status-dot.png')} style={styles.statusDot} resizeMode="contain" accessibilityIgnoresInvertColors />
              <AppText variant="bodyBoldSm" color="textSecondary">
                Settlement status: Auto-rolling
              </AppText>
            </View>
          </Card>

          <View style={styles.metrics}>
            <Card radius={32} padding={spacing.xxl} borderWidth={1} borderColor={colors.borderSubtle} gap={spacing.xs} style={styles.metric}>
              <AppText color="textSecondary" style={styles.metricLabel}>
                DELIVERIES
              </AppText>
              <AppText variant="h2">{data.deliveries}</AppText>
              <AppText style={styles.metricSub} uppercase>
                {data.deliveries > 0 ? 'Completed today' : 'No deliveries yet'}
              </AppText>
            </Card>
            <Card radius={32} padding={spacing.xxl} borderWidth={1} borderColor={colors.borderSubtle} gap={spacing.xs} style={styles.metric}>
              <AppText color="textSecondary" style={styles.metricLabel}>
                AVG / TRIP
              </AppText>
              <AppText variant="h2">{inr(data.averagePerTrip)}</AppText>
              <AppText color="textSecondary" style={styles.metricSub}>
                Incl. incentive
              </AppText>
            </Card>
          </View>

          <Card radius={32} padding={spacing.xxl} borderWidth={1} borderColor={colors.borderSubtle} gap={spacing.base}>
            <View style={styles.splitHeader}>
              <AppText variant="chip">Quick Payout Split</AppText>
              <Pressable accessibilityRole="link" accessibilityLabel="View weekly statement" hitSlop={10} onPress={() => router.push('/earnings/week' as never)} style={styles.link}>
                <AppText variant="bodyBoldSm">View weekly</AppText>
                <Icon name="chevron-right" size={14} strokeWidth={2.5} />
              </Pressable>
            </View>
            {split.map((row) => (
              <View key={row.label} style={styles.splitRow}>
                <AppText color="textSecondary" style={styles.splitLabel}>
                  {row.label}
                </AppText>
                <AppText style={styles.splitValue}>{inr(row.value)}</AppText>
              </View>
            ))}
          </Card>
        </ScrollView>
      ) : null}

      <ConfirmationSheet
        visible={sheet === 'withdraw'}
        onClose={() => setSheet(null)}
        icon="wallet"
        title="Withdraw earnings"
        body="Coming soon. Payouts are sent weekly (Monday) to your verified UPI/bank account."
        cancelLabel="GOT IT"
      />
      <ConfirmationSheet
        visible={sheet === 'rewards'}
        onClose={() => setSheet(null)}
        icon="gift"
        title="Rewards"
        body="Coming soon. Milestone bonuses and peak incentives are already included in today's payout."
        cancelLabel="GOT IT"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabs: { paddingHorizontal: spacing.xxl, paddingVertical: spacing.md },
  body: { padding: spacing.gutter, gap: spacing.x3l, flexGrow: 1 },
  footer: { paddingBottom: spacing.md },
  hero: { alignItems: 'center' },
  heroAmount: { fontFamily: fontFamily.manropeExtraBold, fontSize: 44, lineHeight: 54 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusDot: { width: 8, height: 8 },
  metrics: { flexDirection: 'row', gap: spacing.lg, alignSelf: 'stretch' },
  metric: { flex: 1, minWidth: 0 },
  metricLabel: { fontFamily: fontFamily.manropeBold, fontSize: 11, lineHeight: 15 },
  metricSub: { fontFamily: fontFamily.manropeSemiBold, fontSize: 11, lineHeight: 15 },
  splitHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, minHeight: 24 },
  splitRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.lg },
  splitLabel: { fontFamily: fontFamily.manropeMedium, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  splitValue: { fontFamily: fontFamily.manropeBold, fontSize: 13, lineHeight: 18 },
});
