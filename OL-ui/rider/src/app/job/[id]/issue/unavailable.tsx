import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, shadows, spacing } from '@/theme';
import { AppText, BottomSheet, ConfirmationSheet, ErrorState, Icon, LoadingState, PrimaryButton, Screen, SecondaryButton, StatusChip, toast } from '@/components/ui';
import { useCountdown, useJob, useJobActions } from '@/hooks';
import { canCallCustomer } from '@/domain/privacy';
import { openDialer } from '@/navigation/openNavigation';
import { canRaiseException, routeForJob } from '@/state-machine/deliveryStateMachine';
import { ApiError } from '@/types';
import { addSeconds } from '@/utils/time';
import { formatCountdown } from '@/utils/format';
import { DEFAULT_WAIT_SECONDS, useWaitStore } from '@/features/issues/waitStore';
import { CHAT_COMING_SOON } from '@/features/issues/issueOptions';
import { IssueHeader } from '@/features/issues/IssueHeader';

const TITLE = 'Customer Unavailable';
const PROTOCOL = ['Call the customer at least twice.', 'Ring doorbell/knock and check with guards if gated.', 'If no response after timer ends, "Report Support" action will unlock.'] as const;

/**
 * Customer Unavailable (Figma customer-unavailable): raises the `unavailable` exception once,
 * runs the mandatory wait timer (server `waitSeconds`, default 5:00), lets the rider call the
 * customer (call count shown) and unlocks "ESCALATE TO SUPPORT" only when the timer hits 0.
 * Both outcomes go through useJobActions().resolveWait — the screen never sets a state itself.
 */
export default function CustomerUnavailableScreen() {
  const { id, note } = useLocalSearchParams<{ id: string; note?: string }>();
  const { job, isLoading, error, refetch } = useJob(id);
  const { raiseException, resolveWait, callCustomer } = useJobActions();
  const wait = useWaitStore((s) => (id ? s.waits[id] : undefined) ?? null);
  const startWait = useWaitStore((s) => s.startWait);
  const recordCall = useWaitStore((s) => s.recordCall);
  const clearWait = useWaitStore((s) => s.clearWait);

  const raised = useRef(false);
  const [raiseError, setRaiseError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'call' | 'continue' | 'escalate' | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [confirmEscalate, setConfirmEscalate] = useState(false);

  const expiresAt = wait ? addSeconds(wait.startedAt, wait.seconds) : null;
  const remaining = useCountdown(expiresAt);
  const timerDone = !!wait && remaining <= 0;
  // "Customer unavailable" is an at-drop exception; any other state belongs on the job's own screen.
  const atDrop = !!job && canRaiseException(job.state, 'unavailable');

  useEffect(() => {
    if (job && !atDrop && !leaving) router.replace(routeForJob(job) as never);
  }, [atDrop, job, leaving]);

  // Raise the exception exactly once per visit and start the local wait from the server's waitSeconds.
  // A persisted wait (app restart) is reused as-is; Retry clears `raiseError`, which re-runs this.
  useEffect(() => {
    if (!job || !atDrop || wait || raiseError || leaving || raised.current) return;
    raised.current = true;
    void (async () => {
      try {
        const res = await raiseException(job, 'unavailable', { note: note?.trim() || undefined });
        const seconds = 'queued' in res ? DEFAULT_WAIT_SECONDS : (res.waitSeconds ?? DEFAULT_WAIT_SECONDS);
        startWait(job.id, seconds, 'unavailable');
        if ('queued' in res) toast.show('Saved offline — the wait timer runs locally', 'warning');
        else if (res.message) toast.show(res.message);
      } catch (e) {
        raised.current = false;
        setRaiseError(ApiError.is(e) ? e.detail : 'Could not start the wait timer. Try again.');
      }
    })();
  }, [atDrop, job, leaving, note, raiseError, raiseException, startWait, wait]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace((job ? routeForJob(job) : '/home') as never));

  if (!id) return <ErrorState title="Job not found" onRetry={() => router.replace('/home' as never)} retryLabel="Go home" />;
  if ((isLoading && !job) || (!job && leaving)) {
    return (
      <Screen>
        <IssueHeader title={TITLE} />
        <LoadingState label={leaving ? 'Updating the delivery…' : 'Loading delivery…'} />
      </Screen>
    );
  }
  if (!job) {
    return (
      <Screen>
        <IssueHeader title={TITLE} />
        <ErrorState title="Delivery unavailable" body={error ? 'We could not load this delivery. Check your connection and retry.' : 'This delivery is no longer active.'} onRetry={() => void refetch()} />
      </Screen>
    );
  }
  if (!atDrop) {
    return (
      <Screen>
        <IssueHeader title={TITLE} onBack={goBack} />
        <LoadingState label="Opening the delivery…" />
      </Screen>
    );
  }
  if (raiseError) {
    return (
      <Screen>
        <IssueHeader title={TITLE} onBack={goBack} />
        <ErrorState title="Could not start the wait" body={raiseError} onRetry={() => setRaiseError(null)} retryLabel="Retry" />
      </Screen>
    );
  }
  if (!wait) {
    return (
      <Screen>
        <IssueHeader title={TITLE} onBack={goBack} />
        <LoadingState label="Starting the mandatory wait…" />
      </Screen>
    );
  }

  const canCall = canCallCustomer(job.state);

  const call = async () => {
    if (busy) return;
    setBusy('call');
    try {
      const number = await callCustomer(job);
      const opened = await openDialer(number);
      if (!opened) {
        toast.error('Could not open the dialer');
        return;
      }
      recordCall(job.id);
    } catch (e) {
      toast.error(ApiError.is(e) ? e.detail : 'Could not fetch the customer number');
    } finally {
      setBusy(null);
    }
  };

  const resolve = async (outcome: 'continue' | 'escalate') => {
    if (busy) return;
    setBusy(outcome);
    setLeaving(true);
    try {
      const res = await resolveWait(job, 'unavailable', outcome);
      clearWait(job.id);
      setConfirmEscalate(false);
      if (outcome === 'continue') {
        if ('queued' in res) toast.show('Saved offline — continuing the delivery', 'warning');
        router.replace(routeForJob(job) as never);
        return;
      }
      if ('queued' in res) {
        toast.show('Escalation saved offline — it will sync when you are back online', 'warning');
        router.replace('/home' as never);
        return;
      }
      toast.success(res.message ?? 'Operations notified — return the package to the store');
      router.replace(routeForJob({ id: job.id, state: res.jobState }) as never);
    } catch (e) {
      setLeaving(false);
      toast.error(ApiError.is(e) ? e.detail : 'Could not update the delivery. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      scroll
      footer={
        <View style={styles.footer}>
          {!timerDone ? (
            <AppText variant="bodySm" color="textSecondary" align="center">
              Escalation unlocks when the timer ends
            </AppText>
          ) : null}
          <SecondaryButton label="ESCALATE TO SUPPORT" onPress={() => setConfirmEscalate(true)} disabled={!timerDone || busy !== null} style={styles.escalate} />
          <PrimaryButton label="CUSTOMER REACHED — CONTINUE" onPress={() => void resolve('continue')} loading={busy === 'continue'} disabled={busy !== null && busy !== 'continue'} />
        </View>
      }>
      <IssueHeader title={TITLE} onBack={goBack} />
      <View style={styles.body}>
        <View style={styles.timerPanel} accessibilityLiveRegion="polite" accessibilityLabel={timerDone ? 'Wait complete' : `Wait timer ${formatCountdown(remaining)} remaining`}>
          <AppText variant="bodyBold" color="textSecondary">
            WAIT MANDATORY TIMER
          </AppText>
          <AppText variant="display" color={timerDone ? 'success' : 'warning'} style={styles.timerValue}>
            {formatCountdown(remaining)}
          </AppText>
          <AppText variant="bodySemi" color="textSecondary" align="center" style={styles.timerCaption}>
            {timerDone ? 'Wait complete. You can escalate to support or continue if the customer was reached.' : 'Please attempt to contact the customer while waiting on-site.'}
          </AppText>
          {wait.calls > 0 ? <StatusChip label={`Called ×${wait.calls}`} tone="success" size="sm" style={styles.calledChip} /> : null}
        </View>

        <View style={styles.actionRow}>
          <PrimaryButton label="CALL CUSTOMER" icon={null} fullWidth={false} onPress={() => void call()} loading={busy === 'call'} disabled={!canCall || (busy !== null && busy !== 'call')} style={styles.callBtn} />
          <Pressable accessibilityRole="button" accessibilityLabel="Chat with customer" onPress={() => setChatOpen(true)} style={({ pressed }) => [styles.chatBtn, pressed && styles.pressed]}>
            <Icon name="message-circle" size={18} color="inkSoft" />
            <AppText variant="buttonSm" color="inkSoft">
              CHAT
            </AppText>
          </Pressable>
        </View>
        {!canCall ? (
          <AppText variant="bodySm" color="textMuted">
            The customer number is only available during the active delivery.
          </AppText>
        ) : null}

        <View style={styles.guidelines}>
          <AppText variant="titleSm">Recommended Protocol:</AppText>
          <View style={styles.protocolList}>
            {PROTOCOL.map((line, i) => {
              const done = (i === 0 && wait.calls >= 2) || (i === 2 && timerDone);
              return (
                <View key={line} style={styles.protocolRow}>
                  {done ? <Icon name="circle-check" size={14} color="success" /> : null}
                  <AppText variant="bodySm" color={done ? 'ink' : 'textSecondary'} style={styles.protocolText}>
                    {i + 1}. {line}
                  </AppText>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      <ConfirmationSheet
        visible={confirmEscalate}
        onClose={() => (busy ? undefined : setConfirmEscalate(false))}
        title="Escalate to support?"
        body="Operations will mark the order as returned. You will be asked to bring the package back to the store."
        icon="headset"
        tone="warning"
        confirmLabel="ESCALATE TO SUPPORT"
        cancelLabel="KEEP WAITING"
        loading={busy === 'escalate'}
        onConfirm={() => resolve('escalate')}
      />

      <BottomSheet visible={chatOpen} onClose={() => setChatOpen(false)} title={CHAT_COMING_SOON.title}>
        <AppText variant="body" color="textSecondary">
          {CHAT_COMING_SOON.body}
        </AppText>
        <PrimaryButton label="OK" icon={null} onPress={() => setChatOpen(false)} />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.x3l, paddingTop: spacing.gutter },
  timerPanel: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 32, padding: spacing.gutter, alignItems: 'center', gap: spacing.lg },
  timerValue: { fontSize: 32, lineHeight: 40, fontVariant: ['tabular-nums'] },
  timerCaption: { fontSize: 13, lineHeight: 18 },
  calledChip: { marginTop: spacing.xs },
  actionRow: { flexDirection: 'row', gap: spacing.lg, alignItems: 'stretch' },
  callBtn: { flex: 1, height: 51, paddingHorizontal: spacing.xxl },
  chatBtn: { flex: 1, height: 51, borderRadius: 100, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xxl, ...shadows.soft },
  pressed: { opacity: 0.85 },
  guidelines: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 32, padding: spacing.xxl, gap: spacing.md },
  protocolList: { gap: spacing.xs },
  protocolRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  protocolText: { flex: 1 },
  footer: { gap: spacing.lg },
  escalate: { height: 52 },
});
