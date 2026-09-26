import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, Card, Divider, Dot, GhostButton, SecondaryButton, toast } from '@/components/ui';
import { FloatingJobHeader } from '@/components/app';
import { useJobActions } from '@/hooks';
import { openDialer } from '@/navigation/openNavigation';
import { canRaiseException } from '@/state-machine/deliveryStateMachine';
import type { JobItem } from '@/types';
import { useJobScreen } from '@/features/delivery/useJobScreen';
import { errorMessage } from '@/features/delivery/errors';
import { DeliveryStepper, ExceptionBanner, JobDrawerLayout, JobScreenFallback, ReportNoteSheet, TintedButton } from '@/features/delivery/components';

const MERCHANT_DEMO_NUMBER = '+91 98220 11223';
const AMBER = '#FFB300';
const RED = '#FF4444';

type MissingItem = Pick<JobItem, 'id' | 'name' | 'qty'>;

const parseMissing = (raw: string | undefined): MissingItem[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
      .map((m) => ({ id: String(m.id ?? ''), name: String(m.name ?? 'Item'), qty: Number(m.qty ?? 1) || 1 }))
      .filter((m) => m.id.length > 0);
  } catch {
    return [];
  }
};

/**
 * Package Incomplete (Figma package-incomplete): the merchant reports missing / delayed
 * items. The rider can report it, call the merchant, re-check the items or continue
 * with what is available (bypass with a reason on the verify screen).
 */
export default function PackageIncompleteScreen() {
  const { id, missing: missingParam } = useLocalSearchParams<{ id: string; missing?: string }>();
  const { job, isLoading, error, refetch } = useJobScreen(id, ['at_pickup', 'pickup_verified']);
  const { raiseException } = useJobActions();
  const missing = useMemo(() => parseMissing(missingParam), [missingParam]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  if (!job) return <JobScreenFallback error={isLoading ? null : error} onRetry={refetch} />;

  const missingIds = new Set(missing.map((m) => m.id));
  const rows: { key: string; label: string; missing: boolean }[] = job.items.length
    ? job.items.map((it) => ({ key: it.id, label: `${it.name} (${it.qty}x)`, missing: missingIds.has(it.id) }))
    : missing.map((m) => ({ key: m.id, label: `${m.name} (${m.qty}x)`, missing: true }));
  const missingCount = missing.length || rows.filter((r) => r.missing).length;

  const report = async (note: string | undefined) => {
    setReporting(true);
    try {
      const kind = canRaiseException(job.state, 'incomplete') ? 'incomplete' : 'other';
      const names = missing.map((m) => `${m.name} (${m.qty}x)`).join(', ');
      const detail = `Package incomplete — ${missingCount} item${missingCount === 1 ? '' : 's'} missing${names ? `: ${names}` : ''}`;
      const res = await raiseException(job, kind, { note: note ? `${detail}. ${note}` : detail });
      setReportOpen(false);
      setReported(true);
      if ('queued' in res) toast.show('Saved offline — will sync');
      else toast.success(res.message ?? 'Incomplete order reported to operations');
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
            <TintedButton label={reported ? 'REPORTED TO OPERATIONS' : 'REPORT INCOMPLETE'} background={AMBER} color={colors.ink} onPress={() => setReportOpen(true)} disabled={reported} />
            <SecondaryButton label="CONTACT MERCHANT" onPress={() => void openDialer(MERCHANT_DEMO_NUMBER).then((ok) => !ok && toast.error('Could not open the dialer'))} />
            <View style={styles.links}>
              <GhostButton label="Re-check items" icon="list-checks" iconPosition="left" onPress={() => router.replace(`/job/${job.id}/pickup` as never)} />
              <GhostButton label="Continue with available items" icon="arrow-right" onPress={() => router.replace(`/job/${job.id}/pickup/verify?bypass=1` as never)} />
            </View>
          </View>
        </>
      }>
      <FloatingJobHeader label="CURRENT JOB" orderRef={job.orderRef} payout={job.payoutEstimate} radius={35.5} />
      <ExceptionBanner
        tone="warning"
        icon="alert-octagon"
        title="Package incomplete"
        body={`Merchant reports ${missingCount} item${missingCount === 1 ? ' is' : 's are'} currently preparing / delayed.`}
      />
      <Card radius={32} padding={spacing.xxl} gap={spacing.lg}>
        <AppText variant="label" color="textSecondary" uppercase>
          Items checklist
        </AppText>
        {rows.length === 0 ? (
          <AppText variant="bodySm" color="textSecondary">
            No item details were shared for this order.
          </AppText>
        ) : (
          rows.map((r) => (
            <View key={r.key} style={styles.item} accessibilityLabel={`${r.label}${r.missing ? ', missing' : ', available'}`}>
              <Dot size={8} color={r.missing ? RED : colors.lime} />
              <AppText variant="title" color={r.missing ? RED : 'ink'} style={styles.itemText}>
                {r.label}
                {r.missing ? ' - MISSING' : ''}
              </AppText>
            </View>
          ))
        )}
      </Card>

      <ReportNoteSheet
        visible={reportOpen}
        onClose={() => !reporting && setReportOpen(false)}
        title="Report incomplete order"
        body={`Operations will follow up with ${job.pickup.name} about the missing item${missingCount === 1 ? '' : 's'} in Order ${job.orderRef}.`}
        confirmLabel="SEND REPORT"
        onConfirm={report}
        loading={reporting}
      />
    </JobDrawerLayout>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.lg, alignSelf: 'stretch' },
  links: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemText: { flex: 1 },
});
