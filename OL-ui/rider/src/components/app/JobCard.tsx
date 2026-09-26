import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fontFamily, spacing } from '@/theme';
import { AppText, Dot } from '@/components/ui';
import { STATE_LABELS } from '@/state-machine/deliveryStateMachine';
import { formatClock, formatINR } from '@/utils/format';
import type { JobHistoryItem, RiderFlowState } from '@/types';

export interface JobCardProps {
  item: JobHistoryItem;
  onPress?: (item: JobHistoryItem) => void;
}

const STATUS: Record<string, { label: string; dot: string; text: string }> = {
  delivered: { label: 'DELIVERED', dot: colors.lime, text: colors.textSecondary },
  failed: { label: 'FAILED', dot: colors.danger, text: colors.danger },
  returned: { label: 'RETURNED', dot: colors.warning, text: colors.warning },
  cancelled: { label: 'CANCELLED', dot: colors.textMuted, text: colors.textMuted },
};

const statusFor = (item: JobHistoryItem) =>
  STATUS[item.state] ?? { label: STATE_LABELS[item.state as RiderFlowState]?.title ?? 'IN PROGRESS', dot: colors.ink, text: colors.ink };

/**
 * Figma job-history "job-row": white pill card (radius 32.5, 1px #E5E5E0, padding 14) —
 * status dot · pickup name · "Order #… • 04:12 PM" · earnings + DELIVERED / FAILED.
 */
export const JobCard = ({ item, onPress }: JobCardProps) => {
  const status = statusFor(item);
  const when = item.deliveredAt ?? item.createdAt;
  const orderRef = item.orderRef.startsWith('#') ? item.orderRef : `#${item.orderRef}`;
  const amount = formatINR(item.earnings, { decimals: 2 });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.pickupName}, order ${orderRef}, ${formatClock(when)}, ${status.label}, ${amount}`}
      onPress={onPress ? () => onPress(item) : undefined}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.left}>
        <Dot color={status.dot} size={10} />
        <View style={styles.texts}>
          <AppText variant="title" numberOfLines={1}>
            {item.pickupName}
          </AppText>
          <AppText color="textSecondary" style={styles.sub} numberOfLines={1}>
            Order {orderRef} • {formatClock(when)}
          </AppText>
        </View>
      </View>
      <View style={styles.right}>
        <AppText style={styles.amount}>{amount}</AppText>
        <AppText color={status.text} style={styles.status}>
          {status.label}
        </AppText>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 32.5,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    minHeight: 48,
    alignSelf: 'stretch',
  },
  pressed: { opacity: 0.9 },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minWidth: 0 },
  texts: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  sub: { fontFamily: fontFamily.manropeMedium, fontSize: 12, lineHeight: 16 },
  right: { alignItems: 'flex-end', gap: spacing.xxs },
  amount: { fontFamily: fontFamily.manropeExtraBold, fontSize: 15, lineHeight: 20 },
  status: { fontFamily: fontFamily.manropeBold, fontSize: 10, lineHeight: 14 },
});
