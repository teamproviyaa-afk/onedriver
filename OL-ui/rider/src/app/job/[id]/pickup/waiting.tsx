import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, Card, Dot, GhostButton, Icon, PrimaryButton, Screen, toast } from '@/components/ui';
import { AppHeader } from '@/components/app';
import { useCountdown, useElapsed, useJobActions } from '@/hooks';
import { routeForJob } from '@/state-machine/deliveryStateMachine';
import { formatCountdown, formatINR } from '@/utils/format';
import { useJobScreen } from '@/features/delivery/useJobScreen';
import { errorMessage } from '@/features/delivery/errors';
import { contactMerchant } from '@/features/delivery/merchant';
import { ActionRow, JobScreenFallback, ReportNoteSheet, figmaText } from '@/features/delivery/components';
import { WAIT_FREE_MIN, WAIT_PER_MIN, isWaitCompensated, useWaitStore, waitCompensationFor } from '@/features/job/waitStore';

/** Figma order-not-ready timer colour (#FF4D4D) — not a theme token. */
const TIMER_RED = '#FF4D4D';

/**
 * Order Not Ready (Figma order-not-ready): elapsed wait timer with the 10 min / ₹2 per min
 * compensation badge, the merchant's delay guidance, report / contact rows and the
 * "I AM STILL WAITING" re-poll. Once the merchant marks the order ready (or the rider
 * confirms it is) the wait is resolved through the state engine and verification opens.
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
  // The merchant's ready time is a server hint; without one the rider decides when the order is ready.
  const hasEstimate = !!job?.merchantReadyAt;
  const ready = hasEstimate && readyIn <= 0;
  const delayMinutes = Math.max(1, Math.ceil(readyIn / 60));
  const compensated = isWaitCompensated(elapsed);
  const earned = waitCompensationFor(elapsed);

  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [polling, setPolling] = useState(false);

  if (!job) return <JobScreenFallback error={isLoading ? null : error} onRetry={refetch} label="Loading order…" />;

  const merchant = job.pickup;
  const busy = continuing || polling;

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

  /** "I AM STILL WAITING": keep the timer running and re-check the merchant's readiness. */
  const stillWaiting = async () => {
    setPolling(true);
    try {
      const fresh = await refreshFromServer(job.id);
      if (!fresh) {
        toast.error('Could not refresh the order status');
        return;
      }
      const readyAt = fresh.merchantReadyAt ? new Date(fresh.merchantReadyAt).getTime() : null;
      if (readyAt === null) toast.show('Still waiting — the merchant has not confirmed a ready time yet');
      else if (readyAt <= Date.now()) toast.success('Order is ready — continue to verification');
      else toast.show(`Still preparing — about ${Math.max(1, Math.ceil((readyAt - Date.now()) / 60000))} min to go`);
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
      // Continuing the wait keeps the job at the store, so verification is next; any other state follows the engine.
      const state = 'queued' in res ? job.state : res.jobState;
      router.replace((state === 'at_pickup' ? `/job/${job.id}/pickup/verify` : routeForJob({ id: job.id, state })) as never);
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
          {ready ? (
            <>
              <PrimaryButton label="ORDER IS READY" onPress={() => void continueToVerify()} loading={continuing} disabled={polling} />
              <GhostButton label="I am still waiting" onPress={() => void stillWaiting()} disabled={busy} />
            </>
          ) : (
            <>
              <PrimaryButton label="I AM STILL WAITING" onPress={() => void stillWaiting()} loading={polling} disabled={continuing} />
              <GhostButton label="Order is ready — continue" icon="arrow-right" onPress={() => void continueToVerify()} disabled={busy} />
            </>
          )}
        </View>
      }>
      <View style={styles.headerArea}>
        <AppHeader title={ready ? 'Order Ready' : 'Order Not Ready'} onBack={() => (router.canGoBack() ? router.back() : router.replace(`/job/${job.id}/pickup` as never))} onHelp={() => router.push('/support' as never)} />
        <AppText variant="body" color="textSecondary">
          {ready ? `${merchant.name} has Order ${job.orderRef} ready for pickup` : `${merchant.name} is preparing Order ${job.orderRef}`}
        </AppText>
      </View>

      <View style={styles.body}>
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
          <AppText style={figmaText.timer48} color={ready ? colors.ink : TIMER_RED} accessibilityLabel={`Elapsed wait time ${formatCountdown(elapsed)}`}>
            {formatCountdown(elapsed)}
          </AppText>
          <View style={[styles.badge, compensated ? styles.badgeOn : styles.badgeOff]}>
            <AppText style={figmaText.label11} uppercase>
              {compensated ? 'Wait time compensation enabled' : `Wait compensation after ${WAIT_FREE_MIN} min`}
            </AppText>
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
              ? `${merchant.name} has marked Order ${job.orderRef} as ready. Collect it and continue to verification.`
              : hasEstimate
                ? `Merchant confirmed a delay of ~${delayMinutes} minute${delayMinutes === 1 ? '' : 's'}. Your delivery ETA has been automatically adjusted with customer notification.`
                : 'Merchant has not confirmed a ready time yet. Your delivery ETA will be adjusted automatically with customer notification.'}
          </AppText>
        </Card>

        <View style={styles.actions}>
          <ActionRow icon="alert-triangle" label="Report Delay to Support" onPress={() => setReportOpen(true)} />
          <ActionRow icon="phone" label="Contact Merchant" onPress={() => void contactMerchant()} />
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
  headerArea: { gap: spacing.lg },
  body: { gap: spacing.x3l, paddingTop: spacing.x3l },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { gap: spacing.base },
});
