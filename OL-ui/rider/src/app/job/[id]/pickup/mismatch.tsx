import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { spacing } from '@/theme';
import { Card, Divider, GhostButton, SecondaryButton, toast } from '@/components/ui';
import { useJobActions } from '@/hooks';
import { useJobScreen } from '@/features/delivery/useJobScreen';
import { errorMessage } from '@/features/delivery/errors';
import { contactMerchant } from '@/features/delivery/merchant';
import { DeliveryStepper, ExceptionBanner, JobDrawerLayout, JobHeaderCard, JobScreenFallback, LabelValue, ReportNoteSheet, TintedButton } from '@/features/delivery/components';

/** Figma package-mismatch accent (#F44). */
const RED = '#FF4444';

/**
 * Package Mismatch (Figma package-mismatch): the scanned barcode differs from the
 * merchant's expected SKU. The rider can report it, call the merchant or scan again.
 */
export default function PackageMismatchScreen() {
  const { id, expected, scanned } = useLocalSearchParams<{ id: string; expected?: string; scanned?: string }>();
  const { job, isLoading, error, refetch } = useJobScreen(id, ['at_pickup', 'pickup_verified']);
  const { raiseException } = useJobActions();
  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  if (!job) return <JobScreenFallback error={isLoading ? null : error} onRetry={refetch} />;

  const expectedSku = expected?.trim() || job.pickupCodeHint || '—';
  const scannedSku = scanned?.trim() || '—';

  const report = async (note: string | undefined) => {
    setReporting(true);
    try {
      // The engine accepts `mismatch` both while checking at the store and after verification.
      const detail = `Package mismatch — expected ${expectedSku}, scanned ${scannedSku}`;
      const res = await raiseException(job, 'mismatch', { note: note ? `${detail}. ${note}` : detail });
      setReportOpen(false);
      setReported(true);
      if ('queued' in res) toast.show('Saved offline — will sync');
      else toast.success(res.message ?? 'Wrong barcode reported to operations');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setReporting(false);
    }
  };

  return (
    <JobDrawerLayout
      drawer={
        <>
          <DeliveryStepper phase="at_store" />
          <Divider />
          <View style={styles.actions}>
            <TintedButton label={reported ? 'REPORTED TO OPERATIONS' : 'REPORT WRONG BARCODE'} background={RED} onPress={() => setReportOpen(true)} disabled={reported} />
            <SecondaryButton label="CONTACT MERCHANT" onPress={() => void contactMerchant()} />
            <GhostButton label="Scan again" icon="scan-line" iconPosition="left" onPress={() => router.replace(`/job/${job.id}/pickup/verify` as never)} />
          </View>
        </>
      }>
      <JobHeaderCard label="CURRENT JOB" orderRef={job.orderRef} payout={job.payoutEstimate} />
      <ExceptionBanner tone="danger" icon="alert-triangle" title="Package mismatch" body="Scanned barcode does not match merchant inventory record." />
      <Card radius={32} padding={spacing.xxl} gap={spacing.lg}>
        <LabelValue label="Expected SKU" value={expectedSku} gap={spacing.xs} />
        <Divider />
        <LabelValue label="Scanned SKU" value={scannedSku} color={RED} labelColor={RED} gap={spacing.xs} />
      </Card>

      <ReportNoteSheet
        visible={reportOpen}
        onClose={() => !reporting && setReportOpen(false)}
        title="Report wrong barcode"
        body={`Operations will check Order ${job.orderRef} with ${job.pickup.name}. Add anything that helps, like the label on the package.`}
        confirmLabel="SEND REPORT"
        onConfirm={report}
        loading={reporting}
      />
    </JobDrawerLayout>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.lg, alignSelf: 'stretch' },
});
