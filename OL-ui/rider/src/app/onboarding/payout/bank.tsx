import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { PrimaryButton, toast } from '@/components/ui';
import { PillField } from '@/features/onboarding-setup/PillField';
import { PayoutProblem, PayoutShell, TrustBadge, VerifiedBadge, nameMatchNote } from '@/features/onboarding-setup/PayoutShell';
import { stepPosition } from '@/features/onboarding-setup/StepHeader';
import { zodResolver } from '@/features/onboarding-setup/zodResolver';
import { queryKeys } from '@/hooks';
import { getDataProvider } from '@/providers';
import { useOnboardingStore, useRiderStore } from '@/stores';
import { spacing } from '@/theme';
import { ApiError, type PayoutNameMatch } from '@/types';

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const schema = z.object({
  holder: z.string().trim().min(3, 'Enter the account holder name as printed by the bank').max(80, 'Name is too long'),
  accountNo: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Account number must contain digits only')
    .min(9, 'Account number must be 9 to 18 digits')
    .max(18, 'Account number must be 9 to 18 digits'),
  ifsc: z.string().trim().toUpperCase().regex(IFSC_RE, 'Enter a valid 11-character IFSC code (e.g. HDFC0000124)'),
});
type BankForm = z.infer<typeof schema>;

/**
 * Onboarding — payout-bank (solo 3/4): bank account details, validated then verified via the provider
 * (Cashfree bank account verification with name match). `?mode=manage` changes the account later.
 */
export default function PayoutBankScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const manage = mode === 'manage';
  const qc = useQueryClient();
  const riderType = useOnboardingStore((s) => s.riderType);
  const fullName = useOnboardingStore((s) => s.fullName);
  const draftPayout = useOnboardingStore((s) => s.payout);
  const patch = useOnboardingStore((s) => s.patch);
  const complete = useOnboardingStore((s) => s.complete);
  const riderName = useRiderStore((s) => s.me?.rider.fullName ?? '');
  const { step, total } = stepPosition(riderType, 'payout');

  const [verifiedName, setVerifiedName] = useState<string | null>(!manage && draftPayout?.method === 'bank' && draftPayout.verifiedName ? draftPayout.verifiedName : null);
  const [match, setMatch] = useState<PayoutNameMatch | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { control, handleSubmit, formState } = useForm<BankForm>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      holder: !manage && draftPayout?.method === 'bank' && draftPayout.holder ? draftPayout.holder : fullName || riderName,
      accountNo: '',
      ifsc: !manage && draftPayout?.method === 'bank' && draftPayout.ifsc ? draftPayout.ifsc : '',
    },
  });

  const validate = handleSubmit(async (values) => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await getDataProvider().setPayout({ method: 'bank', holder: values.holder, accountNo: values.accountNo, ifsc: values.ifsc });
      const name = res.verifiedName ?? values.holder.toUpperCase();
      setVerifiedName(name);
      setMatch(res.nameMatch);
      void qc.invalidateQueries({ queryKey: queryKeys.wallet });
      patch({ payout: { method: 'bank', verifiedName: name, holder: values.holder, accountLast4: values.accountNo.slice(-4), ifsc: values.ifsc } });
      toast.success('Bank account verified');
    } catch (e) {
      if (ApiError.is(e, 'name_mismatch') || ApiError.is(e, 'account_invalid')) setProblem(e.detail);
      else toast.error(ApiError.is(e) ? e.detail : 'Could not verify these bank details. Check them and try again.');
    } finally {
      setBusy(false);
    }
  });

  const submitApplication = async () => {
    setBusy(true);
    try {
      await getDataProvider().submitApplication();
      complete('payout');
      complete('submitted');
      router.replace('/status' as never);
    } catch (e) {
      toast.error(ApiError.is(e) ? e.detail : 'Could not submit your application. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const done = () => (router.canGoBack() ? router.back() : router.replace('/earnings/withdraw' as never));
  const footer = !verifiedName ? (
    <PrimaryButton label="Validate & Continue" onPress={() => void validate()} loading={busy} disabled={formState.isSubmitting} />
  ) : manage ? (
    <PrimaryButton label="Done" onPress={done} />
  ) : (
    <PrimaryButton label="Submit application" onPress={() => void submitApplication()} loading={busy} />
  );
  const edited = () => {
    setVerifiedName(null);
    setProblem(null);
  };

  return (
    <PayoutShell
      tab="bank"
      step={step}
      total={total}
      manage={manage}
      title={manage ? 'Payout account' : 'Select your bank details?'}
      titleVariant="h1"
      subtitle={manage ? 'Withdrawals and weekly payouts go to this account. It must be in your name.' : 'Your earnings are direct-deposited weekly. Please supply valid payout information.'}
      footer={footer}>
      <View style={styles.form}>
        <Controller
          control={control}
          name="holder"
          render={({ field, fieldState }) => (
            <PillField
              label="ACCOUNT HOLDER NAME"
              value={field.value}
              onChangeText={(t) => {
                field.onChange(t);
                edited();
              }}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
            />
          )}
        />
        <Controller
          control={control}
          name="accountNo"
          render={({ field, fieldState }) => (
            <PillField
              label="BANK ACCOUNT NUMBER"
              value={field.value}
              onChangeText={(t) => {
                field.onChange(t.replace(/\D/g, ''));
                edited();
              }}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              keyboardType="number-pad"
              maxLength={18}
              returnKeyType="next"
            />
          )}
        />
        <Controller
          control={control}
          name="ifsc"
          render={({ field, fieldState }) => (
            <PillField
              label="IFSC CODE"
              value={field.value}
              onChangeText={(t) => {
                field.onChange(t.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                edited();
              }}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={11}
              returnKeyType="done"
              onSubmitEditing={() => void validate()}
            />
          )}
        />
      </View>
      {problem ? <PayoutProblem text={problem} /> : null}
      {verifiedName ? <VerifiedBadge label="Verified Linked Account" name={verifiedName} note={nameMatchNote(match)} /> : null}
      <TrustBadge text="Encrypted secure deposit line. We do not share bank details." />
    </PayoutShell>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.xl, alignSelf: 'stretch' },
});
