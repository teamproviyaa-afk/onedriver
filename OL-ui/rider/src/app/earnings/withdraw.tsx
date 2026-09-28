import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { AppText, Card, ConfirmationSheet, Divider, ErrorState, Icon, InfoBanner, KeyValueRow, LoadingState, PrimaryButton, Screen, SectionLabel, TextField, toast } from '@/components/ui';
import { AppHeader } from '@/components/app';
import { PayoutRow, PayoutStatusCard } from '@/features/earnings/components/Payouts';
import { isTerminalPayout, maskPayoutDestination, maxWithdrawable, parseAmount, quickAmounts, withdrawalProblem } from '@/domain/payouts';
import { queryKeys, usePayout, useWallet } from '@/hooks';
import { getDataProvider } from '@/providers';
import { selectEffectiveOnline, useConnectivityStore } from '@/stores/useConnectivityStore';
import { colors, fontFamily, radius, spacing } from '@/theme';
import { ApiError, type PayoutMethod, type PayoutTransfer } from '@/types';
import { formatClock, formatDateShort, formatINR } from '@/utils/format';
import { newId } from '@/utils/ids';

const inr = (n: number) => formatINR(n, { decimals: 2 });

const methodTitle = (m: PayoutMethod) => (m.method === 'upi' ? `UPI${m.bankName ? ` · ${m.bankName}` : ''}` : (m.bankName ?? 'Bank account'));

/**
 * Withdraw earnings — instant payout of the unpaid balance to the rider's verified UPI ID or bank
 * account (Cashfree Payouts, sent by the One Local server). Every number and rule comes from
 * GET /rider/wallet; the app only validates for a friendly message. No Figma frame exists for
 * this screen: it follows the earnings / cash-in-hand visual language.
 */
export default function WithdrawScreen() {
  const qc = useQueryClient();
  const online = useConnectivityStore(selectEffectiveOnline);
  const { data: wallet, isLoading, error, refetch, isRefetching } = useWallet();

  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  // One idempotency key per attempt: a retry after a timeout reuses it, so the money is never sent twice.
  const attempt = useRef<{ key: string; amount: number } | null>(null);

  const active = usePayout(activeId);
  const activeStatus = active.data?.status;
  useEffect(() => {
    if (activeStatus && isTerminalPayout(activeStatus)) {
      void qc.invalidateQueries({ queryKey: queryKeys.wallet });
      void qc.invalidateQueries({ queryKey: queryKeys.payouts });
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
    }
  }, [activeStatus, qc]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/earnings' as never));
  const header = <AppHeader title="Withdraw earnings" onBack={goBack} onHelp={() => router.push('/support' as never)} />;

  if (isLoading && !wallet) {
    return (
      <Screen>
        {header}
        <LoadingState label="Loading your balance…" />
      </Screen>
    );
  }
  if (!wallet) {
    return (
      <Screen>
        {header}
        <ErrorState title="Couldn't load your balance" body={error instanceof Error ? error.message : 'Check your connection and try again.'} onRetry={() => void refetch()} retryLabel={isRefetching ? 'Retrying…' : 'Retry'} />
      </Screen>
    );
  }

  const amount = parseAmount(text);
  const problem = withdrawalProblem(amount, wallet);
  // Account / limit problems show immediately; amount problems once the rider has typed something.
  const amountProblem = problem && (problem.code === 'validation' || problem.code === 'insufficient_balance');
  const shownProblem = problem && (!amountProblem || (touched && text.length > 0)) ? problem.message : null;
  const canWithdraw = !problem && online && !sending;
  const method = wallet.payoutMethod;
  const chips = wallet.instant.enabled && !wallet.instant.blockedReason ? quickAmounts(wallet) : [];
  const fee = wallet.instant.fee;
  const net = Number.isFinite(amount) ? Math.max(0, amount - fee) : 0;
  const nextWeekly = new Date(wallet.weekly.nextPayoutAt);
  const manageRoute = method ? `/onboarding/payout/${method.method}?mode=manage` : '/onboarding/payout/upi?mode=manage';

  const submit = async () => {
    if (problem || !method) return;
    const key = attempt.current && attempt.current.amount === amount ? attempt.current.key : newId('wd');
    attempt.current = { key, amount };
    setSending(true);
    try {
      const payout: PayoutTransfer = await getDataProvider().requestWithdrawal(amount, key);
      attempt.current = null;
      qc.setQueryData(queryKeys.payout(payout.id), payout);
      setActiveId(payout.id);
      setText('');
      setTouched(false);
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: queryKeys.wallet });
    } catch (e) {
      const uncertain = !ApiError.is(e) || e.code === 'network' || e.code === 'unknown' || (e.status ?? 500) >= 500;
      if (uncertain) {
        // Keep the key: tapping again asks the server about the same transfer instead of creating a new one.
        toast.error("We couldn't confirm the withdrawal. Tap Withdraw again — it will not be sent twice.");
        void qc.invalidateQueries({ queryKey: queryKeys.wallet });
      } else {
        attempt.current = null;
        setConfirming(false);
        toast.error(e.detail);
        void qc.invalidateQueries({ queryKey: queryKeys.wallet });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen
      padded={false}
      keyboard
      footer={<PrimaryButton label={Number.isFinite(amount) && amount > 0 ? `WITHDRAW ${inr(amount)}` : 'WITHDRAW'} onPress={() => setConfirming(true)} disabled={!canWithdraw} />}
      footerStyle={styles.footer}>
      <View style={styles.headerPad}>{header}</View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.ink} colors={[colors.ink]} />}>
        {active.data ? <PayoutStatusCard payout={active.data} /> : null}

        <Card radius={32} padding={spacing.gutter} gap={spacing.md} style={styles.hero}>
          <AppText variant="chip" color="textSecondary" align="center">
            AVAILABLE TO WITHDRAW
          </AppText>
          <AppText variant="hero" style={styles.heroAmount} align="center" accessibilityLabel={`Available to withdraw ${inr(wallet.available)}`}>
            {inr(wallet.available)}
          </AppText>
          <AppText variant="bodyBoldSm" color="textSecondary" align="center">
            {wallet.inFlight > 0 ? `${inr(wallet.inFlight)} on its way to your account` : `Unpaid earnings ${inr(wallet.balance)}`}
          </AppText>
        </Card>

        {!online ? <InfoBanner icon="wifi-off" tone="warning" text="You're offline. Withdrawals need a connection." /> : null}
        {!wallet.instant.enabled ? <InfoBanner icon="calendar" tone="lime" bold={false} text={`Instant withdrawal is coming soon. ${wallet.weekly.description}`} /> : null}
        {wallet.instant.blockedReason ? (
          <InfoBanner
            icon="alert-triangle"
            tone="danger"
            bold={false}
            text={wallet.instant.blockedReason}
            trailing={
              /cash/i.test(wallet.instant.blockedReason) ? (
                <Pressable accessibilityRole="link" accessibilityLabel="Open cash in hand" hitSlop={8} onPress={() => router.push('/cash' as never)}>
                  <Icon name="chevron-right" size={18} color="danger" />
                </Pressable>
              ) : undefined
            }
          />
        ) : null}

        {wallet.instant.enabled ? (
          <View style={styles.section}>
            <SectionLabel>AMOUNT</SectionLabel>
            <TextField
              value={text}
              onChangeText={(t) => {
                setText(t.replace(/[^\d.]/g, ''));
                setTouched(true);
              }}
              placeholder={`${formatINR(wallet.instant.minAmount)} – ${formatINR(maxWithdrawable(wallet))}`}
              keyboardType="decimal-pad"
              inputMode="decimal"
              accessibilityLabel="Amount to withdraw in rupees"
              prefix={<AppText variant="h2">₹</AppText>}
              borderTone="strong"
              height={64}
              style={styles.amountInput}
              editable={!sending && !wallet.instant.blockedReason}
              error={shownProblem && amountProblem ? shownProblem : undefined}
            />
            {chips.length ? (
              <View style={styles.chips}>
                {chips.map((c) => {
                  const selected = amount === c.value;
                  return (
                    <Pressable
                      key={c.label}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Withdraw ${c.label === 'All' || c.label === 'Max' ? `${c.label.toLowerCase()} ${inr(c.value)}` : c.label}`}
                      onPress={() => {
                        setText(String(c.value));
                        setTouched(true);
                      }}
                      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
                      <AppText variant="bodyBoldSm">{c.label === 'All' || c.label === 'Max' ? `${c.label} · ${inr(c.value)}` : c.label}</AppText>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <AppText variant="bodySm" color="textSecondary">
              {`Min ${formatINR(wallet.instant.minAmount)} · Max ${formatINR(wallet.instant.maxAmount)} per withdrawal · ${wallet.instant.withdrawalsLeftToday} left today`}
            </AppText>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionLabel>SEND TO</SectionLabel>
          <Card radius={32} padding={spacing.xxl} gap={spacing.md} onPress={() => router.push(manageRoute as never)} accessibilityLabel={method ? `Payout account ${methodTitle(method)}. Change` : 'Add a payout account'}>
            <View style={styles.methodRow}>
              <Icon name={method?.method === 'bank' ? 'landmark' : 'credit-card'} size={24} />
              <View style={styles.flex}>
                <AppText variant="title" numberOfLines={1}>
                  {method ? methodTitle(method) : 'No payout account yet'}
                </AppText>
                <AppText variant="bodySm" color="textSecondary" numberOfLines={1}>
                  {method ? `${maskPayoutDestination(method)}${method.verifiedName ? ` · ${method.verifiedName}` : ''}` : 'Add a UPI ID or bank account in your name'}
                </AppText>
              </View>
              <AppText variant="bodyBoldSm">{method ? 'Change' : 'Add'}</AppText>
            </View>
            {method?.status === 'verified' ? (
              <View style={styles.verifiedRow}>
                <Icon name="shield-check" size={14} color="success" />
                <AppText variant="labelXs" color="textSecondary" uppercase>
                  {method.provider === 'cashfree' ? 'Name verified with the bank via Cashfree' : 'Name verified with the bank'}
                </AppText>
              </View>
            ) : null}
          </Card>
        </View>

        {wallet.instant.enabled && Number.isFinite(amount) && amount > 0 ? (
          <Card radius={32} padding={spacing.xxl} gap={spacing.md} borderWidth={1} borderColor={colors.borderSubtle}>
            <KeyValueRow label="Amount" value={inr(amount)} />
            <KeyValueRow label="Transfer fee" value={fee > 0 ? `−${inr(fee)}` : 'Free'} />
            <Divider color={colors.borderSubtle} />
            <KeyValueRow label="You receive" value={inr(net)} strong />
            <AppText variant="bodySm" color="textSecondary">
              {method?.method === 'bank' ? 'IMPS — usually arrives within minutes, any day.' : 'UPI — usually arrives within minutes, any day.'}
            </AppText>
          </Card>
        ) : null}

        {shownProblem && !amountProblem && problem?.code !== 'coming_soon' && problem?.code !== 'payout_blocked' ? <InfoBanner icon="info" tone="warning" bold={false} text={shownProblem} /> : null}

        <InfoBanner icon="calendar" tone="lime" bold={false} text={`${wallet.weekly.description} Next: ${formatDateShort(nextWeekly)}, ${formatClock(nextWeekly)}.`} />

        <View style={styles.section}>
          <SectionLabel>RECENT PAYOUTS</SectionLabel>
          <Card radius={32} padding={spacing.xxl} gap={spacing.lg}>
            {wallet.recent.length === 0 ? (
              <AppText variant="bodySm" color="textSecondary">
                Your withdrawals and weekly payouts will show up here.
              </AppText>
            ) : (
              wallet.recent.map((p, i) => (
                <View key={p.id} style={styles.historyItem}>
                  {i > 0 ? <Divider color={colors.borderSubtle} /> : null}
                  <PayoutRow payout={active.data?.id === p.id ? active.data : p} />
                </View>
              ))
            )}
          </Card>
        </View>
      </ScrollView>

      <ConfirmationSheet
        visible={confirming}
        onClose={() => (sending ? undefined : setConfirming(false))}
        icon="wallet"
        title={`Withdraw ${inr(Number.isFinite(amount) ? amount : 0)}?`}
        body={method ? `${inr(net)} will be sent to ${maskPayoutDestination(method)}${method.verifiedName ? ` (${method.verifiedName})` : ''}.` : undefined}
        confirmLabel="CONFIRM WITHDRAWAL"
        onConfirm={submit}
        loading={sending}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerPad: { paddingHorizontal: spacing.gutter },
  body: { padding: spacing.gutter, gap: spacing.x3l, paddingBottom: spacing.x3l },
  footer: { paddingBottom: spacing.md },
  hero: { alignItems: 'center' },
  heroAmount: { fontFamily: fontFamily.manropeExtraBold, fontSize: 44, lineHeight: 54 },
  section: { gap: spacing.md },
  amountInput: { fontFamily: fontFamily.manropeExtraBold, fontSize: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 40, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.lime, borderColor: colors.borderStrong },
  pressed: { opacity: 0.85 },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  historyItem: { gap: spacing.lg },
});
