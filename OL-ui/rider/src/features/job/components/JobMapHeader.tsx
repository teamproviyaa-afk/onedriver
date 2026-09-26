import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui';
import { FloatingJobHeader, SOSButton } from '@/components/app';
import { spacing } from '@/theme';
import type { Job } from '@/types';

export interface JobMapHeaderProps {
  label: string;
  job: Pick<Job, 'id' | 'orderRef' | 'payoutEstimate'>;
  /** 32 on current-job, 35.5 on active-delivery (Figma). */
  radius?: number;
  onBack: () => void;
}

/** Floating "CURRENT JOB / Order #… / ₹…" pill over the map with the back + SOS row beneath it. */
export const JobMapHeader = ({ label, job, radius = 32, onBack }: JobMapHeaderProps) => (
  <View style={styles.overlay}>
    <FloatingJobHeader label={label} orderRef={job.orderRef} payout={job.payoutEstimate} radius={radius} />
    <View style={styles.row}>
      <IconButton icon="arrow-left" accessibilityLabel="Back to home" onPress={onBack} bordered />
      <SOSButton jobId={job.id} compact />
    </View>
  </View>
);

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: spacing.lg, left: spacing.xxl, right: spacing.xxl, gap: spacing.lg, pointerEvents: 'box-none' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', pointerEvents: 'box-none' },
});
