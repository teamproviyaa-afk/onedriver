import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, shadows, spacing } from '@/theme';
import { AppText, ConfirmationSheet, DestructiveButton, Dot, ErrorState, LoadingState, Radio, Screen, toast } from '@/components/ui';
import { useJob, useJobActions } from '@/hooks';
import { canRaiseException, routeForJob, STATE_LABELS } from '@/state-machine/deliveryStateMachine';
import { ApiError, type ExceptionKind, type RiderFlowState } from '@/types';
import { ReportNoteSheet } from '@/features/delivery/components';
import { ISSUE_OPTIONS, type IssueOption } from '@/features/issues/issueOptions';
import { IssueHeader } from '@/features/issues/IssueHeader';

const TITLE = 'Report Delivery Issue';
const CAPTION = 'Select a reason why this delivery could not be completed:';

type NoteKind = Extract<IssueOption['kind'], 'cannot_access' | 'other'>;

/** Copy for the note sheet shown before a direct report (the Figma list itself has no note field). */
const NOTE_SHEET: Record<NoteKind, { title: string; body: string; placeholder: string }> = {
  cannot_access: { title: 'Cannot access location', body: 'Operations will be notified and will help you reach the customer or arrange a return.', placeholder: 'e.g. Gate locked, guard refused entry' },
  other: { title: 'Report an issue', body: 'Tell operations what is blocking this delivery so they can help.', placeholder: 'What is blocking the delivery?' },
};

/**
 * Report Delivery Issue (Figma delivery-failed): single-select reason list and a red
 * "CONFIRM FAIL STATE" action. Every reason goes through useJobActions().raiseException or
 * routes to its dedicated flow (customer-unavailable, wrong-address, safety). Only reasons
 * valid for the job's current state (canRaiseException) can be selected.
 */
export default function ReportIssueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isLoading, error, refetch } = useJob(id);
  const { raiseException } = useJobActions();
  const [picked, setPicked] = useState<IssueOption['kind'] | null>(null);
  const [sheet, setSheet] = useState<'refused' | NoteKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const options = ISSUE_OPTIONS.map((o) => ({ ...o, enabled: job ? canRaiseException(job.state, o.kind) : false }));
  const firstEnabled = options.find((o) => o.enabled)?.kind ?? null;
  // The rider's pick wins while it is valid for the job state; otherwise the first valid reason is preselected (Figma default).
  const selected = picked && options.some((o) => o.kind === picked && o.enabled) ? picked : firstEnabled;

  // Nothing reportable (terminal / not yet active job) → the job's own screen.
  useEffect(() => {
    if (job && !firstEnabled && !leaving) router.replace(routeForJob(job) as never);
  }, [firstEnabled, job, leaving]);

  if (!id) return <ErrorState title="Job not found" body="This delivery is no longer available." onRetry={() => router.replace('/home' as never)} retryLabel="Go home" />;
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

  const stateLabel = STATE_LABELS[job.state as RiderFlowState]?.title ?? job.state.replace(/_/g, ' ').toUpperCase();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(routeForJob(job) as never));
  const noteCopy = NOTE_SHEET[sheet === 'cannot_access' ? 'cannot_access' : 'other'];

  const report = async (kind: ExceptionKind, note: string | undefined, successMessage: string) => {
    setBusy(true);
    setLeaving(true);
    try {
      const res = await raiseException(job, kind, { note });
      setSheet(null);
      if ('queued' in res) {
        toast.show('Saved offline — will sync when you are back online', 'warning');
        // No optimistic state for exceptions: a refused order goes home, anything else back to the drop.
        router.replace((kind === 'refused' ? '/home' : routeForJob(job)) as never);
        return;
      }
      toast.success(res.message ?? successMessage);
      router.replace(routeForJob({ id: job.id, state: res.jobState }) as never);
    } catch (e) {
      setLeaving(false);
      toast.error(ApiError.is(e) ? e.detail : 'Could not report the issue. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!selected || busy) return;
    switch (selected) {
      case 'unavailable':
        router.push(`/job/${job.id}/issue/unavailable` as never);
        return;
      case 'address':
        router.push(`/job/${job.id}/issue/address` as never);
        return;
      case 'safety':
        router.push(`/job/${job.id}/sos` as never);
        return;
      default:
        setSheet(selected);
        return;
    }
  };

  return (
    <Screen scroll footer={<DestructiveButton label="CONFIRM FAIL STATE" onPress={confirm} disabled={!selected} loading={busy} style={styles.confirm} />}>
      <IssueHeader title={TITLE} onBack={goBack} />
      <View style={styles.body}>
        <AppText variant="bodySemi" color="textSecondary" style={styles.caption}>
          {CAPTION}
        </AppText>
        <View style={styles.list} accessibilityRole="radiogroup">
          {options.map((o) => {
            const isSelected = selected === o.kind;
            return (
              <Pressable
                key={o.kind}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, checked: isSelected, disabled: !o.enabled }}
                accessibilityLabel={o.label}
                accessibilityHint={o.enabled ? undefined : `Not available while ${stateLabel}`}
                disabled={!o.enabled}
                onPress={() => setPicked(o.kind)}
                style={({ pressed }) => [styles.row, !o.enabled && styles.rowDisabled, pressed && styles.pressed]}>
                <View style={styles.rowLeft}>
                  <Dot color={o.critical ? colors.danger : colors.ink} size={10} />
                  <View style={styles.labelCol}>
                    <AppText variant="bodyBold" color={o.critical ? 'danger' : 'ink'} style={styles.label}>
                      {o.label}
                    </AppText>
                    {!o.enabled ? (
                      <AppText variant="bodySm" color="textMuted">
                        Not available while {stateLabel}
                      </AppText>
                    ) : null}
                  </View>
                </View>
                <Radio selected={isSelected} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <ConfirmationSheet
        visible={sheet === 'refused'}
        onClose={() => (busy ? undefined : setSheet(null))}
        title="Customer refused the package?"
        body="The order will be marked as refused and returned to the store. Operations will follow up with the customer."
        icon="package-x"
        tone="danger"
        confirmLabel="YES, CUSTOMER REFUSED"
        cancelLabel="GO BACK"
        loading={busy}
        onConfirm={() => report('refused', undefined, 'Order marked as refused — return the package to the store')}
      />

      <ReportNoteSheet
        visible={sheet === 'cannot_access' || sheet === 'other'}
        onClose={() => (busy ? undefined : setSheet(null))}
        title={noteCopy.title}
        body={noteCopy.body}
        placeholder={noteCopy.placeholder}
        confirmLabel="SEND REPORT"
        loading={busy}
        onConfirm={(note) => report(sheet === 'cannot_access' ? 'cannot_access' : 'other', note, 'Reported to operations')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.x3l, paddingTop: spacing.gutter },
  caption: { fontSize: 15, lineHeight: 21 },
  list: { gap: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 26,
    padding: spacing.xxl,
    minHeight: 56,
  },
  rowDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.9 },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  labelCol: { flex: 1, gap: 2 },
  label: { fontSize: 15, lineHeight: 20 },
  confirm: { borderRadius: 27, borderWidth: 0, ...shadows.soft },
});
