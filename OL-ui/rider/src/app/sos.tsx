import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, BottomSheet, ConfirmationSheet, Icon, PrimaryButton, Screen, SecondaryButton, TextField, toast, type IconName } from '@/components/ui';
import { RIDER_HELPLINE } from '@/features/issues/issueOptions';
import { useJobActions } from '@/hooks';
import { openDialer } from '@/navigation/openNavigation';
import { canRaiseException } from '@/state-machine/deliveryStateMachine';
import { selectJob, selectPosition, useDeliveryStore } from '@/stores';
import { colors, shadows, spacing } from '@/theme';
import { ApiError } from '@/types';

const HELPLINE_DISPLAY = '1800-000-0000';

interface ActionRowProps {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
}

const ActionRow = ({ icon, title, subtitle, onPress }: ActionRowProps) => (
  <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`} onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
    <Icon name={icon} size={20} strokeWidth={2.25} />
    <View style={styles.actionText}>
      <AppText variant="title">{title}</AppText>
      <AppText variant="bodySemi" color="textSecondary" style={styles.sub}>
        {subtitle}
      </AppText>
    </View>
  </Pressable>
);

/**
 * Global safety screen (Figma safety-exception) reachable without an active job: the safety
 * sheet sits over a dimmed context area. SOS goes through useJobActions().sos(); an incident
 * report becomes a `safety` exception on the active job, or a helpline call when there is none.
 */
export default function SafetyScreen() {
  const insets = useSafeAreaInsets();
  const { sos, raiseException } = useJobActions();
  const job = useDeliveryStore(selectJob);
  const position = useDeliveryStore(selectPosition);
  const [confirmSos, setConfirmSos] = useState(false);
  const [sending, setSending] = useState(false);
  const [alerted, setAlerted] = useState(false);
  const [reportSheet, setReportSheet] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');

  const canLogIncident = !!job && canRaiseException(job.state, 'safety');

  const triggerSos = async () => {
    setSending(true);
    try {
      await sos(job?.id);
      setAlerted(true);
      setConfirmSos(false);
      toast.success('SOS sent. Operations have been alerted.');
    } catch (e) {
      toast.error(ApiError.is(e) ? e.detail : 'Could not send the SOS. Call the helpline now.');
    } finally {
      setSending(false);
    }
  };

  const logIncident = async () => {
    if (!job) return;
    setReporting(true);
    try {
      const res = await raiseException(job, 'safety', { note: note.trim() });
      setReportSheet(false);
      setNote('');
      toast.success('queued' in res ? 'Incident saved. It will be sent as soon as you are back online.' : 'Incident logged for safety records. Support will follow up.');
    } catch (e) {
      toast.error(ApiError.is(e) ? e.detail : 'Could not log the incident. Call the helpline instead.');
    } finally {
      setReporting(false);
    }
  };

  const callHelpline = async () => {
    const ok = await openDialer(RIDER_HELPLINE);
    if (!ok) toast.error(`Could not open the dialer. Call ${HELPLINE_DISPLAY}.`);
  };

  const closeReport = () => {
    if (!reporting) setReportSheet(false);
  };

  return (
    <Screen padded={false} edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={() => (router.canGoBack() ? router.back() : router.replace('/home' as never))} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Icon name="chevron-left" size={20} strokeWidth={2.5} />
        </Pressable>
        <AppText variant="h3" style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
          Safety Assistance
        </AppText>
      </View>

      <View style={styles.context}>
        {alerted ? (
          <View style={[styles.contextCard, styles.alertedCard]} accessibilityLiveRegion="assertive">
            <View style={styles.alertedRow}>
              <Icon name="siren" size={20} color="danger" strokeWidth={2.5} />
              <AppText variant="titleLg" color="danger">
                Operations alerted
              </AppText>
            </View>
            <AppText variant="bodySm" color="textSecondary">
              Our team can see your live location and is reaching out to you now. Stay where it is safe and keep your phone nearby.
            </AppText>
          </View>
        ) : (
          <View style={styles.dimmed} pointerEvents="none">
            <View style={styles.contextCard}>
              <AppText variant="bodySemi">{job ? `Active Order #${job.orderRef}` : 'No active order'}</AppText>
            </View>
            <View style={styles.contextCard}>
              <AppText variant="bodySemi">{position ? `Live location ready · ±${Math.round(position.accuracyM)} m` : 'Locating you…'}</AppText>
            </View>
          </View>
        )}
      </View>

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md }]}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <AppText variant="h2" accessibilityRole="header">
            Need help?
          </AppText>
          <View style={styles.secure}>
            <AppText variant="label" color="danger" uppercase style={styles.secureText}>
              SECURE LINE
            </AppText>
          </View>
        </View>
        <AppText variant="body" color="textSecondary">
          If you feel unsafe, encounter an accident, or need operational support, choose an option below:
        </AppText>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Trigger emergency SOS. Shares active location with police and support"
            accessibilityState={{ busy: sending, disabled: sending }}
            disabled={sending}
            onPress={() => setConfirmSos(true)}
            style={({ pressed }) => [styles.emergency, (pressed || sending) && styles.emergencyPressed]}>
            <Icon name="shield-alert" size={24} color="surface" strokeWidth={2.25} />
            <View style={styles.actionText}>
              <AppText variant="titleLg" color="surface" style={styles.emergencyTitle}>
                {alerted ? 'SOS SENT — SEND AGAIN' : 'TRIGGER EMERGENCY SOS'}
              </AppText>
              <AppText variant="bodySemi" color="rgba(255,255,255,0.85)" style={styles.sub}>
                Shares active location with police & support
              </AppText>
            </View>
          </Pressable>
          <ActionRow icon="alert-triangle" title="Report Accident / Dispute" subtitle="Log incident for safety records" onPress={() => setReportSheet(true)} />
          <ActionRow icon="headset" title="Call Rider Helpline" subtitle="Instant connection to logistics team" onPress={() => void callHelpline()} />
        </View>
      </View>

      <ConfirmationSheet
        visible={confirmSos}
        onClose={() => setConfirmSos(false)}
        title="Send emergency SOS?"
        body="Your live location will be shared with OneLocal operations and emergency services. Only use this in a real emergency."
        icon="shield-alert"
        tone="danger"
        confirmLabel="Send SOS now"
        cancelLabel="Cancel"
        onConfirm={triggerSos}
        loading={sending}
      />

      <BottomSheet visible={reportSheet} onClose={closeReport} dismissable={!reporting} title="Report Accident / Dispute">
        {job && canLogIncident ? (
          <>
            <AppText variant="body" color="textSecondary">
              {`Describe what happened. It is logged against order #${job.orderRef} for safety records and shared with the support team.`}
            </AppText>
            <TextField label="What happened?" value={note} onChangeText={setNote} placeholder="e.g. Minor collision near the drop location, no injuries" multiline numberOfLines={4} height={112} style={styles.noteInput} textAlignVertical="top" editable={!reporting} />
            <View style={styles.sheetActions}>
              <PrimaryButton label="Log incident" onPress={() => void logIncident()} disabled={note.trim().length < 5} loading={reporting} icon={null} />
              <SecondaryButton label="Cancel" onPress={closeReport} disabled={reporting} />
            </View>
          </>
        ) : (
          <>
            <AppText variant="body" color="textSecondary">
              {job
                ? 'This order can no longer take an in-app incident report. Call the rider helpline and our safety desk will log it for you right away.'
                : 'Incident reports are attached to a delivery. With no active order, call the rider helpline and our safety desk will log it for you right away.'}
            </AppText>
            <View style={styles.sheetActions}>
              <PrimaryButton
                label="Call Rider Helpline"
                icon="phone"
                iconPosition="left"
                onPress={() => {
                  setReportSheet(false);
                  void callHelpline();
                }}
              />
              <SecondaryButton label="Cancel" onPress={closeReport} />
            </View>
          </>
        )}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'space-between' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.gutter, paddingVertical: spacing.md },
  back: { backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, ...shadows.soft },
  headerTitle: { flex: 1 },
  pressed: { opacity: 0.85 },
  context: { flex: 1, padding: spacing.gutter, gap: spacing.xxl },
  dimmed: { opacity: 0.4, gap: spacing.xxl },
  contextCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 25.5, padding: spacing.xxl, gap: spacing.md },
  alertedCard: { borderWidth: 2, borderColor: colors.danger, backgroundColor: colors.surfaceDanger },
  alertedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  sheet: { backgroundColor: colors.surface, borderTopWidth: 3, borderColor: colors.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.gutter, gap: spacing.x3l },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderSubtle },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  secure: { backgroundColor: colors.surfaceDanger, borderRadius: 13.5, padding: spacing.sm },
  secureText: { fontSize: 11, lineHeight: 15 },
  actions: { gap: spacing.lg },
  emergency: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: 18, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.border, borderRadius: 36.5, minHeight: 72 },
  emergencyPressed: { opacity: 0.9 },
  emergencyTitle: { fontSize: 15, lineHeight: 20 },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.xxl, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 34, minHeight: 64 },
  actionText: { flex: 1, gap: spacing.xxs },
  sub: { fontSize: 11, lineHeight: 15 },
  noteInput: { paddingTop: spacing.lg },
  sheetActions: { gap: spacing.lg },
});
