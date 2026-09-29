import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';

import { AppText, Card, ConfirmationSheet, Icon, InfoBanner, PrimaryButton, SectionLabel, StatusChip, TextField, toast } from '@/components/ui';
import { DEMO_CHECKOUT_PREFIX } from '@/demo/constants';
import { upiDepositProblem } from '@/domain/cash';
import { parseAmount } from '@/domain/payouts';
import { queryKeys, useCashDeposit } from '@/hooks';
import { getDataProvider, getDemoProvider } from '@/providers';
import { selectEffectiveOnline, useConnectivityStore } from '@/stores/useConnectivityStore';
import { colors, fontFamily, radius, spacing } from '@/theme';
import { ApiError, type CashDeposit, type CashSummary } from '@/types';
import { formatINR } from '@/utils/format';
import { newId } from '@/utils/ids';

const inr = (n: number) => formatINR(n, { decimals: 2 });

/** Where the rider stands with the deposit they just started. Status always comes from the server (Cashfree), never from the return URL. */
const DepositStatusCard = ({ deposit, onReopen }: { deposit: CashDeposit; onReopen?: () => void }) => {
  if (deposit.status === 'pending') {
    return (
      <Card radius={32} padding={spacing.xxl} gap={spacing.md} borderWidth={2} borderColor={colors.border}>
        <View style={styles.statusHead} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.ink} />
          <AppText variant="title" style={styles.flex}>
            Waiting for your UPI payment
          </AppText>
          <StatusChip label="Pending" tone="warning" size="sm" />
        </View>
        <AppText variant="bodySm" color="textSecondary">
          {`Pay ${inr(deposit.amount)} on the Cashfree page. This updates on its own once the bank confirms it.`}
        </AppText>
        {onReopen ? (
          <Pressable accessibilityRole="link" accessibilityLabel="Open the payment page again" hitSlop={8} onPress={onReopen} style={styles.link}>
            <AppText variant="bodyBoldSm">Open the payment page again</AppText>
            <Icon name="external-link" size={14} />
          </Pressable>
        ) : null}
      </Card>
    );
  }
  const paid = deposit.status === 'paid';
  return (
    <Card radius={32} padding={spacing.xxl} gap={spacing.md} borderWidth={2} borderColor={colors.border} background={paid ? colors.surfaceLime : colors.surfaceMuted}>
      <View style={styles.statusHead} accessibilityLiveRegion="polite">
        <Icon name={paid ? 'circle-check' : 'info'} size={22} color={paid ? colors.success : colors.textSecondary} />
        <AppText variant="title" style={styles.flex}>
          {paid ? 'Deposit received' : 'Payment not completed'}
        </AppText>
        <StatusChip label={paid ? 'Paid' : deposit.status === 'expired' ? 'Expired' : deposit.status === 'failed' ? 'Failed' : 'Cancelled'} tone={paid ? 'success' : 'muted'} size="sm" />
      </View>
      <AppText variant="hero" style={styles.amount}>
        {inr(deposit.amount)}
      </AppText>
      <AppText variant="bodySm" color="textSecondary">
        {paid ? `${deposit.method === 'upi' || !deposit.method ? 'UPI' : deposit.method}${deposit.reference ? ` · Ref ${deposit.reference}` : ''} · Your cash in hand is updated.` : 'No money was taken. You can try again.'}
      </AppText>
    </Card>
  );
};

/**
 * Cash in hand → pay it back by UPI (Cashfree Payment Gateway). The server creates a Cashfree
 * payment link; the app opens it in the system browser and follows the deposit until Cashfree
 * confirms it. The app never sees card or bank details, and holds no Cashfree keys.
 */
export const UpiDeposit = ({ cash, returnedDepositId }: { cash: CashSummary; returnedDepositId?: string }) => {
  const qc = useQueryClient();
  const online = useConnectivityStore(selectEffectiveOnline);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  // Kept after closing so the sheet does not lose its text while it animates out.
  const [demoCheckout, setDemoCheckout] = useState<{ deposit: CashDeposit; open: boolean } | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  // One idempotency key per attempt: a retry after a timeout returns the same checkout, never a second charge.
  const attempt = useRef<{ key: string; amount: number } | null>(null);

  // Returning from the checkout (onelocalrider://cash?deposit=…) shows that deposit.
  const depositId = activeId ?? returnedDepositId;
  const active = useCashDeposit(depositId);
  const status = active.data?.status;
  useEffect(() => {
    if (!status || status === 'pending') return;
    void qc.invalidateQueries({ queryKey: queryKeys.cash });
    void qc.invalidateQueries({ queryKey: queryKeys.me });
    void qc.invalidateQueries({ queryKey: queryKeys.notifications });
  }, [status, qc]);

  if (!cash.upiDeposit?.enabled) return null;
  if (cash.cashInHand <= 0 && !active.data) return null;

  const amount = text ? parseAmount(text) : cash.cashInHand;
  const problem = upiDepositProblem(amount, cash);
  const waiting = status === 'pending';
  const canPay = !problem && online && !sending && !waiting;

  const openCheckout = async (d: CashDeposit) => {
    if (!d.checkoutUrl) return;
    if (d.checkoutUrl.startsWith(DEMO_CHECKOUT_PREFIX)) {
      setDemoCheckout({ deposit: d, open: true });
      return;
    }
    await WebBrowser.openAuthSessionAsync(d.checkoutUrl, Linking.createURL('/cash'));
    void qc.invalidateQueries({ queryKey: queryKeys.cashDeposit(d.id) });
  };

  const pay = async () => {
    if (problem) return;
    const key = attempt.current && attempt.current.amount === amount ? attempt.current.key : newId('dep');
    attempt.current = { key, amount };
    setSending(true);
    try {
      const d = await getDataProvider().createCashDeposit(amount, key);
      attempt.current = null;
      qc.setQueryData(queryKeys.cashDeposit(d.id), d);
      setActiveId(d.id);
      setText('');
      if (d.status === 'pending') await openCheckout(d);
    } catch (e) {
      const uncertain = !ApiError.is(e) || e.code === 'network' || e.code === 'unknown' || (e.status ?? 500) >= 500;
      if (uncertain) {
        toast.error("Couldn't start the payment. Tap Pay again — you will not be charged twice.");
      } else {
        attempt.current = null;
        toast.error(e.detail);
      }
    } finally {
      setSending(false);
    }
  };

  const finishDemo = async (outcome: 'paid' | 'cancelled') => {
    const demo = getDemoProvider();
    if (!demoCheckout?.open || !demo) return;
    const d = demoCheckout.deposit;
    setDemoBusy(true);
    try {
      qc.setQueryData(queryKeys.cashDeposit(d.id), await demo.completeDemoCheckout(d.id, outcome));
      if (outcome === 'paid') toast.success(`Deposit of ${inr(d.amount)} received`);
    } finally {
      setDemoBusy(false);
      setDemoCheckout({ deposit: d, open: false });
    }
  };
  const demoAmount = demoCheckout ? inr(demoCheckout.deposit.amount) : '';

  return (
    <View style={styles.section}>
      <SectionLabel>PAY BY UPI</SectionLabel>
      {active.data ? <DepositStatusCard deposit={active.data} onReopen={waiting && active.data.checkoutUrl ? () => void openCheckout(active.data!) : undefined} /> : null}
      {cash.cashInHand > 0 && !waiting ? (
        <Card radius={32} padding={spacing.xxl} gap={spacing.md}>
          <TextField
            label="Amount to deposit"
            value={text}
            onChangeText={(t) => setText(t.replace(/[^\d.]/g, ''))}
            placeholder={`${inr(cash.cashInHand)} (all cash in hand)`}
            keyboardType="decimal-pad"
            inputMode="decimal"
            accessibilityLabel="Amount to deposit in rupees"
            prefix={<AppText variant="h3">₹</AppText>}
            style={styles.amountInput}
            editable={!sending}
            error={text && problem ? problem : undefined}
          />
          {text ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Deposit all ${inr(cash.cashInHand)}`} onPress={() => setText('')} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
              <AppText variant="bodyBoldSm">{`All · ${inr(cash.cashInHand)}`}</AppText>
            </Pressable>
          ) : null}
          <PrimaryButton label={Number.isFinite(amount) && amount > 0 ? `PAY ${inr(amount)} BY UPI` : 'PAY BY UPI'} icon="indian-rupee" iconPosition="left" onPress={() => void pay()} loading={sending} disabled={!canPay} />
          <View style={styles.secure}>
            <Icon name="lock" size={14} color="textSecondary" />
            <AppText variant="bodySm" color="textSecondary" style={styles.flex}>
              Secure payment by Cashfree with any UPI app. Your cash in hand updates as soon as the payment is confirmed.
            </AppText>
          </View>
        </Card>
      ) : null}
      {!online ? <InfoBanner icon="wifi-off" tone="warning" text="You're offline. UPI deposits need a connection." /> : null}

      <ConfirmationSheet
        visible={!!demoCheckout?.open}
        onClose={() => void finishDemo('cancelled')}
        icon="indian-rupee"
        title="Cashfree checkout (demo)"
        body={`In the live app this opens Cashfree's secure page to pay ${demoAmount} with PhonePe, Google Pay, Paytm or any UPI app.`}
        confirmLabel={`PAY ${demoAmount}`}
        cancelLabel="Cancel payment"
        onConfirm={() => finishDemo('paid')}
        loading={demoBusy}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: spacing.md },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  amount: { fontSize: 32, lineHeight: 40 },
  amountInput: { fontFamily: fontFamily.manropeExtraBold, fontSize: 20 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 40, justifyContent: 'center' },
  pressed: { opacity: 0.85 },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 32 },
  secure: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
});
