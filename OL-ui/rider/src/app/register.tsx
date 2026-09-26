import { useCallback, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, BottomSheet, Checkbox, PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { useAuthActions } from '@/hooks/useAuthActions';
import { useAuthStore } from '@/stores/useAuthStore';
import { PhoneField, PillField } from '@/features/auth/FormFields';
import { registerSchema, type RegisterFormInput, type RegisterFormOutput } from '@/features/auth/phone';
import { zodResolver } from '@/features/auth/zodResolver';

type LegalDoc = 'terms' | 'privacy';
const LEGAL: Record<LegalDoc, { title: string; body: string }> = {
  terms: {
    title: 'Terms of Service',
    body: 'The full Terms of Service for OneLocal riders will be available here soon. Until then, our support team can share a copy on request.',
  },
  privacy: {
    title: 'Privacy Policy',
    body: 'The full Privacy Policy will be available here soon. Your phone number is used only for sign-in and delivery coordination.',
  },
};

/**
 * New-rider application (Figma screen-register): name, phone, optional referral code,
 * Terms acceptance → Send OTP. Details are parked in the auth store and registered
 * by `verifyOtp` once the phone is confirmed.
 */
export default function RegisterScreen() {
  const { busy, error, sendOtp, clearError } = useAuthActions();
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const phoneRef = useRef<TextInput>(null);
  const referralRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormInput, unknown, RegisterFormOutput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      referralCode: '',
      acceptTerms: false,
    },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const onSubmit = useCallback(
    async (values: RegisterFormOutput) => {
      Keyboard.dismiss();
      useAuthStore.getState().setPendingRegistration({
        fullName: values.fullName,
        referralCode: values.referralCode || undefined,
      });
      const challenge = await sendOtp(values.phone);
      if (challenge) router.push('/otp' as never);
    },
    [sendOtp],
  );

  return (
    <Screen scroll keyboard contentStyle={styles.content}>
      <View style={styles.header}>
        <AppText variant="display" accessibilityRole="header">
          Apply as Rider
        </AppText>
        <AppText variant="bodyLg" color="textSecondary" style={styles.subtext}>
          Fill out details to start earning with OneLocal
        </AppText>
      </View>

      <View style={styles.form}>
        <Controller
          control={control}
          name="fullName"
          render={({ field: { value, onChange, onBlur } }) => (
            <PillField
              label="Full Name"
              placeholder="eg. Rahul Sharma"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
              editable={!busy}
              error={errors.fullName?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="phone"
          render={({ field: { value, onChange, onBlur } }) => (
            <PhoneField
              ref={phoneRef}
              label="Phone Number"
              value={value}
              onChangeText={(t) => {
                onChange(t);
                if (error) clearError();
              }}
              onBlur={onBlur}
              returnKeyType="next"
              onSubmitEditing={() => referralRef.current?.focus()}
              editable={!busy}
              error={errors.phone?.message ?? error}
            />
          )}
        />
        <Controller
          control={control}
          name="referralCode"
          render={({ field: { value, onChange, onBlur } }) => (
            <PillField
              ref={referralRef}
              label="Referral Code (Optional)"
              placeholder="eg. CITY100"
              value={value}
              onChangeText={(t) => onChange(t.toUpperCase())}
              onBlur={onBlur}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => void handleSubmit(onSubmit)()}
              editable={!busy}
              error={errors.referralCode?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="acceptTerms"
          render={({ field: { value, onChange } }) => (
            <View style={styles.termsBlock}>
              <View style={styles.terms}>
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Checkbox checked={value} onChange={onChange} size={24} radius={12} borderColor={colors.border} disabled={busy} />
                </View>
                <AppText variant="body" style={styles.termsText} onPress={() => onChange(!value)} accessibilityRole="checkbox" accessibilityState={{ checked: value }}>
                  I agree to the{' '}
                  <AppText variant="bodyBold" style={[styles.termsText, styles.link]} onPress={() => setDoc('terms')} accessibilityRole="link">
                    Terms of Service
                  </AppText>{' '}
                  and{' '}
                  <AppText variant="bodyBold" style={[styles.termsText, styles.link]} onPress={() => setDoc('privacy')} accessibilityRole="link">
                    Privacy Policy
                  </AppText>
                </AppText>
              </View>
              {errors.acceptTerms?.message ? (
                <AppText variant="bodySm" color="danger" accessibilityLiveRegion="polite">
                  {errors.acceptTerms.message}
                </AppText>
              ) : null}
            </View>
          )}
        />
      </View>

      <View style={styles.bottomArea}>
        <PrimaryButton label="Send OTP" onPress={() => void handleSubmit(onSubmit)()} loading={busy} />
      </View>

      <BottomSheet visible={doc !== null} onClose={() => setDoc(null)} title={doc ? LEGAL[doc].title : undefined}>
        {doc ? (
          <AppText variant="body" color="textSecondary">
            {LEGAL[doc].body}
          </AppText>
        ) : null}
        <SecondaryButton label="Close" onPress={() => setDoc(null)} />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'space-between', gap: spacing.x5l },
  header: { gap: spacing.md, paddingTop: spacing.x3l },
  subtext: { lineHeight: 22 },
  form: { gap: spacing.xxl, alignItems: 'stretch' },
  termsBlock: { gap: spacing.sm, alignSelf: 'stretch' },
  terms: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    alignSelf: 'stretch',
    minHeight: 44,
  },
  termsText: { flex: 1, fontSize: 13, lineHeight: 18 },
  link: { textDecorationLine: 'underline' },
  bottomArea: { paddingBottom: spacing.lg },
});
