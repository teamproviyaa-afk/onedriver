import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, ErrorState, GhostButton, Icon, InfoBanner, LoadingState, Screen } from '@/components/ui';
import { useJob, useJobEarnings } from '@/hooks';
import { useDeliveryStore, useEarningsStore } from '@/stores';
import { routeForJob } from '@/state-machine/deliveryStateMachine';
import { GEOFENCE } from '@/domain/geofence';
import { formatClock, formatINR, formatMeters } from '@/utils/format';
import { errorMessage } from '@/features/delivery/errors';
import { TintedButton, figmaText } from '@/features/delivery/components';

/**
 * Delivered (Figma delivery-success): trip earnings, bonus / tip, order meta, cash and
 * review flags for the proof just submitted. Falls back to the job earnings query when
 * the proof result is no longer in memory (or was queued offline).
 */
export default function DeliverySuccessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lastProof = useDeliveryStore((s) => (s.lastProof && s.lastProof.job.id === id ? s.lastProof : null));
  const todayJobs = useEarningsStore((s) => s.today.jobs);
  const { job: fetchedJob, isLoading: jobLoading, error: jobError, refetch } = useJob(lastProof ? undefined : id);
  const earningsQ = useJobEarnings(lastProof ? undefined : id);

  // Guard: a job that is not delivered belongs on its own screen.
  useEffect(() => {
    if (!lastProof && fetchedJob && fetchedJob.state !== 'delivered') router.replace(routeForJob(fetchedJob) as never);
  }, [lastProof, fetchedJob]);

  const job = lastProof?.job ?? fetchedJob;
  const earnings = lastProof?.earnings ?? earningsQ.data?.earnings ?? null;
  const history = earningsQ.data?.job;

  if (!lastProof && !job && !history) {
    if (jobLoading || earningsQ.isLoading) {
      return (
        <Screen>
          <LoadingState label="Wrapping up your delivery…" />
        </Screen>
      );
    }
    return (
      <Screen>
        <ErrorState title="Could not load this delivery" body={errorMessage(jobError ?? earningsQ.error, 'Check your connection and try again.')} onRetry={() => void Promise.all([refetch(), earningsQ.refetch()])} />
        <GhostButton label="Back to home" onPress={() => router.replace('/home' as never)} />
      </Screen>
    );
  }

  const orderRef = job?.orderRef ?? history?.orderRef ?? '—';
  const customer = job?.drop.customerFirstName ?? 'Customer';
  const deliveredAt = job?.deliveredAt ?? history?.deliveredAt ?? earnings?.createdAt;
  const total = earnings?.total ?? job?.payoutEstimate ?? history?.earnings ?? 0;
  const pendingSync = !earnings;
  const bonus = earnings?.bonus ?? 0;
  const tip = earnings?.tip ?? 0;
  const waitPay = earnings?.wait ?? 0;
  const cashCollected = job && job.cashToCollect > 0 ? job.cashToCollect : 0;
  const farFlag = job?.flags?.find((f) => f.startsWith('proof_far'));
  const flagged = lastProof?.flagged ?? !!farFlag;
  const distanceM = lastProof?.distanceFromDropM ?? (farFlag ? Number(farFlag.replace(/\D/g, '')) || undefined : undefined);

  const backHome = () => {
    useDeliveryStore.getState().setLastProof(null);
    router.replace('/home' as never);
  };

  return (
    <Screen
      scroll
      footer={
        <View style={styles.footer}>
          <TintedButton label="BACK TO HOME" background={colors.ink} color={colors.surface} radius={27} textVariant="buttonSecondary" onPress={backHome} />
          <GhostButton label="View breakdown" icon="chevron-right" onPress={() => router.push(`/earnings/job/${id}` as never)} />
        </View>
      }>
      <View style={styles.body}>
        <View style={styles.badge}>
          <AppText variant="chip" color="surface">
            ✓ DELIVERED
          </AppText>
        </View>
        <View style={styles.graphic} accessibilityLabel="Delivery complete">
          <Icon name="check" size={44} strokeWidth={2.5} />
        </View>
        <View style={styles.earnings}>
          <AppText variant="bodyBold" color="textSecondary" uppercase>
            Trip earnings
          </AppText>
          <AppText style={figmaText.amount40} accessibilityLabel={`Trip earnings ${formatINR(total)}`}>
            {formatINR(total)}
          </AppText>
          {pendingSync ? (
            <AppText variant="bodySm" color="textMuted" align="center">
              Estimated — final amount appears once this delivery syncs
            </AppText>
          ) : null}
        </View>

        {pendingSync ? <InfoBanner icon="refresh-cw" tone="muted" bold={false} text="Saved offline. Earnings and cash will be recorded when the connection returns." /> : null}

        {bonus > 0 ? (
          <View style={styles.milestone}>
            <View style={styles.milestoneRow}>
              <Icon name="zap" size={20} />
              <AppText variant="title">Daily Target Bonus Unlocked</AppText>
            </View>
            <AppText style={figmaText.body13} color="textSecondary">
              You have completed {todayJobs} consecutive deliver{todayJobs === 1 ? 'y' : 'ies'} today. Extra {formatINR(bonus)} added to active wallets!
            </AppText>
          </View>
        ) : tip > 0 ? (
          <View style={styles.milestone}>
            <View style={styles.milestoneRow}>
              <Icon name="gift" size={20} />
              <AppText variant="title">Customer Tip Received</AppText>
            </View>
            <AppText style={figmaText.body13} color="textSecondary">
              {customer} added a {formatINR(tip)} tip — 100% of it goes to you.
            </AppText>
          </View>
        ) : null}

        {flagged ? (
          <InfoBanner
            icon="map-pin"
            tone="warning"
            bold={false}
            text={distanceM !== undefined ? `Proof was recorded ${formatMeters(distanceM)} from the drop pin (over ${GEOFENCE.proofFlagM} m) — flagged for review. Your pay is not affected.` : 'Proof was recorded far from the drop pin — flagged for review. Your pay is not affected.'}
          />
        ) : null}

        <View style={styles.meta}>
          <MetaRow label="Order ID" value={orderRef} />
          <MetaRow label="Customer" value={customer} />
          <MetaRow label="Delivered At" value={deliveredAt ? formatClock(deliveredAt) : '—'} />
          {cashCollected > 0 ? <MetaRow label="Cash collected" value={formatINR(cashCollected)} /> : null}
          {waitPay > 0 ? <MetaRow label="Wait compensation" value={formatINR(waitPay)} /> : null}
        </View>
      </View>
    </Screen>
  );
}

const MetaRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.metaRow}>
    <AppText style={figmaText.semi13} color="textSecondary">
      {label}
    </AppText>
    <AppText variant="titleSm" style={styles.metaValue} numberOfLines={1}>
      {value}
    </AppText>
  </View>
);

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: spacing.gutter, paddingTop: spacing.x5l, paddingBottom: spacing.xxl },
  footer: { gap: spacing.xs },
  badge: { backgroundColor: colors.ink, borderRadius: 15, paddingHorizontal: spacing.xxl, paddingVertical: spacing.sm },
  graphic: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.lime, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  earnings: { alignItems: 'center', gap: spacing.xs },
  milestone: { alignSelf: 'stretch', backgroundColor: colors.surfaceLime, borderWidth: 2, borderColor: colors.border, borderRadius: 32, padding: spacing.x3l, gap: spacing.lg },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  meta: { alignSelf: 'stretch', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 32, padding: spacing.xxl, gap: spacing.md },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.lg },
  metaValue: { flexShrink: 1, textAlign: 'right' },
});
