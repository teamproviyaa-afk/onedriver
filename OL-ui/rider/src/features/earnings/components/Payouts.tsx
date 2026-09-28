import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Card, Icon, StatusChip, type ChipTone } from '@/components/ui';
import { describePayoutStatus, isTerminalPayout } from '@/domain/payouts';
import { colors, spacing } from '@/theme';
import type { PayoutTransfer } from '@/types';
import { formatClock, formatDateShort, formatINR } from '@/utils/format';

const CHIP_TONE: Record<ReturnType<typeof describePayoutStatus>['tone'], ChipTone> = { progress: 'warning', success: 'success', danger: 'danger' };

const payoutTitle = (p: PayoutTransfer) => (p.kind === 'weekly' ? `Weekly payout${p.periodLabel ? ` · ${p.periodLabel}` : ''}` : 'Instant withdrawal');

/** One line of payout history: what, when, how much and the bank's answer. */
export const PayoutRow = ({ payout }: { payout: PayoutTransfer }) => {
  const status = describePayoutStatus(payout);
  const returned = payout.status === 'failed' || payout.status === 'reversed';
  return (
    <View style={styles.row} accessibilityLabel={`${payoutTitle(payout)}, ${formatINR(payout.amount, { decimals: 2 })}, ${status.label}`}>
      <View style={styles.rowIcon}>
        <Icon name={payout.kind === 'weekly' ? 'calendar' : 'zap'} size={18} />
      </View>
      <View style={styles.rowText}>
        <AppText variant="bodyBold" numberOfLines={1}>
          {payoutTitle(payout)}
        </AppText>
        <AppText variant="bodySm" color="textSecondary" numberOfLines={1}>
          {`${formatDateShort(payout.createdAt)} · ${formatClock(payout.createdAt)} · ${payout.destination}`}
        </AppText>
      </View>
      <View style={styles.rowValue}>
        <AppText variant="bodyBold" color={returned ? 'textMuted' : 'ink'} style={returned ? styles.struck : undefined}>
          {formatINR(payout.amount, { decimals: 2 })}
        </AppText>
        <StatusChip label={status.label} tone={CHIP_TONE[status.tone]} size="sm" />
      </View>
    </View>
  );
};

/** Live status of the withdrawal the rider just made (polled until the bank answers). */
export const PayoutStatusCard = ({ payout }: { payout: PayoutTransfer }) => {
  const status = describePayoutStatus(payout);
  const done = isTerminalPayout(payout.status);
  const bg = status.tone === 'success' ? colors.surfaceLime : status.tone === 'danger' ? colors.surfaceDanger : colors.surface;
  return (
    <Card radius={32} padding={spacing.xxl} borderWidth={2} borderColor={colors.border} background={bg} gap={spacing.md}>
      <View style={styles.statusHead} accessibilityLiveRegion="polite">
        {done ? (
          <Icon name={status.tone === 'success' ? 'circle-check' : 'alert-triangle'} size={22} color={status.tone === 'success' ? colors.success : colors.danger} />
        ) : (
          <ActivityIndicator color={colors.ink} />
        )}
        <AppText variant="title" style={styles.flex}>
          {status.tone === 'success' ? 'Money sent' : status.tone === 'danger' ? 'Withdrawal did not go through' : 'Withdrawal in progress'}
        </AppText>
        <StatusChip label={status.label} tone={CHIP_TONE[status.tone]} size="sm" />
      </View>
      <AppText variant="hero" style={styles.amount}>
        {formatINR(payout.net, { decimals: 2 })}
      </AppText>
      <AppText variant="bodySm" color={status.tone === 'danger' ? 'danger' : 'textSecondary'}>
        {status.body}
      </AppText>
    </Card>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: spacing.xxs },
  rowValue: { alignItems: 'flex-end', gap: spacing.xs, flexShrink: 0 },
  struck: { textDecorationLine: 'line-through' },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  amount: { fontSize: 32, lineHeight: 40 },
});
