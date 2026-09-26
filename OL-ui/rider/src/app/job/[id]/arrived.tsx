import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, Divider, GhostButton, Icon, PrimaryButton, Screen, SecondaryButton, toast } from '@/components/ui';
import { RiderMap, SOSButton } from '@/components/app';
import { useJobActions } from '@/hooks';
import { useDeliveryStore, selectPosition } from '@/stores';
import { canCallCustomer, canSeeDropAddress } from '@/domain/privacy';
import { openDialer } from '@/navigation/openNavigation';
import { routeForJob } from '@/state-machine/deliveryStateMachine';
import { useJobScreen } from '@/features/delivery/useJobScreen';
import { errorMessage } from '@/features/delivery/errors';
import { dropAddressLine } from '@/features/delivery/address';
import { DeliveryStepper, JobBottomDrawer, JobScreenFallback, LabelValue, drawerFooterStyle, figmaText } from '@/features/delivery/components';

/**
 * Arrival (Figma arrival "You have arrived"): map with the drop pin, the full drop
 * address + landmark + instructions, call customer, and the handover step that
 * leads to delivery verification.
 */
export default function ArrivedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isLoading, error, refetch, lockRedirect, unlockRedirect } = useJobScreen(id, ['at_drop']);
  const { step, callCustomer } = useJobActions();
  const position = useDeliveryStore(selectPosition);
  const [mapHeight, setMapHeight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [calling, setCalling] = useState(false);

  if (!job) return <JobScreenFallback error={isLoading ? null : error} onRetry={refetch} />;

  const showAddress = canSeeDropAddress(job.state);
  const callable = canCallCustomer(job.state);
  const address = dropAddressLine(job);

  const call = async () => {
    setCalling(true);
    try {
      const number = await callCustomer(job);
      const ok = await openDialer(number);
      if (!ok) toast.error('Could not open the dialer');
    } catch (e) {
      toast.error(errorMessage(e, 'Customer number is not available right now'));
    } finally {
      setCalling(false);
    }
  };

  const startVerification = async () => {
    setBusy(true);
    lockRedirect();
    try {
      const updated = await step(job, 'handover');
      router.replace(routeForJob(updated) as never);
    } catch (e) {
      unlockRedirect();
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      padded={false}
      edges={['top']}
      background={colors.surface}
      footerStyle={styles.footer}
      footer={
        <JobBottomDrawer padding={spacing.x3l} style={styles.drawer}>
          <ScrollView style={styles.drawerScroll} contentContainerStyle={styles.drawerContent} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.address}>
              <LabelValue label="Drop address" value={address} gap={spacing.xs} />
              {showAddress && job.drop.landmark ? (
                <AppText variant="bodySm" color="textSecondary">
                  Landmark: {job.drop.landmark}
                </AppText>
              ) : null}
              {job.drop.instructions ? (
                <View style={styles.instructions}>
                  <Icon name="info" size={16} color="textSecondary" />
                  <AppText variant="bodySm" color="textSecondary" style={styles.instructionsText}>
                    {job.drop.instructions}
                  </AppText>
                </View>
              ) : null}
              <Divider />
              <View style={styles.contactRow}>
                <View style={styles.contact}>
                  <AppText style={figmaText.label11} color="textSecondary" uppercase>
                    Customer contact
                  </AppText>
                  <AppText variant="title">{job.drop.customerFirstName}</AppText>
                  {!callable ? (
                    <AppText variant="bodySm" color="textMuted">
                      Number available during the job only
                    </AppText>
                  ) : null}
                </View>
                <SecondaryButton label="CALL CUSTOMER" onPress={() => void call()} loading={calling} disabled={!callable} fullWidth={false} style={styles.callButton} />
              </View>
            </View>
            <Divider />
            <DeliveryStepper phase="arrived" />
            <PrimaryButton label="START DELIVERY VERIFICATION" onPress={() => void startVerification()} loading={busy} />
            <GhostButton label="Report an issue" icon="alert-triangle" iconPosition="left" onPress={() => router.push(`/job/${job.id}/issue` as never)} />
          </ScrollView>
        </JobBottomDrawer>
      }>
      <View style={styles.mapWrap} onLayout={(e) => setMapHeight(Math.round(e.nativeEvent.layout.height))}>
        {mapHeight > 0 ? (
          <RiderMap rider={position ? { lat: position.lat, lng: position.lng } : null} pickup={job.pickup} drop={job.drop} focus="drop" height={mapHeight} style={StyleSheet.absoluteFill} interactive={false} />
        ) : null}
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.arrivalAlert} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Icon name="check" size={18} strokeWidth={3} />
            <AppText variant="titleLg">YOU HAVE ARRIVED</AppText>
          </View>
          <View style={styles.sosRow}>
            <SOSButton jobId={job.id} compact />
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapWrap: { flex: 1, minHeight: 200, backgroundColor: '#EBF2F0', overflow: 'hidden' },
  overlay: { position: 'absolute', top: spacing.lg, left: spacing.xxl, right: spacing.xxl, gap: spacing.lg },
  arrivalAlert: {
    backgroundColor: colors.lime,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 23,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  sosRow: { alignItems: 'flex-end' },
  footer: { ...drawerFooterStyle, flexShrink: 1, minHeight: 0 },
  drawer: { flexShrink: 1, minHeight: 0 },
  drawerScroll: { flexGrow: 0, flexShrink: 1 },
  drawerContent: { gap: spacing.xxl },
  address: { gap: spacing.lg },
  instructions: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  instructionsText: { flex: 1 },
  contactRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  contact: { gap: 2, flexShrink: 1 },
  callButton: { width: 140, paddingHorizontal: spacing.md },
});
