import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';

import { ErrorState, LoadingState, Screen, toast } from '@/components/ui';
import { useAuthActions, useMe, useStatus } from '@/hooks';
import { ApprovedVariant, DocumentsExpiredVariant, DraftVariant, ProfileDetailsSheet, RejectedVariant, SubmittedVariant, SuspendedVariant, VerificationPendingVariant } from '@/features/status';
import { nextOnboardingRoute, useOnboardingStore, useRiderStore } from '@/stores';
import { ApiError, type RiderStatus } from '@/types';

/**
 * Account status hub: polls GET /rider/status every 4 s and renders the Figma variant for the
 * current state (application-submitted · verification-pending · approved · rejected ·
 * documents-expired · account-suspended). When verification finishes the approved variant
 * appears automatically.
 */
export default function StatusScreen() {
  const status = useStatus(true, 4000);
  const me = useMe();
  const refetchMe = me.refetch;
  const { signOut, busy: signingOut } = useAuthActions();
  const lastType = useRiderStore((s) => s.lastType);
  const draftType = useOnboardingStore((s) => s.riderType);
  const setMe = useRiderStore((s) => s.setMe);
  const [goingOnline, setGoingOnline] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [manualRefresh, setManualRefresh] = useState(false);
  const prevStatus = useRef<RiderStatus | null>(null);

  const info = status.data;
  const currentStatus = info?.status;
  const riderType = me.data?.rider.type ?? lastType ?? draftType;

  // Keep /rider/me in step with the polled status so the rest of the app sees the new state.
  useEffect(() => {
    if (!currentStatus) return;
    if (prevStatus.current && prevStatus.current !== currentStatus) {
      void refetchMe();
      if (currentStatus === 'approved') toast.success("You're approved! Welcome to OneLocal.");
    }
    prevStatus.current = currentStatus;
  }, [currentStatus, refetchMe]);

  const onSignOut = async () => {
    await signOut();
    router.replace('/sign-in' as never);
  };

  // Only a tap shows the loading state; the 4 s background poll must not flicker the CTA.
  const onRefresh = async () => {
    setManualRefresh(true);
    try {
      await Promise.all([status.refetch(), refetchMe()]);
    } finally {
      setManualRefresh(false);
    }
  };

  const onGoOnline = async () => {
    setGoingOnline(true);
    try {
      const fresh = await refetchMe();
      if (fresh.data) setMe(fresh.data);
      router.replace('/home' as never);
    } catch (e) {
      toast.error(ApiError.is(e) ? e.detail : 'Could not load your profile. Try again.');
    } finally {
      setGoingOnline(false);
    }
  };

  if (!info) {
    if (status.isError) {
      return (
        <Screen>
          <ErrorState title="Could not load your status" body={ApiError.is(status.error) ? status.error.detail : 'Check your connection and try again.'} onRetry={() => void status.refetch()} />
        </Screen>
      );
    }
    return (
      <Screen>
        <LoadingState label="Checking your application…" />
      </Screen>
    );
  }

  const common = { onSignOut: () => void onSignOut(), signingOut };
  const refresh = () => void onRefresh();
  const refreshing = manualRefresh;
  const riderCode = me.data?.rider.riderCode;

  switch (info.status) {
    case 'approved':
      return <ApprovedVariant {...common} onGoOnline={() => void onGoOnline()} busy={goingOnline} />;
    case 'verification_pending':
      return <VerificationPendingVariant {...common} info={info} riderType={riderType} riderCode={riderCode} onRefresh={refresh} refreshing={refreshing} />;
    case 'rejected':
      return <RejectedVariant {...common} info={info} onReupload={() => router.push('/onboarding/kyc' as never)} />;
    case 'documents_expired':
      return <DocumentsExpiredVariant {...common} info={info} documents={me.data?.documents ?? []} onUpload={() => router.push('/onboarding/kyc' as never)} />;
    case 'suspended':
      return <SuspendedVariant {...common} info={info} onContactSupport={() => router.push('/support' as never)} />;
    case 'draft':
      return <DraftVariant {...common} onContinue={() => router.replace(nextOnboardingRoute(useOnboardingStore.getState()) as never)} />;
    case 'submitted':
    default:
      return (
        <>
          <SubmittedVariant {...common} info={info} riderType={riderType} riderCode={riderCode} onViewDetails={() => setDetailsOpen(true)} onRefresh={refresh} refreshing={refreshing} />
          <ProfileDetailsSheet visible={detailsOpen} onClose={() => setDetailsOpen(false)} me={me.data} />
        </>
      );
  }
}
