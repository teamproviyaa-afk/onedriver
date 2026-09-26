import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText } from '@/components/ui';
import { formatINR } from '@/utils/format';

export interface FloatingJobHeaderProps {
  label: string;
  orderRef: string;
  payout: number;
  radius?: number;
}

/** "CURRENT JOB / Order #9824 / ₹185" pill card floating above the map (current-job, proof screens). */
export const FloatingJobHeader = ({ label, orderRef, payout, radius = 32 }: FloatingJobHeaderProps) => (
  <View style={[styles.card, { borderRadius: radius }]}>
    <View style={styles.text}>
      <AppText variant="label" color="textSecondary" uppercase>
        {label}
      </AppText>
      <AppText variant="titleLg">Order {orderRef}</AppText>
    </View>
    <View style={styles.payout}>
      <AppText variant="title">{formatINR(payout)}</AppText>
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  text: { gap: 2 },
  payout: { backgroundColor: colors.surfaceLime, borderWidth: 1, borderColor: colors.border, borderRadius: 13.5, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
});
