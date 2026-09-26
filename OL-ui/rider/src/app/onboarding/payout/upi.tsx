import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { z } from 'zod';

import { AppText, PrimaryButton, toast } from '@/components/ui';
import { PillField } from '@/features/onboarding-setup/PillField';
import { PayoutShell, VerifiedBadge } from '@/features/onboarding-setup/PayoutShell';
import { stepPosition } from '@/features/onboarding-setup/StepHeader';
import { zodResolver } from '@/features/onboarding-setup/zodResolver';
import { getDataProvider } from '@/providers';
import { useOnboardingStore } from '@/stores';
import { colors, shadows, spacing } from '@/theme';
import { ApiError } from '@/types';

const VPA_RE = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/;

const schema = z.object({
  vpa: z.string().trim().toLowerCase().regex(VPA_RE, 'Enter a valid UPI ID like name@bank'),
});
type UpiForm = z.infer<typeof schema>;

/** Onboarding — payout-upi (solo 3/4): link a UPI ID, verify the linked name, then submit the application. */
export default function PayoutUpiScreen() {
  const riderType = useOnboardingStore((s) => s.riderType);
  const draftPayout = useOnboardingStore((s) => s.payout);
  const patch = useOnboardingStore((s) => s.patch);
  const complete = useOnboardingStore((s) => s.complete);
  const { step, total } = stepPosition(riderType, 'payout');

  const [verified, setVerified] = useState<{ vpa: string; name: string } | null>(draftPayout?.method === 'upi' && draftPayout.vpa && draftPayout.verifiedName ? { vpa: draftPayout.vpa, name: draftPayout.verifiedName } : null);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit } = useForm<UpiForm>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { vpa: draftPayout?.method === 'upi' && draftPayout.vpa ? draftPayout.vpa : '' },
  });

  const verify = handleSubmit(async (values) => {
    setVerifying(true);
    try {
      const res = await getDataProvider().setPayout({ method: 'upi', vpa: values.vpa });
      const name = res.verifiedName ?? 'VERIFIED';
      setVerified({ vpa: values.vpa, name });
      patch({ payout: { method: 'upi', vpa: values.vpa, verifiedName: name } });
      toast.success('UPI ID verified');
    } catch (e) {
      toast.error(ApiError.is(e) ? e.detail : 'Could not verify this UPI ID. Check it and try again.');
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

  return (
    <PayoutShell
      tab="upi"
      step={step}
      total={total}
      title="How should we pay you?"
      subtitle="Instantly connect your UPI ID to receive real-time digital payouts."
      footer={isVerified ? <PrimaryButton label="Submit application" onPress={() => void submitApplication()} loading={submitting} /> : <PrimaryButton label="Validate & Continue" onPress={() => void verify()} loading={verifying} />}>
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
      {isVerified && verified ? <VerifiedBadge label="Verified Linked Account" name={verified.name} /> : null}
    </PayoutShell>
  );
}

const styles = StyleSheet.create({
  form: { alignSelf: 'stretch' },
  verifyBtn: { height: 52, paddingHorizontal: spacing.base, minWidth: 64, borderRadius: 100, backgroundColor: colors.darkAction, alignItems: 'center', justifyContent: 'center', ...shadows.soft },
  verifyPressed: { opacity: 0.85 },
});
