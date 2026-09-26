import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { spacing } from '@/theme';
import { AppText, Card, Divider, PrimaryButton, toast } from '@/components/ui';
import { FloatingJobHeader, SOSButton } from '@/components/app';
import { useJobActions } from '@/hooks';
import { canSeeDropAddress } from '@/domain/privacy';
import { openNavigation } from '@/navigation/openNavigation';
import { formatKm } from '@/utils/format';
import { useJobScreen } from '@/features/delivery/useJobScreen';
import { errorMessage } from '@/features/delivery/errors';
import { DeliveryStepper, ExceptionBanner, JobDrawerLayout, JobScreenFallback, LabelValue } from '@/features/delivery/components';

const MAP_BACKGROUND = require('@/assets/figma/map-background.png');
const ELLIPSE_BLOB = require('@/assets/figma/nav-ellipse-blob.png');

/**
 * Navigation handoff (Figma navigation-handoff): package is on board, the full drop
 * address is now visible, and START NAVIGATION moves the job to `to_drop` before
 * opening turn-by-turn navigation on coordinates.
 */
export default function NavigationHandoffScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isLoading, error, refetch, lockRedirect, unlockRedirect } = useJobScreen(id, ['picked_up']);
  const { step } = useJobActions();
  const [busy, setBusy] = useState(false);

  if (!job) return <JobScreenFallback error={isLoading ? null : error} onRetry={refetch} />;

  const showAddress = canSeeDropAddress(job.state);
  const destination = showAddress ? [job.drop.address, job.drop.flatFloor].filter(Boolean).join(', ') || job.drop.area : job.drop.area;

  const startNavigation = async () => {
    setBusy(true);
    lockRedirect();
    try {
      await step(job, 'to_drop');
      const opened = await openNavigation({ lat: job.drop.lat, lng: job.drop.lng }, job.drop.area);
      if (!opened) toast.error('Could not open a navigation app');
      router.replace(`/job/${job.id}` as never);
    } catch (e) {
      unlockRedirect();
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <JobDrawerLayout
      contentStyle={styles.content}
      drawer={
        <>
          <DeliveryStepper phase="in_transit" />
          <Divider />
          <PrimaryButton label="START NAVIGATION" onPress={() => void startNavigation()} loading={busy} />
        </>
      }>
      <Image source={MAP_BACKGROUND} style={styles.map} resizeMode="cover" accessibilityIgnoresInvertColors />
      <Image source={ELLIPSE_BLOB} style={styles.blob} resizeMode="stretch" />
      <View style={styles.top}>
        <FloatingJobHeader label="TRANSIT READY" orderRef={job.orderRef} payout={job.payoutEstimate} radius={35.5} />
        <View style={styles.sosRow}>
          <SOSButton jobId={job.id} />
        </View>
        <View style={styles.spacer} />
        <ExceptionBanner tone="success" icon="circle-check" title="Package picked up" body="Merchant verification passed. Proceed to destination." />
        <Card radius={32} padding={spacing.xxl} gap={spacing.md}>
          <LabelValue label="Destination address" value={destination} />
          {showAddress && job.drop.landmark ? (
            <AppText variant="bodySm" color="textSecondary">
              Landmark: {job.drop.landmark}
            </AppText>
          ) : null}
          <Divider />
          <View style={styles.metrics}>
            <LabelValue label="Estimated distance" value={formatKm(job.distanceKm)} style={styles.metric} />
            <LabelValue label="ETA" value={`${Math.round(job.eta.toDropMin)} MINS`} align="right" style={styles.metric} />
          </View>
        </Card>
      </View>
    </JobDrawerLayout>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0 },
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', opacity: 0.34 },
  blob: { position: 'absolute', left: 0, top: 0, width: 210, height: 190 },
  top: { flexGrow: 1, paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl, paddingBottom: spacing.xxl, gap: spacing.xxl },
  sosRow: { alignItems: 'flex-end' },
  spacer: { flexGrow: 1, minHeight: spacing.x5l },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.lg },
  metric: { alignSelf: 'auto', flexShrink: 1 },
});
