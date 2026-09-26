import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, Card, Dot, GhostButton, Icon, PrimaryButton, Screen, toast } from '@/components/ui';
import { AppHeader } from '@/components/app';
import { useCountdown, useElapsed, useJobActions } from '@/hooks';
import { openDialer } from '@/navigation/openNavigation';
import { formatCountdown, formatINR } from '@/utils/format';
import { useJobScreen } from '@/features/delivery/useJobScreen';
import { errorMessage } from '@/features/delivery/errors';
import { ActionRow, JobScreenFallback, ReportNoteSheet, figmaText } from '@/features/delivery/components';
import { WAIT_FREE_MIN, WAIT_FREE_SECONDS, WAIT_PER_MIN, isWaitCompensated, useWaitStore, waitCompensationFor } from '@/features/job/waitStore';

/** Demo merchant desk number used by "Contact Merchant" (the server never exposes merchant phones to the app). */
const MERCHANT_DEMO_NUMBER = '+91 98220 11223';

/**
 * Order Not Ready (Figma order-not-ready): elapsed wait timer with the 10 min / ₹2 per min
 * compensation threshold, merchant delay guidance, report / contact actions and the
 * "order is ready" continuation which resolves the wait via the state engine.
 */
export default function OrderNotReadyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isLoading, error, refetch, lockRedirect, unlockRedirect } = useJobScreen(id, ['at_pickup']);
  const { raiseException, resolveWait, refreshFromServer } = useJobActions();

  const startWait = useWaitStore((s) => s.start);
  const clearWait = useWaitStore((s) => s.clear);
  const startedAt = useWaitStore((s) => (id ? s.waitStartedAt[id] : undefined));
  useEffect(() => {
    if (id) startWait(id);
  }, [id, startWait]);

  const elapsed = useElapsed(startedAt);
  const readyIn = useCountdown(job?.merchantReadyAt);
  const ready = !job?.merchantReadyAt || readyIn <= 0;
  const readyMinutes = Math.max(1, Math.ceil(readyIn / 60));
  const compensated = isWaitCompensated(elapsed);
  const earned = waitCompensationFor(elapsed);
  const progress = Math.min(1, elapsed / WAIT_FREE_SECONDS);

  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [polling, setPolling] = useState(false);

  if (!job) return <JobScreenFallback error={isLoading ? null : error} onRetry={refetch} label="Loading order…" />;

  const merchant = job.pickup;

  const reportDelay = async (note: string | undefined) => {
    setReporting(true);
    try {
      const res = await raiseException(job, 'not_ready', { note });
      setReportOpen(false);
      if ('queued' in res) toast.show('Saved offline — will sync');
      else toast.success(res.message ?? 'Delay reported to support');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setReporting(false);
    }
  };

  const stillWaiting = async () => {
    setPolling(true);
    try {
      const fresh = await refreshFromServer(job.id);
      const readyNow = !fresh?.merchantReadyAt || new Date(fresh.merchantReadyAt).getTime() <= Date.now();
      if (readyNow) toast.success('Order is ready — continue to verification');
      else toast.show(`Still preparing — about ${Math.max(1, Math.ceil((new Date(fresh!.merchantReadyAt!).getTime() - Date.now()) / 60000))} min to go`);
    } finally {
      setPolling(false);
    }
  };

  const continueToVerify = async () => {
    setContinuing(true);
    lockRedirect();
    try {
      const res = await resolveWait(job, 'not_ready', 'continue');
      if ('queued' in res) toast.show('Saved offline — will sync');
      clearWait(job.id);
      router.replace(`/job/${job.id}/pickup/verify` as never);
    } catch (e) {
      unlockRedirect();
      toast.error(errorMessage(e));
    } finally {
      setContinuing(false);
    }
  };

  return (
    <Screen
      scroll
      footer={
        <View style={styles.footer}>
          <PrimaryButton label="ORDER IS READY" onPress={() => void continueToVerify()} loading={continuing} />
          {!ready ? <GhostButton label="I AM STILL WAITING" onPress={() => void stillWaiting()} disabled={polling} /> : null}
        </View>
      }>
      <AppHeader title={ready ? 'Order Ready' : 'Order Not Ready'} onBack={() => (router.canGoBack() ? router.back() : router.replace(`/job/${job.id}/pickup` as never))} onHelp={() => router.push('/support' as never)} />
      <View style={styles.body}>
        <AppText variant="body" color="textSecondary">
          {ready ? `${merchant.name} has Order ${job.orderRef} ready for pickup` : `${merchant.name} is preparing Order ${job.orderRef}`}
        </AppText>

        {ready ? (
          <View style={styles.readyBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Icon name="circle-check" size={20} color="ink" strokeWidth={2.5} />
            <AppText variant="titleLg">ORDER IS READY</AppText>
          </View>
        ) : null}

        <Card radius={32} padding={spacing.gutter} gap={spacing.md} style={styles.center}>
          <AppText variant="label" color="textSecondary" uppercase>
            Elapsed wait time
          </AppText>
          <AppText style={figmaText.timer48} color={ready ? colors.ink : '#FF4D4D'} accessibilityLabel={`Elapsed wait time ${formatCountdown(elapsed)}`}>
            {formatCountdown(elapsed)}
          </AppText>
          <View style={[styles.badge, compensated ? styles.badgeOn : styles.badgeOff]}>
            <AppText style={figmaText.label11} uppercase>
              {compensated ? 'Wait time compensation enabled' : `Wait compensation after ${WAIT_FREE_MIN} min`}
            </AppText>
          </View>
          <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel={`${Math.round(progress * 100)}% of the free wait period elapsed`}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <AppText variant="bodySm" color="textSecondary" align="center">
            {compensated ? `Earning ${formatINR(WAIT_PER_MIN)}/min · ${formatINR(earned)} added so far` : `${formatINR(WAIT_PER_MIN)}/min is added after ${WAIT_FREE_MIN} minutes of waiting`}
          </AppText>
        </Card>

        <Card radius={32} padding={spacing.xxl} gap={spacing.lg}>
          <View style={styles.row}>
            <Dot size={8} color={ready ? colors.lime : colors.warning} />
            <AppText variant="title">{ready ? 'Order Ready' : 'Preparation Delay Alert'}</AppText>
          </View>
          <AppText style={figmaText.body13} color="textSecondary">
            {ready
              ? `${merchant.name} has marked Order ${job.orderRef} as ready. Collect it at ${merchant.entranceNote ? merchant.entranceNote.toLowerCase() : 'the counter'} and continue to verification.`
              : `Merchant confirmed a delay of ~${readyMinutes} minute${readyMinutes === 1 ? '' : 's'}. Your delivery ETA has been automatically adjusted with customer notification.`}
          </AppText>
        </Card>

        <Card radius={32} padding={spacing.xxl} gap={spacing.lg} row style={styles.merchant}>
          <View style={styles.storeIcon}>
            <Icon name="store" size={20} />
          </View>
          <View style={styles.merchantText}>
            <AppText variant="titleSm">{merchant.name}</AppText>
            <AppText variant="bodySm" color="textSecondary">
              {[merchant.address, merchant.area].filter(Boolean).join(', ')}
            </AppText>
            {merchant.entranceNote ? (
              <AppText variant="bodySm" color="textSecondary">
                {merchant.entranceNote}
              </AppText>
            ) : null}
          </View>
        </Card>

        <View style={styles.actions}>
          <ActionRow icon="alert-triangle" label="Report Delay to Support" onPress={() => setReportOpen(true)} />
          <ActionRow icon="phone" label="Contact Merchant" onPress={() => void openDialer(MERCHANT_DEMO_NUMBER).then((ok) => !ok && toast.error('Could not open the dialer'))} />
        </View>
      </View>

      <ReportNoteSheet
        visible={reportOpen}
        onClose={() => !reporting && setReportOpen(false)}
        title="Report delay to support"
        body={`Operations will be told that ${merchant.name} is still preparing Order ${job.orderRef}. Wait compensation applies after ${WAIT_FREE_MIN} minutes.`}
        confirmLabel="SEND REPORT"
        onConfirm={reportDelay}
        loading={reporting}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.x3l, paddingTop: spacing.lg },
  footer: { gap: spacing.xs },
  center: { alignItems: 'center' },
  readyBanner: {
    backgroundColor: colors.lime,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 23,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  badge: { borderWidth: 1, borderColor: colors.border, borderRadius: 11.5, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  badgeOn: { backgroundColor: colors.surfaceLime },
  badgeOff: { backgroundColor: colors.surfaceMuted },
  track: { alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginTop: spacing.xs },
  fill: { height: '100%', backgroundColor: colors.lime, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  merchant: { alignItems: 'center' },
  storeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceLime, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  merchantText: { flex: 1, gap: 2 },
  actions: { gap: spacing.base },
});
