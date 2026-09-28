import { useCallback, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { AppText, PrimaryButton, Screen } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { useAuthActions } from '@/hooks/useAuthActions';
import { isLiveAuth } from '@/config/env';
import { DEMO_RETURNING_PHONE } from '@/demo/constants';
import { PhoneField } from '@/features/auth/FormFields';
import { PHONE_ERROR, isValidIndianMobile, normalizePhone } from '@/features/auth/phone';

/** Figma screen-login: lime gradient runs left → right, #5CFF00 → #2F9A00. */
const GRADIENT = ['#5CFF00', '#2F9A00'] as const;
/** Wordmark "One" is #050505 on this screen (the splash uses the raster logo). */
const WORDMARK_ONE = '#050505';

/**
 * Returning-rider sign-in: phone number → OTP. The wordmark is live two-tone text
 * ("One" ink, "Local" white), the CTA sits near the bottom with the register link.
 */
export default function SignInScreen() {
  const { busy, error, sendOtp, clearError } = useAuthActions();
  const [phone, setPhone] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    Keyboard.dismiss();
    const digits = normalizePhone(phone);
    if (!isValidIndianMobile(digits)) {
      setLocalError(PHONE_ERROR);
      return;
    }
    setLocalError(null);
    const challenge = await sendOtp(digits);
    if (challenge) router.push('/otp' as never);
  }, [phone, sendOtp]);

  const onChangePhone = useCallback(
    (t: string) => {
      setPhone(t);
      if (localError) setLocalError(null);
      if (error) clearError();
    },
    [localError, error, clearError],
  );

  return (
    <LinearGradient colors={[...GRADIENT]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.fill}>
      <Screen background="transparent" scroll keyboard contentStyle={styles.content}>
        <View>
          <View style={styles.logoArea}>
            <AppText variant="h1" color={WORDMARK_ONE} accessibilityRole="header" accessibilityLabel="OneLocal">
              One
              <AppText variant="h1" color="surface">
                Local
              </AppText>
            </AppText>
          </View>

          <View style={styles.form}>
            <View style={styles.header}>
              <AppText variant="display" accessibilityRole="header">
                Welcome back
              </AppText>
              <AppText variant="bodyLg" color="#090909" style={styles.subtext}>
                Enter your phone number to proceed to your dashboard
              </AppText>
            </View>

            <PhoneField
              label="Enter Phone Number"
              flag
              value={phone}
              onChangeText={onChangePhone}
              onSubmitEditing={() => void submit()}
              returnKeyType="done"
              autoFocus={false}
              editable={!busy}
              error={localError ?? error}
              helper={
                !isLiveAuth ? (
                  <AppText variant="bodySm" color={colors.darkAction} style={styles.hint}>
                    Demo: use {DEMO_RETURNING_PHONE} for the sample rider
                  </AppText>
                ) : undefined
              }
            />
          </View>
        </View>

        <View style={styles.bottomArea}>
          <PrimaryButton label="Continue" onPress={() => void submit()} loading={busy} />
          <View style={styles.registerRow}>
            <AppText variant="bodyLg" color="#090909" style={styles.registerText}>
              New Rider?
            </AppText>
            <Pressable onPress={() => router.push('/register' as never)} hitSlop={10} accessibilityRole="link" accessibilityLabel="New rider? Register here" style={styles.registerLink}>
              <AppText variant="titleLg" style={[styles.registerText, styles.underline]}>
                Register here
              </AppText>
            </Pressable>
          </View>
        </View>
      </Screen>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { justifyContent: 'space-between' },
  logoArea: { alignItems: 'center', paddingTop: spacing.gutter },
  form: { gap: spacing.gutter, paddingTop: spacing.gutter },
  header: { gap: spacing.md },
  subtext: { lineHeight: 22 },
  hint: { opacity: 0.75 },
  bottomArea: { gap: spacing.x3l, alignItems: 'center', paddingTop: spacing.x5l, paddingBottom: spacing.x6l },
  registerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  registerText: { fontSize: 15, lineHeight: 20 },
  registerLink: { justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
});
