import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, ConfirmationSheet, ErrorState, Icon, InfoBanner, LoadingState, Screen, SecondaryButton, TextField, toast } from '@/components/ui';
import { RiderMap } from '@/components/app/RiderMap';
import { useJob, useJobActions } from '@/hooks';
import { haversineM } from '@/domain/geo';
import { canCallCustomer, canSeeDropAddress } from '@/domain/privacy';
import { openDialer } from '@/navigation/openNavigation';
import { canRaiseException, routeForJob } from '@/state-machine/deliveryStateMachine';
import { useDeliveryStore, selectPosition } from '@/stores';
import { ApiError } from '@/types';
import { formatMeters } from '@/utils/format';
import { TintedButton } from '@/features/delivery/components';
import { IssueHeader } from '@/features/issues/IssueHeader';

const TITLE = 'Wrong Address Discovered';
const LOW_CONFIDENCE = 0.6;

/**
 * Wrong Address Discovered (Figma wrong-address): merchant-stated destination vs the rider's
 * live GPS, the distance between them and three actions — share location, call the customer,
 * submit an address dispute (current GPS becomes the corrected pin). All mutations go through
 * useJobActions().raiseException('address').
 */
export default function WrongAddressScreen() {
  const { id, note: noteParam } = useLocalSearchParams<{ id: string; note?: string }>();
  const { job, isLoading, error, refetch } = useJob(id);
  const { raiseException, callCustomer } = useJobActions();
  const position = useDeliveryStore(selectPosition);
  const [note, setNote] = useState(noteParam ?? '');
  const [busy, setBusy] = useState<'share' | 'call' | 'dispute' | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const distanceM = useMemo(() => (job && position ? haversineM(position, job.drop) : null), [job, position]);
  // Address issues are an at-drop exception; any other state belongs on the job's own screen.
  const canReport = !!job && canRaiseException(job.state, 'address');

  useEffect(() => {
    if (job && !canReport && !leaving) router.replace(routeForJob(job) as never);
  }, [canReport, job, leaving]);

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
  if (!canReport) {
    return (
      <Screen>
        <IssueHeader title={TITLE} onBack={goBack} />
        <LoadingState label="Opening the delivery…" />
      </Screen>
    );
  }

  const canCall = canCallCustomer(job.state);
  const showAddress = canSeeDropAddress(job.state);
  const statedAddress = [job.drop.flatFloor, showAddress && job.drop.address ? job.drop.address : job.drop.area].filter(Boolean).join(', ');
  const landmark = showAddress ? job.drop.landmark : undefined;
  const lowConfidence = typeof job.drop.confidence === 'number' && job.drop.confidence < LOW_CONFIDENCE;
  const coords = position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : null;
  const geoValue = coords ? `${coords}${distanceM !== null ? ` (${formatMeters(distanceM)} away)` : ''}` : 'Waiting for a GPS fix…';
  const accuracy = position ? `±${Math.round(position.accuracyM)} m` : null;

  const share = async () => {
    if (busy) return;
    setBusy('share');
    try {
      const res = await raiseException(job, 'address');
      if ('queued' in res) toast.show('Saved offline — your location will be shared when back online', 'warning');
      else toast.success(res.message ?? 'Your live location was shared with the customer and operations');
    } catch (e) {
      toast.error(ApiError.is(e) ? e.detail : 'Could not share your location. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const call = async () => {
    if (busy) return;
    setBusy('call');
    try {
      const number = await callCustomer(job);
      if (!(await openDialer(number))) toast.error('Could not open the dialer');
    } catch (e) {
      toast.error(ApiError.is(e) ? e.detail : 'Could not fetch the customer number');
    } finally {
      setBusy(null);
    }
  };

  const dispute = async () => {
    if (busy || !position) return;
    setBusy('dispute');
    setLeaving(true);
    try {
      const res = await raiseException(job, 'address', { note: note.trim() || undefined, correctedLat: position.lat, correctedLng: position.lng });
      setDisputeOpen(false);
      if ('queued' in res) toast.show('Dispute saved offline — it will sync when you are back online', 'warning');
      else toast.success(res.message ?? 'Address dispute submitted. Operations will confirm the corrected pin.');
      router.replace(routeForJob(job) as never);
    } catch (e) {
      setLeaving(false);
      toast.error(ApiError.is(e) ? e.detail : 'Could not submit the dispute. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      scroll
      footer={
        <View style={styles.footer}>
          {!position ? (
            <AppText variant="bodySm" color="textSecondary" align="center">
              Waiting for your GPS position before you can dispute the address.
            </AppText>
          ) : null}
          <TintedButton label="SUBMIT ADDRESS DISPUTE" background={colors.ink} color={colors.surface} radius={27} height={54} textVariant="buttonSecondary" onPress={() => setDisputeOpen(true)} disabled={!position || busy !== null} />
        </View>
      }>
      <IssueHeader title={TITLE} onBack={goBack} />
      <View style={styles.body}>
        <View style={styles.alertCard}>
          <View style={styles.alertHead}>
            <Icon name="map-pin" size={20} color="danger" />
            <AppText variant="title" color="danger">
              Location Discrepancy
            </AppText>
          </View>
          <AppText variant="body" style={styles.alertBody}>
            Your GPS location does not align with the merchant-stated delivery address.
          </AppText>
        </View>

        {lowConfidence ? <InfoBanner tone="warning" icon="alert-triangle" bold={false} text="Low-confidence pin: this address was geocoded with low confidence. Confirm with the customer before disputing." /> : null}

        <View style={styles.mapWrap}>
          <RiderMap rider={position} drop={job.drop} focus="all" height={180} interactive={false} />
        </View>

        <View style={styles.addresses}>
          <View style={styles.addressCard}>
            <AppText variant="bodyBoldSm" color="textSecondary" style={styles.addressLabel}>
              STATED DELIVERY DESTINATION
            </AppText>
            <AppText variant="titleSm">{statedAddress}</AppText>
            {landmark ? (
              <AppText variant="bodySm" color="textSecondary">
                Landmark: {landmark}
              </AppText>
            ) : null}
            {!showAddress ? (
              <AppText variant="bodySm" color="textMuted">
                Full address unlocks after pickup verification.
              </AppText>
            ) : null}
          </View>
          <View style={styles.addressCard}>
            <AppText variant="bodyBoldSm" color="danger" style={styles.addressLabel}>
              YOUR CURRENT GEOLOCATION
            </AppText>
            <AppText variant="titleSm" color="danger" style={styles.mono}>
              {geoValue}
            </AppText>
            {accuracy ? (
              <AppText variant="bodySm" color="textSecondary">
                GPS accuracy {accuracy}
              </AppText>
            ) : null}
          </View>
        </View>

        <View style={styles.supportActions}>
          <SecondaryButton label="SHARE CURRENT MAP LOCATION" onPress={() => void share()} loading={busy === 'share'} disabled={!position || (busy !== null && busy !== 'share')} style={styles.secondary} />
          <SecondaryButton label="DIAL CUSTOMER DIRECT" onPress={() => void call()} loading={busy === 'call'} disabled={!canCall || (busy !== null && busy !== 'call')} style={styles.secondary} />
        </View>
      </View>

      <ConfirmationSheet
        visible={disputeOpen}
        onClose={() => (busy ? undefined : setDisputeOpen(false))}
        title="Submit address dispute?"
        body={coords ? `Your current position (${coords}) will be sent to operations as the corrected drop pin.` : undefined}
        icon="map-pin"
        tone="warning"
        confirmLabel="SUBMIT DISPUTE"
        cancelLabel="CANCEL"
        loading={busy === 'dispute'}
        onConfirm={dispute}>
        <TextField label="What is wrong with the address? (optional)" placeholder="e.g. Building name is different, gate is on the other road" value={note} onChangeText={setNote} multiline numberOfLines={3} height={88} maxLength={280} style={styles.noteInput} textAlignVertical="top" containerStyle={styles.noteField} />
      </ConfirmationSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.x3l, paddingTop: spacing.gutter },
  alertCard: { backgroundColor: colors.surfaceDanger, borderWidth: 2, borderColor: colors.border, borderRadius: 48, padding: spacing.xxl, gap: spacing.md },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  alertBody: { fontSize: 13, lineHeight: 18 },
  mapWrap: { borderRadius: 24, overflow: 'hidden', borderWidth: 2, borderColor: colors.border },
  addresses: { gap: spacing.lg },
  addressCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 32.5, padding: spacing.xl, gap: spacing.xs },
  addressLabel: { fontSize: 11, lineHeight: 15 },
  mono: { fontVariant: ['tabular-nums'] },
  supportActions: { gap: spacing.base },
  secondary: { height: 52 },
  footer: { gap: spacing.md },
  noteField: { paddingTop: spacing.md },
  noteInput: { height: undefined, paddingVertical: spacing.lg },
});
