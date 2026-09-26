import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, spacing } from '@/theme';
import { Divider, ErrorState, LoadingState, PrimaryButton, Screen, SecondaryButton, toast } from '@/components/ui';
import { JobStepper } from '@/components/app';
import { useCurrentJob, useJob, useJobActions } from '@/hooks';
import { useDeliveryStore } from '@/stores';
import { openDialer, openNavigation } from '@/navigation/openNavigation';
import type { Job, JobState } from '@/types';
import { errorMessage } from '@/features/delivery/errors';
import { DeliveryStepper, drawerFooterStyle } from '@/features/delivery/components';
import { ArrivalPromptSheet, DROP_FAR_REASONS, DeliveryStatusCard, JobBottomDrawer, JobMapHeader, LiveRiderMap, PICKUP_FAR_REASONS, PlaceRow, ReasonSheet } from '@/features/job/components';
import { dropArrivalCheck, pickupArrivalCheck } from '@/features/job/arrival';
import { currentJobSteps } from '@/features/job/steps';
import { useGuardedStep } from '@/features/job/useGuardedStep';
import { useJobRouteGuard, type RouteGuard } from '@/features/job/useJobRouteGuard';
import { useArrivalWatch } from '@/features/job/useArrivalWatch';

/** States rendered by this route: current-job (accepted, to_pickup) and active-delivery (to_drop). */
const HANDLED_STATES: readonly JobState[] = ['accepted', 'to_pickup', 'to_drop'];

interface ReasonPrompt {
  message?: string;
}

/**
 * /job/[id] — the map screen of an active job. Renders the Figma current-job drawer
 * while heading to the store and the active-delivery drawer while heading to the
 * customer; every other state is redirected to the screen that owns it.
 */
export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isLoading, error, refetch } = useJob(id);
  useCurrentJob(!!id);
  const guard = useJobRouteGuard(job, HANDLED_STATES);

  if (!job) {
    return (
      <Screen background={colors.surface}>
        {isLoading ? (
          <LoadingState label="Loading job…" />
        ) : (
          <ErrorState title="Could not load this job" body={errorMessage(error, 'Check your connection and try again.')} onRetry={() => void refetch()} />
        )}
      </Screen>
    );
  }

  if (job.state === 'to_drop') return <ActiveDeliveryView job={job} guard={guard} />;
  if (job.state === 'accepted' || job.state === 'to_pickup') return <CurrentJobView job={job} guard={guard} />;

  // Any other state: the route guard is replacing this screen — never show a blank one meanwhile.
  return (
    <Screen background={colors.surface}>
      <LoadingState label="Opening your job…" />
    </Screen>
  );
}

const goHome = () => router.replace('/home' as never);

/** Figma current-job: map, "CURRENT JOB" header, At Store → Delivery stepper, pickup/drop rows, START NAVIGATION. */
const CurrentJobView = ({ job, guard }: { job: Job; guard: RouteGuard }) => {
  const guardedStep = useGuardedStep(guard);
  const [navBusy, setNavBusy] = useState(false);
  const [arriveBusy, setArriveBusy] = useState(false);
  const [reasonPrompt, setReasonPrompt] = useState<ReasonPrompt | null>(null);

  const startNavigation = async () => {
    setNavBusy(true);
    try {
      if (job.state === 'accepted') {
        const res = await guardedStep(job, 'to_pickup');
        if (!res.ok) {
          if (res.kind === 'too_far') toast.error(res.message);
          return;
        }
      }
      const opened = await openNavigation({ lat: job.pickup.lat, lng: job.pickup.lng }, job.pickup.name);
      if (!opened) toast.error('Could not open a navigation app');
    } finally {
      setNavBusy(false);
    }
  };

  const arriveAtStore = async (reason?: string) => {
    if (!reason) {
      const check = pickupArrivalCheck(useDeliveryStore.getState().position, job.pickup);
      if (check.blocked) {
        toast.error(check.message ?? 'You cannot mark arrival from here yet.');
        return;
      }
      if (check.needsReason) {
        setReasonPrompt({ message: check.message });
        return;
      }
    }
    setArriveBusy(true);
    try {
      const res = await guardedStep(job, 'at_pickup', { reason, then: `/job/${job.id}/pickup` });
      if (!res.ok && res.kind === 'too_far') setReasonPrompt({ message: res.message });
    } finally {
      setArriveBusy(false);
    }
  };

  return (
    <Screen
      padded={false}
      edges={['top']}
      background={colors.surface}
      footerStyle={drawerFooterStyle}
      footer={
        <JobBottomDrawer>
          <JobStepper steps={currentJobSteps(job.state)} />
          <Divider />
          <View style={styles.places}>
            <PlaceRow dotColor={colors.ink} label="Pickup from" name={job.pickup.name} distanceTo={job.pickup} fallbackKm={job.pickupDistanceKm} emphasis="strong" />
            <PlaceRow dotColor={colors.lime} label="Deliver to" name={job.drop.area} fallbackKm={job.distanceKm} emphasis="regular" />
          </View>
          <View style={styles.actions}>
            <PrimaryButton label="START NAVIGATION" onPress={() => void startNavigation()} loading={navBusy} disabled={arriveBusy} />
            <SecondaryButton label="ARRIVED AT STORE" onPress={() => void arriveAtStore()} loading={arriveBusy} disabled={navBusy} />
          </View>
        </JobBottomDrawer>
      }>
      <View style={styles.mapArea}>
        <LiveRiderMap pickup={job.pickup} drop={job.drop} focus="all" style={StyleSheet.absoluteFill} />
        <JobMapHeader label="Current job" job={job} radius={32} onBack={goHome} />
      </View>
      <ReasonSheet
        visible={!!reasonPrompt}
        title="Confirm arrival at store"
        message={reasonPrompt?.message}
        options={PICKUP_FAR_REASONS}
        confirmLabel="MARK ARRIVED"
        loading={arriveBusy}
        onClose={() => setReasonPrompt(null)}
        onSubmit={(reason) => arriveAtStore(reason)}
      />
    </Screen>
  );
};

/** Figma active-delivery: map focused on the drop, "ON THE WAY" header, customer/ETA card, ARRIVED AT DESTINATION. */
const ActiveDeliveryView = ({ job, guard }: { job: Job; guard: RouteGuard }) => {
  const { callCustomer } = useJobActions();
  const guardedStep = useGuardedStep(guard);
  const [busy, setBusy] = useState(false);
  const [calling, setCalling] = useState(false);
  const [reasonPrompt, setReasonPrompt] = useState<ReasonPrompt | null>(null);
  const dwelled = useArrivalWatch(job.drop);
  const promptDismissed = useDeliveryStore((s) => s.arrivalPromptDismissed);
  const dismissArrivalPrompt = useDeliveryStore((s) => s.dismissArrivalPrompt);
  const showArrivalPrompt = dwelled && !promptDismissed && !reasonPrompt;

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

  const arrive = async (reason?: string) => {
    if (!reason) {
      const check = dropArrivalCheck(useDeliveryStore.getState().position, job.drop);
      if (check.needsReason) {
        dismissArrivalPrompt();
        setReasonPrompt({ message: check.message });
        return;
      }
    }
    setBusy(true);
    try {
      const res = await guardedStep(job, 'at_drop', { reason, then: `/job/${job.id}/arrived` });
      if (!res.ok && res.kind === 'too_far') {
        dismissArrivalPrompt();
        setReasonPrompt({ message: res.message });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      padded={false}
      edges={['top']}
      background={colors.surface}
      footerStyle={drawerFooterStyle}
      footer={
        <JobBottomDrawer>
          <DeliveryStepper phase="in_transit" />
          <Divider />
          <PrimaryButton label="ARRIVED AT DESTINATION" onPress={() => void arrive()} loading={busy} />
        </JobBottomDrawer>
      }>
      <View style={styles.mapArea}>
        <LiveRiderMap pickup={job.pickup} drop={job.drop} focus="drop" style={StyleSheet.absoluteFill} />
        <JobMapHeader label="On the way" job={job} radius={35.5} onBack={goHome} />
        <View style={styles.statusCard}>
          <DeliveryStatusCard job={job} onCall={() => void call()} calling={calling} />
        </View>
      </View>
      <ArrivalPromptSheet visible={showArrivalPrompt} loading={busy} onConfirm={() => void arrive()} onDismiss={dismissArrivalPrompt} />
      <ReasonSheet
        visible={!!reasonPrompt}
        title="Confirm arrival at destination"
        message={reasonPrompt?.message}
        options={DROP_FAR_REASONS}
        confirmLabel="MARK ARRIVED"
        loading={busy}
        onClose={() => setReasonPrompt(null)}
        onSubmit={(reason) => arrive(reason)}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  mapArea: { flex: 1, minHeight: 200, backgroundColor: '#EBF2F0', overflow: 'hidden' },
  statusCard: { position: 'absolute', left: spacing.gutter, right: spacing.gutter, bottom: spacing.lg },
  places: { gap: spacing.lg, alignSelf: 'stretch' },
  actions: { gap: spacing.lg, alignSelf: 'stretch' },
});
