import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { colors, spacing } from '@/theme';
import { AppText, BottomSheet, ConfirmationSheet, ErrorState, Icon, LoadingState, PrimaryButton, Screen, TextField, toast } from '@/components/ui';
import { RiderMap } from '@/components/app/RiderMap';
import { useJob, useJobActions } from '@/hooks';
import { openDialer } from '@/navigation/openNavigation';
import { canRaiseException, routeForJob, STATE_LABELS } from '@/state-machine/deliveryStateMachine';
import { useDeliveryStore, selectPosition } from '@/stores';
import { ApiError, type RiderFlowState } from '@/types';
import { formatClock } from '@/utils/format';
import { RIDER_HELPLINE } from '@/features/issues/issueOptions';
import { IssueHeader } from '@/features/issues/IssueHeader';

const TITLE = 'Safety Assistance';
const HOLD_MS = 3000;

const haptic = async (kind: 'start' | 'sent' | 'cancel') => {
  if (Platform.OS === 'web') return; // browsers block vibration before the first tap
  try {
    if (kind === 'start') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (kind === 'sent') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else await Haptics.selectionAsync();
  } catch {
    // haptics are best-effort
  }
};

/**
 * Safety Assistance (Figma safety-exception): the live job (order card + map) sits dimmed behind
 * a white safety sheet with three actions — hold-to-trigger Emergency SOS (or confirm sheet),
 * Report Accident / Dispute (note → raiseException 'safety'), Call Rider Helpline.
 * SOS goes through useJobActions().sos + raiseException('safety'); live GPS is shown throughout.
 */
export default function SafetyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { job, isLoading, error, refetch } = useJob(id);
  const { sos, raiseException } = useJobActions();
  const position = useDeliveryStore(selectPosition);

  const [busy, setBusy] = useState<'sos' | 'report' | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [note, setNote] = useState('');
  const [holding, setHolding] = useState(false);

  const [progress] = useState(() => new Animated.Value(0));
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedByHold = useRef(false);

  const cancelHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    setHolding(false);
  }, [progress]);

  useEffect(() => () => cancelHold(), [cancelHold]);

  const trigger = useCallback(async () => {
    if (!job || busy) return;
    setBusy('sos');
    try {
      await sos(job.id);
      if (canRaiseException(job.state, 'safety')) {
        try {
          await raiseException(job, 'safety');
        } catch (e) {
          // SOS itself was delivered; the incident record is best-effort.
          if (!ApiError.is(e, 'invalid_transition')) throw e;
        }
      }
      setSentAt(new Date().toISOString());
      setConfirmOpen(false);
      void haptic('sent');
      toast.success('Operations alerted · live location shared');
    } catch (e) {
      toast.error(ApiError.is(e) ? e.detail : 'Could not send the SOS. Call the helpline.');
    } finally {
      setBusy(null);
    }
  }, [busy, job, raiseException, sos]);

  const onPressIn = () => {
    if (busy) return;
    firedByHold.current = false;
    setHolding(true);
    void haptic('start');
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: true }).start();
    holdTimer.current = setTimeout(() => {
      firedByHold.current = true;
      holdTimer.current = null;
      setHolding(false);
      void trigger();
    }, HOLD_MS);
  };

  const onPressOut = () => {
    const wasHolding = holdTimer.current !== null;
    cancelHold();
    if (wasHolding && !firedByHold.current) {
      void haptic('cancel');
      setConfirmOpen(true);
    }
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace((job ? routeForJob(job) : '/home') as never));

  if (!id) return <ErrorState title="Job not found" onRetry={() => router.replace('/home' as never)} retryLabel="Go home" />;
  if (isLoading && !job) {
    return (
      <Screen>
        <IssueHeader title={TITLE} />
        <LoadingState label="Loading delivery…" />
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

  const stateLabel = STATE_LABELS[job.state as RiderFlowState]?.subtitle ?? job.state.replace(/_/g, ' ');
  const coords = position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)} · ±${Math.round(position.accuracyM)} m` : 'Waiting for a GPS fix…';

  const report = async () => {
    if (busy) return;
    if (!canRaiseException(job.state, 'safety')) {
      toast.error('Incidents can only be logged during an active delivery');
      return;
    }
    setBusy('report');
    try {
      const res = await raiseException(job, 'safety', { note: note.trim() || undefined });
      setReportOpen(false);
      setNote('');
      if ('queued' in res) toast.show('Report saved offline — it will sync when you are back online', 'warning');
      else toast.success('Incident logged — operations will contact you');
    } catch (e) {
      toast.error(ApiError.is(e) ? e.detail : 'Could not log the incident. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const callHelpline = async () => {
    if (!(await openDialer(RIDER_HELPLINE))) toast.error('Could not open the dialer');
  };

  return (
    <Screen scroll padded={false} edges={['top']} contentStyle={styles.content}>
      <View style={styles.top}>
        <IssueHeader title={TITLE} onBack={goBack} />
        <View style={styles.dimmed} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.placeholderCard}>
            <AppText variant="bodySemi" numberOfLines={1}>
              Active Order {job.orderRef} · {stateLabel}
            </AppText>
          </View>
          <View style={styles.mapCard}>
            <RiderMap rider={position} drop={job.drop} pickup={job.pickup} focus="all" height={140} interactive={false} />
          </View>
        </View>
      </View>

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.md }]}>
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>
        <View style={styles.titleRow}>
          <AppText variant="h2">Need help?</AppText>
          <View style={styles.securePill}>
            <AppText variant="labelXs" color="danger" style={styles.secureText}>
              SECURE LINE
            </AppText>
          </View>
        </View>
        <AppText variant="body" color="textSecondary">
          If you feel unsafe, encounter an accident, or need operational support, choose an option below:
        </AppText>
        <View style={styles.coordsRow} accessibilityLabel={`Live location ${coords}`}>
          <Icon name="locate" size={16} color={position ? 'success' : 'textMuted'} />
          <AppText variant="mono" color="textSecondary" style={styles.coords} numberOfLines={1}>
            {coords}
          </AppText>
        </View>

        {sentAt ? (
          <View style={styles.alertedCard} accessibilityLiveRegion="polite">
            <Icon name="shield-check" size={22} color="success" />
            <View style={styles.alertedText}>
              <AppText variant="title">Operations alerted · live location shared</AppText>
              <AppText variant="bodySm" color="textSecondary">
                Sent at {formatClock(sentAt)}. Stay where it is safe — the team will call you.
              </AppText>
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Trigger emergency SOS"
            accessibilityHint="Press and hold for three seconds, or tap to confirm"
            accessibilityState={{ busy: busy === 'sos' }}
            disabled={busy !== null}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            style={styles.emergency}>
            <Animated.View pointerEvents="none" style={[styles.holdFill, { transform: [{ scaleX: progress }] }]} />
            <Icon name="shield-alert" size={24} color="surface" />
            <View style={styles.triggerText}>
              <AppText variant="statusTime" color="surface">
                {busy === 'sos' ? 'SENDING SOS…' : holding ? 'KEEP HOLDING…' : 'TRIGGER EMERGENCY SOS'}
              </AppText>
              <AppText variant="bodySemi" color="rgba(255,255,255,0.85)" style={styles.subLabel}>
                {holding ? 'Release early to confirm instead' : 'Shares active location with police & support'}
              </AppText>
            </View>
          </Pressable>

          <Pressable accessibilityRole="button" accessibilityLabel="Report accident or dispute" onPress={() => setReportOpen(true)} disabled={busy !== null} style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}>
            <Icon name="alert-triangle" size={20} />
            <View style={styles.triggerText}>
              <AppText variant="title">Report Accident / Dispute</AppText>
              <AppText variant="bodySemi" color="textSecondary" style={styles.subLabel}>
                Log incident for safety records
              </AppText>
            </View>
          </Pressable>

          <Pressable accessibilityRole="button" accessibilityLabel={`Call rider helpline ${RIDER_HELPLINE}`} onPress={() => void callHelpline()} style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}>
            <Icon name="headset" size={20} />
            <View style={styles.triggerText}>
              <AppText variant="title">Call Rider Helpline</AppText>
              <AppText variant="bodySemi" color="textSecondary" style={styles.subLabel}>
                Instant connection to logistics team
              </AppText>
            </View>
          </Pressable>
        </View>
      </View>

      <ConfirmationSheet
        visible={confirmOpen}
        onClose={() => (busy ? undefined : setConfirmOpen(false))}
        title="Trigger emergency SOS?"
        body="Operations and the police helpline will be alerted and your live location will be shared until you are safe."
        icon="siren"
        tone="danger"
        confirmLabel="SEND SOS NOW"
        cancelLabel="CANCEL"
        loading={busy === 'sos'}
        onConfirm={trigger}
      />

      <BottomSheet visible={reportOpen} onClose={() => (busy ? undefined : setReportOpen(false))} title="Report Accident / Dispute" dismissable={busy === null}>
        <AppText variant="body" color="textSecondary">
          Describe what happened. The incident is logged with your current location for safety records and operations will follow up.
        </AppText>
        <TextField label="What happened?" placeholder="e.g. Minor collision at the junction, customer dispute at the gate" value={note} onChangeText={setNote} multiline numberOfLines={4} height={104} maxLength={400} style={styles.noteInput} textAlignVertical="top" />
        <PrimaryButton label="SUBMIT REPORT" icon={null} onPress={() => void report()} loading={busy === 'report'} />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'space-between' },
  top: { paddingHorizontal: spacing.gutter },
  dimmed: { opacity: 0.4, gap: spacing.xxl, paddingVertical: spacing.gutter },
  placeholderCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 25.5, padding: spacing.xxl },
  mapCard: { borderRadius: 25.5, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderSubtle },
  sheet: { backgroundColor: colors.surface, borderTopWidth: 3, borderColor: colors.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.gutter, gap: spacing.x3l, marginTop: spacing.xxl },
  handleWrap: { alignItems: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderSubtle },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  securePill: { backgroundColor: colors.surfaceDanger, borderRadius: 13.5, padding: spacing.sm },
  secureText: { fontSize: 11, lineHeight: 14 },
  coordsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  coords: { flexShrink: 1, fontSize: 13, lineHeight: 18 },
  alertedCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, backgroundColor: colors.surfaceLime, borderWidth: 2, borderColor: colors.border, borderRadius: 24, padding: spacing.xxl },
  alertedText: { flex: 1, gap: 2 },
  actions: { gap: spacing.lg },
  emergency: { overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: spacing.lg, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.border, borderRadius: 36.5, padding: spacing.x3l - 2, minHeight: 72 },
  holdFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.dangerDark, transformOrigin: 'left' },
  triggerText: { flex: 1, gap: 2 },
  subLabel: { fontSize: 11, lineHeight: 15 },
  actionCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 34, padding: spacing.xxl, minHeight: 64 },
  pressed: { opacity: 0.9 },
  noteInput: { height: undefined, paddingVertical: spacing.lg },
});
