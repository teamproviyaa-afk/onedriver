import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { AppText, PrimaryButton, toast } from '@/components/ui';
import { PillField } from '@/features/onboarding-setup/PillField';
import { PayoutProblem, PayoutShell, VerifiedBadge, nameMatchNote } from '@/features/onboarding-setup/PayoutShell';
import { stepPosition } from '@/features/onboarding-setup/StepHeader';
import { zodResolver } from '@/features/onboarding-setup/zodResolver';
import { queryKeys } from '@/hooks';
import { getDataProvider } from '@/providers';
import { useOnboardingStore } from '@/stores';
import { colors, shadows, spacing } from '@/theme';
import { ApiError, type PayoutNameMatch } from '@/types';

const VPA_RE = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/;

const schema = z.object({
  vpa: z.string().trim().toLowerCase().regex(VPA_RE, 'Enter a valid UPI ID like name@bank'),
});
type UpiForm = z.infer<typeof schema>;

/**
 * Onboarding — payout-upi (solo 3/4): link a UPI ID, verify the linked name, then submit the application.
 * With `?mode=manage` (Profile / Withdraw) it changes the payout account of an existing rider instead.
 * The server verifies the UPI ID with Cashfree and rejects IDs registered to someone else.
 */
export default function PayoutUpiScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const manage = mode === 'manage';
  const qc = useQueryClient();
  const riderType = useOnboardingStore((s) => s.riderType);
  const draftPayout = useOnboardingStore((s) => s.payout);
  const patch = useOnboardingStore((s) => s.patch);
  const complete = useOnboardingStore((s) => s.complete);
  const { step, total } = stepPosition(riderType, 'payout');

  const [verified, setVerified] = useState<{ vpa: string; name: string; match?: PayoutNameMatch } | null>(
    !manage && draftPayout?.method === 'upi' && draftPayout.vpa && draftPayout.verifiedName ? { vpa: draftPayout.vpa, name: draftPayout.verifiedName } : null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit } = useForm<UpiForm>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { vpa: !manage && draftPayout?.method === 'upi' && draftPayout.vpa ? draftPayout.vpa : '' },
  });

  const verify = handleSubmit(async (values) => {
    setVerifying(true);
    setProblem(null);
    try {
      const res = await getDataProvider().setPayout({ method: 'upi', vpa: values.vpa });
      const name = res.verifiedName ?? 'VERIFIED';
      setVerified({ vpa: values.vpa, name, match: res.nameMatch });
      patch({ payout: { method: 'upi', vpa: values.vpa, verifiedName: name } });
      void qc.invalidateQueries({ queryKey: queryKeys.wallet });
      toast.success('UPI ID verified');
    } catch (e) {
      if (ApiError.is(e, 'name_mismatch') || ApiError.is(e, 'account_invalid')) setProblem(e.detail);
      else toast.error(ApiError.is(e) ? e.detail : 'Could not verify this UPI ID. Check it and try again.');
    } finally {
      setVerifying(false);
    }
  });

  const submitApplication = async () => {
    setSubmitting(true);
    try {
      await getDataProvider().submitApplication();
      complete('payout');
      complete('submitted');
      router.replace('/status' as never);
    } catch (e) {
      toast.error(ApiError.is(e) ? e.detail : 'Could not submit your application. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const typedVpa = useWatch({ control, name: 'vpa' });
  const isVerified = !!verified && verified.vpa === typedVpa.trim().toLowerCase();

  const done = () => (router.canGoBack() ? router.back() : router.replace('/earnings/withdraw' as never));
  const footer = !isVerified ? (
    <PrimaryButton label="Validate & Continue" onPress={() => void verify()} loading={verifying} />
  ) : manage ? (
    <PrimaryButton label="Done" onPress={done} />
  ) : (
    <PrimaryButton label="Submit application" onPress={() => void submitApplication()} loading={submitting} />
  );

  return (
    <PayoutShell
      tab="upi"
      step={step}
      total={total}
      manage={manage}
      title={manage ? 'Payout account' : 'How should we pay you?'}
      subtitle={manage ? 'Withdrawals and weekly payouts go to this UPI ID. It must be registered in your name.' : 'Instantly connect your UPI ID to receive real-time digital payouts.'}
      footer={footer}>
      <View style={styles.form}>
        <Controller
          control={control}
          name="vpa"
          render={({ field, fieldState }) => (
            <PillField
              label="ENTER UPI ID (VPA)"
              value={field.value}
              onChangeText={(t) => {
                field.onChange(t.replace(/\s/g, ''));
                if (verified) setVerified(null);
                if (problem) setProblem(null);
              }}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              placeholder="name@bank"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="done"
              onSubmitEditing={() => void verify()}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Verify UPI ID"
                  accessibilityState={{ busy: verifying, disabled: verifying }}
                  disabled={verifying}
                  onPress={() => void verify()}
                  style={({ pressed }) => [styles.verifyBtn, (pressed || verifying) && styles.verifyPressed]}>
                  {verifying ? <ActivityIndicator color={colors.limeBright} /> : (
                    <AppText variant="buttonPrimary" color="limeBright">
                      Verify
                    </AppText>
                  )}
                </Pressable>
              }
            />
          )}
        />
      </View>
      {problem ? <PayoutProblem text={problem} /> : null}
      {isVerified && verified ? <VerifiedBadge label="Verified Linked Account" name={verified.name} note={nameMatchNote(verified.match)} /> : null}
    </PayoutShell>
  );
}

const styles = StyleSheet.create({
  form: { alignSelf: 'stretch' },
  verifyBtn: { height: 52, paddingHorizontal: spacing.base, minWidth: 64, borderRadius: 100, backgroundColor: colors.darkAction, alignItems: 'center', justifyContent: 'center', ...shadows.soft },
  verifyPressed: { opacity: 0.85 },
});
