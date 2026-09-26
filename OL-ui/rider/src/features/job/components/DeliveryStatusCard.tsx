import { StyleSheet, View } from 'react-native';

import { AppText, Divider, IconButton } from '@/components/ui';
import { colors, spacing } from '@/theme';
import type { Job } from '@/types';
import { canCallCustomer } from '@/domain/privacy';
import { figmaText } from '@/features/delivery/components';
import { formatKm1 } from '../distance';
import { useLiveDistanceKm } from '../useLiveDistance';

export interface DeliveryStatusCardProps {
  job: Job;
  onCall: () => void;
  calling?: boolean;
}

const etaLabel = (min: number): string => {
  const n = Math.max(1, Math.round(min));
  return `ETA: ${n} ${n === 1 ? 'min' : 'mins'} remaining`;
};

/** Floating "CUSTOMER / Amit Sharma / call / ETA · km left" card over the active-delivery map. */
export const DeliveryStatusCard = ({ job, onCall, calling }: DeliveryStatusCardProps) => {
  const liveKm = useLiveDistanceKm(job.drop);
  const kmLeft = liveKm ?? job.distanceKm;
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.customer}>
          <AppText style={figmaText.label11} color="textSecondary" uppercase>
            Customer
          </AppText>
          <AppText variant="titleLg" numberOfLines={1}>
            {job.drop.customerFirstName}
          </AppText>
        </View>
        {canCallCustomer(job.state) ? (
          <IconButton icon="phone" accessibilityLabel="Call customer" background={colors.surfaceLime} iconSize={20} onPress={onCall} disabled={calling} style={calling ? styles.dim : undefined} />
        ) : null}
      </View>
      <Divider />
      <View style={styles.metrics}>
        <AppText variant="titleSm">{etaLabel(job.eta.toDropMin)}</AppText>
        <AppText variant="titleSm">{formatKm1(kmLeft)} left</AppText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 32, padding: spacing.xxl, gap: spacing.lg, alignSelf: 'stretch' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  customer: { gap: 2, flexShrink: 1 },
  dim: { opacity: 0.5 },
  metrics: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
});
