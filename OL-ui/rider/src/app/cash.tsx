import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { AppText, Card, Divider, EmptyState, ErrorState, GhostButton, InfoBanner, KeyValueRow, LoadingState, PrimaryButton, Screen, SectionLabel, StatusChip, toast } from '@/components/ui';
import { AppHeader } from '@/components/app';
import { UpiDeposit } from '@/features/cash/UpiDeposit';
import { isLocalDemo } from '@/config/env';
import { cashHeadroom } from '@/domain/cash';
import { queryKeys, useCash } from '@/hooks';
import { getDemoProvider } from '@/providers';
import { colors, fontFamily, radius, spacing } from '@/theme';
import type { CashLedgerEntry, CashLedgerKind } from '@/types';
import { formatClock, formatDateShort, formatINR } from '@/utils/format';

const DEMO_DEPOSIT = 2000;

const KIND_LABEL: Record<CashLedgerKind, string> = {
  collected: 'COLLECTED',
  deposited: 'DEPOSITED',
  adjustment: 'ADJUSTMENT',
};

/** Signed amount as it changes the cash in hand: COD adds, a deposit removes, an adjustment keeps its sign. */
const signedAmount = (entry: CashLedgerEntry): { text: string; color: string } => {
  if (entry.kind === 'collected') return { text: `+${formatINR(entry.amount)}`, color: colors.ink };
  if (entry.kind === 'deposited') return { text: `−${formatINR(entry.amount)}`, color: colors.success };
  return { text: entry.amount >= 0 ? `+${formatINR(entry.amount)}` : formatINR(entry.amount), color: entry.amount >= 0 ? colors.ink : colors.success };
};

const LedgerRow = ({ entry }: { entry: CashLedgerEntry }) => {
  const amount = signedAmount(entry);
  const label = entry.note ? `${KIND_LABEL[entry.kind]} · ${entry.note}` : KIND_LABEL[entry.kind];
  return (
    <KeyValueRow
      label={label}
      value={
        <View style={styles.ledgerValue}>
          <AppText variant="bodyBold" color={amount.color}>
            {amount.text}
          </AppText>
          <AppText variant="bodySm" color="textSecondary">
            {`${formatDateShort(entry.createdAt)} · ${formatClock(entry.createdAt)}`}
          </AppText>
        </View>
      }
    />
  );
};

/**
 * Cash in hand (spec §4.3): COD collected minus deposits against the city limit. Above the
 * limit the rider is blocked from going online until a deposit is recorded — at the store
 * counter or by UPI (Cashfree Payment Gateway). Same visual language as the earnings / profile
 * cards (no dedicated Figma frame).
 */
export default function CashScreen() {
  const qc = useQueryClient();
  const { deposit } = useLocalSearchParams<{ deposit?: string }>();
  const { data, isLoading, error, refetch, isRefetching } = useCash();
  const [depositing, setDepositing] = useState(false);

  const ledger = useMemo(() => (data ? [...data.ledger].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []), [data]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/home' as never));
  const goHome = () => router.replace('/home' as never);

  const recordDemoDeposit = async () => {
    const demo = getDemoProvider();
    if (!demo || depositing) return;
    setDepositing(true);
    try {
      await demo.recordDeposit(DEMO_DEPOSIT);
      await Promise.all([qc.invalidateQueries({ queryKey: queryKeys.cash }), qc.invalidateQueries({ queryKey: queryKeys.me })]);
      toast.success(`Deposit of ${formatINR(DEMO_DEPOSIT)} recorded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record the deposit');
    } finally {
      setDepositing(false);
    }
  };

  const footer = (
    <View style={styles.footer}>
      {isLocalDemo && data ? <PrimaryButton label={`Record demo deposit (${formatINR(DEMO_DEPOSIT)})`} icon="landmark" iconPosition="left" onPress={() => void recordDemoDeposit()} loading={depositing} /> : null}
      <GhostButton label="Back to home" onPress={goHome} />
    </View>
  );

  if (isLoading && !data) {
    return (
      <Screen footer={footer}>
        <AppHeader title="Cash in hand" onBack={goBack} />
        <LoadingState label="Loading cash in hand…" />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen footer={footer}>
        <AppHeader title="Cash in hand" onBack={goBack} />
        <ErrorState title="Could not load cash in hand" body={error instanceof Error ? error.message : 'Check your connection and try again.'} onRetry={() => void refetch()} retryLabel={isRefetching ? 'Retrying…' : 'Retry'} />
      </Screen>
    );
  }

  const ratio = data.cashLimit > 0 ? Math.max(0, Math.min(1, data.cashInHand / data.cashLimit)) : data.cashInHand > 0 ? 1 : 0;
  const over = Math.max(0, data.cashInHand - data.cashLimit);
  const headroom = cashHeadroom(data.cashInHand, data.cashLimit);
  const statusCopy = data.blocked
    ? `You are ${formatINR(over)} over the limit. Deposit cash to go online again.`
    : `${formatINR(headroom)} left before the limit. Deposit regularly to keep accepting cash orders.`;

  return (
    <Screen scroll footer={footer}>
      <AppHeader title="Cash in hand" onBack={goBack} onHelp={() => router.push('/support' as never)} />
      <View style={styles.body}>
        <Card radius={32} padding={spacing.gutter} gap={spacing.md} style={styles.hero}>
          <AppText variant="chip" color="textSecondary" align="center">
            CASH IN HAND
          </AppText>
          <AppText variant="hero" style={styles.heroAmount} align="center" accessibilityLabel={`Cash in hand ${formatINR(data.cashInHand)}`}>
            {formatINR(data.cashInHand)}
          </AppText>
          <View style={styles.limitRow}>
            <AppText variant="bodyBoldSm" color="textSecondary">
              {`Limit ${formatINR(data.cashLimit)}`}
            </AppText>
            <StatusChip label={data.blocked ? 'BLOCKED' : 'OK'} tone={data.blocked ? 'danger' : 'success'} size="sm" bordered />
          </View>
          <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel={`${Math.round(ratio * 100)} percent of the cash limit`}>
            <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: data.blocked ? colors.danger : colors.lime }]} />
          </View>
          <AppText variant="bodySm" color={data.blocked ? 'danger' : 'textSecondary'} align="center">
            {statusCopy}
          </AppText>
        </Card>

        <UpiDeposit cash={data} returnedDepositId={typeof deposit === 'string' ? deposit : undefined} />

        <View style={styles.section}>
          <SectionLabel>HOW TO DEPOSIT</SectionLabel>
          <InfoBanner icon="landmark" text={data.depositInstructions} bold={false} tone={data.blocked ? 'danger' : 'lime'} />
        </View>

        <View style={styles.section}>
          <SectionLabel>CASH LEDGER</SectionLabel>
          {ledger.length === 0 ? (
            <Card radius={32} padding={spacing.x3l}>
              <EmptyState icon="wallet" title="No cash activity yet" body="Cash collected on deliveries and your deposits will show up here." style={styles.empty} />
            </Card>
          ) : (
            <Card radius={32} padding={spacing.x3l} gap={spacing.lg}>
              {ledger.map((entry, i) => (
                <View key={entry.id} style={styles.ledgerItem}>
                  {i > 0 ? <Divider color={colors.borderSubtle} /> : null}
                  <LedgerRow entry={entry} />
                </View>
              ))}
            </Card>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.x3l, paddingTop: spacing.x3l, paddingBottom: spacing.md },
  footer: { gap: spacing.md },
  hero: { alignItems: 'center' },
  heroAmount: { fontFamily: fontFamily.manropeExtraBold, fontSize: 44, lineHeight: 54 },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  track: { alignSelf: 'stretch', height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill },
  section: { gap: spacing.md },
  empty: { flex: 0, padding: 0, paddingVertical: spacing.md },
  ledgerItem: { gap: spacing.lg },
  ledgerValue: { alignItems: 'flex-end', gap: spacing.xxs, flexShrink: 0 },
});
