import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText } from '@/components/ui';
import { formatINR } from '@/utils/format';
import { figmaText } from './text';

export interface JobHeaderCardProps {
  label: string;
  orderRef: string;
  payout: number;
  /** 35.5 on the exception / handoff screens (Figma floating-job-header). */
  radius?: number;
}

/**
 * Figma floating-job-header exactly as drawn on package-mismatch, package-incomplete and
 * navigation-handoff: white, 2px #DBE0D6, padding 16; "CURRENT JOB" ExtraBold 11 over
 * "Order #…" ExtraBold 16; payout pill #E8F8D5 with a 2px border, radius 15.5, padding 10×6.
 */
export const JobHeaderCard = ({ label, orderRef, payout, radius = 35.5 }: JobHeaderCardProps) => (
  <View style={[styles.card, { borderRadius: radius }]}>
    <View style={styles.text}>
      <AppText style={figmaText.label11} color="textSecondary" uppercase>
        {label}
      </AppText>
      <AppText variant="titleLg" numberOfLines={1}>
        Order {orderRef}
      </AppText>
    </View>
    <View style={styles.payout}>
      <AppText variant="title">{formatINR(payout)}</AppText>
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    alignSelf: 'stretch',
  },
  text: { gap: 2, flexShrink: 1 },
  payout: { backgroundColor: colors.surfaceLime, borderWidth: 2, borderColor: colors.border, borderRadius: 15.5, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
});
