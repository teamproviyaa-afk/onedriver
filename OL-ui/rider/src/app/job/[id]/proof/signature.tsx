import { useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { AppText, Divider, PrimaryButton, toast } from '@/components/ui';
import { FloatingJobHeader, SignaturePad } from '@/components/app';
import { useJobActions } from '@/hooks';
import { getDataProvider } from '@/providers';
import { useJobScreen } from '@/features/delivery/useJobScreen';
import { errorMessage } from '@/features/delivery/errors';
import { finishProof, type ProofSubmission } from '@/features/delivery/proof';
import { DeliveryStepper, JobDrawerLayout, JobScreenFallback } from '@/features/delivery/components';

/**
 * Signature proof (Figma proof-signature): the customer signs on screen; the drawing is
 * exported to private storage, uploaded and submitted as proof.
 */
export default function ProofSignatureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isLoading, error, refetch, lockRedirect, unlockRedirect } = useJobScreen(id, ['handover', 'proof']);
  const { submitProof } = useJobActions();
  const exportRef = useRef<(() => Promise<string | null>) | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!job) return <JobScreenFallback error={isLoading ? null : error} onRetry={refetch} />;

  const submit = async () => {
    if (!hasStrokes) return;
    setBusy(true);
    lockRedirect();
    try {
      const uri = await exportRef.current?.();
      if (!uri) {
        unlockRedirect();
        toast.error('Could not save the signature — please sign again');
        return;
      }
      const { assetId } = await getDataProvider().createUpload('signature', 'image/png', uri);
      const input: ProofSubmission = { method: 'signature', assetId, localUri: uri, cashCollected: job.cashToCollect || undefined };
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
          <PrimaryButton label="SUBMIT SIGNATURE" onPress={() => void submit()} disabled={!hasStrokes} loading={busy} />
        </>
      }>
      <FloatingJobHeader label="SIGNATURE PROOF" orderRef={job.orderRef} payout={job.payoutEstimate} radius={35.5} />
      <AppText variant="h4">Customer Signature</AppText>
      <SignaturePad height={240} onChange={setHasStrokes} exportRef={exportRef} />
      <AppText variant="bodySm" color="textSecondary" style={styles.hint}>
        Hand the phone to {job.drop.customerFirstName} to sign. The signature is stored privately with this delivery.
      </AppText>
    </JobDrawerLayout>
  );
}

const styles = StyleSheet.create({
  hint: { paddingHorizontal: 8 },
});
