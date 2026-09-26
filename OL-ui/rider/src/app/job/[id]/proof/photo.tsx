import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { spacing } from '@/theme';
import { AppText, Divider, Icon, PrimaryButton, SecondaryButton, toast } from '@/components/ui';
import { FloatingJobHeader, PhotoCapture } from '@/components/app';
import { useJobActions } from '@/hooks';
import { getDataProvider } from '@/providers';
import { useJobScreen } from '@/features/delivery/useJobScreen';
import { errorMessage } from '@/features/delivery/errors';
import { allowedProofMethods, finishProof, type ProofSubmission } from '@/features/delivery/proof';
import { DeliveryStepper, JobDrawerLayout, JobScreenFallback } from '@/features/delivery/components';

const PLACEHOLDER = require('@/assets/figma/proof-photo-preview.png') as number;

/**
 * Photo proof (Figma proof-photo): capture the package at the door, review it, then
 * upload privately and submit the proof.
 */
export default function ProofPhotoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isLoading, error, refetch, lockRedirect, unlockRedirect } = useJobScreen(id, ['handover', 'proof']);
  const { submitProof } = useJobActions();
  const captureRef = useRef<(() => Promise<void>) | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const onChange = useCallback((uri: string | null) => setPhoto(uri), []);

  // Photo proof must be one of the order's methods (it is always unlocked once the OTP is locked).
  const photoAllowed = !job || allowedProofMethods(job).includes('photo');
  useEffect(() => {
    if (job && !photoAllowed) router.replace(`/job/${job.id}/proof` as never);
  }, [job, photoAllowed]);

  if (!job) return <JobScreenFallback error={isLoading ? null : error} onRetry={refetch} />;

  const capture = async () => {
    if (!captureRef.current) return toast.error('Camera is not ready yet');
    setCapturing(true);
    try {
      await captureRef.current();
    } finally {
      setCapturing(false);
    }
  };

  const submit = async () => {
    if (!photo) return;
    setBusy(true);
    lockRedirect();
    try {
      const { assetId } = await getDataProvider().createUpload('proof_photo', 'image/jpeg', photo);
      const input: ProofSubmission = { method: 'photo', assetId, localUri: photo, cashCollected: job.cashToCollect || undefined };
      const res = await submitProof(job, input);
      finishProof(job.id, res);
    } catch (e) {
      unlockRedirect();
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <JobDrawerLayout
      drawer={
        <>
          <DeliveryStepper phase="verify" />
          <Divider />
          {photo ? (
            <View style={styles.actions}>
              <SecondaryButton label="RETRACT" fullWidth={false} style={styles.retract} onPress={() => setPhoto(null)} disabled={busy} />
              <PrimaryButton label="SUBMIT PHOTO" style={styles.submit} onPress={() => void submit()} loading={busy} />
            </View>
          ) : (
            <PrimaryButton label="CAPTURE" icon="camera" iconPosition="left" onPress={() => void capture()} loading={capturing} />
          )}
        </>
      }>
      <FloatingJobHeader label="PHOTO PROOF" orderRef={job.orderRef} payout={job.payoutEstimate} radius={35.5} />
      <AppText variant="h4">Package Photo Proof</AppText>
      <PhotoCapture value={photo} onChange={onChange} height={280} captureRef={captureRef} placeholder={PLACEHOLDER} />
      <View style={styles.hint}>
        <Icon name="info" size={18} color="textSecondary" />
        <AppText variant="bodySm" color="textSecondary" style={styles.hintText}>
          Ensure the package and house number are clearly visible.
        </AppText>
      </View>
    </JobDrawerLayout>
  );
}

const styles = StyleSheet.create({
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md },
  hintText: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  retract: { width: 110, paddingHorizontal: 0 },
  submit: { flex: 1 },
});
