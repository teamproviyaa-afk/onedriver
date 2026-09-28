import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, ErrorState, GhostButton, PrimaryButton, Screen, Spacer } from '@/components/ui';
import { MessageDeliveryNote } from '@/components/app';
import type { OtpDelivery } from '@/types';
import { spacing } from '@/theme';
import { useAuthActions } from '@/hooks/useAuthActions';
import { useCountdown } from '@/hooks/useCountdown';
import { useAuthStore } from '@/stores/useAuthStore';
import { OTP } from '@/domain/otp';
import { isLiveAuth } from '@/config/env';
import { DEMO_OTP_CODE } from '@/demo/constants';
import { formatCountdown } from '@/utils/format';
import { addSeconds, nowIso } from '@/utils/time';
import { OtpBoxes } from '@/features/auth/OtpBoxes';
import { formatPhoneWithCode } from '@/features/auth/phone';

const INCOMPLETE_ERROR = `Enter the ${OTP.loginLength}-digit OTP sent to your phone`;

/** How the code reached the rider: WhatsApp first, SMS when the number is not on WhatsApp or on resend. */
const deliveryText = (d: OtpDelivery | null): string | null => {
  if (!d) return null;
  if (d.channel === 'whatsapp') return 'Code sent on WhatsApp';
  if (d.channel === 'unknown') return "Code sent on WhatsApp, or by SMS if this number isn't on WhatsApp";
  if (d.fallbackReason === 'no_whatsapp' || d.fallbackReason === 'known_no_whatsapp') return "Code sent by SMS · this number isn't on WhatsApp";
  return 'Code sent by SMS';
};
const LOCKED_ERROR = 'Too many wrong attempts. Request a new OTP to continue.';

/**
 * OTP entry (Figma screen-otp): 6 boxes with SMS auto-read, resend countdown,
 * "Verify & Proceed". Wrong codes shake + clear and show the attempts left.
 */
export default function OtpScreen() {
  const phone = useAuthStore((s) => s.pendingPhone);
  const delivery = useAuthStore((s) => s.otpDelivery);
  const { busy, sendOtp, verifyOtp } = useAuthActions();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [resendAt, setResendAt] = useState(() => addSeconds(nowIso(), OTP.resendSeconds));
  const [resending, setResending] = useState(false);
  const secondsLeft = useCountdown(resendAt);
  const [shake] = useState(() => new Animated.Value(0));
  const translateX = useMemo(() => shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }), [shake]);
  const verifying = useRef(false);

  const runShake = useCallback(() => {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shake]);

  const verify = useCallback(
    async (value: string) => {
      if (verifying.current) return;
      if (locked) {
        setError(LOCKED_ERROR);
        return;
      }
      if (value.length !== OTP.loginLength) {
        setError(INCOMPLETE_ERROR);
        runShake();
        return;
      }
      verifying.current = true;
      setError(null);
      try {
        const res = await verifyOtp(value);
        if (res.ok) {
          Keyboard.dismiss();
          router.replace(res.route as never);
          return;
        }
        if (res.attemptsLeft !== undefined) {
          if (res.attemptsLeft <= 0) {
            setLocked(true);
            setError(LOCKED_ERROR);
          } else {
            setError(`Wrong OTP. ${res.attemptsLeft} ${res.attemptsLeft === 1 ? 'attempt' : 'attempts'} left`);
          }
        } else {
          setError(res.detail);
        }
        runShake();
        setCode('');
      } finally {
        verifying.current = false;
      }
    },
    [locked, runShake, verifyOtp],
  );

  const resend = useCallback(async () => {
    if (!phone || resending) return;
    setResending(true);
    setError(null);
    try {
      // A resend goes by SMS: the rider did not get the WhatsApp message.
      const challenge = await sendOtp(phone, { resend: true });
      if (challenge) {
        setLocked(false);
        setCode('');
        setResendAt(addSeconds(nowIso(), challenge.resendAfterSeconds || OTP.resendSeconds));
      } else {
        setError('Could not resend the OTP. Try again.');
      }
    } finally {
      setResending(false);
    }
  }, [phone, resending, sendOtp]);

  const onChangeCode = useCallback((v: string) => {
    setCode(v);
    // Clear the error as soon as the rider starts typing again.
    if (v.length > 0) setError(null);
  }, []);

  const onComplete = useCallback((v: string) => void verify(v), [verify]);

  if (!phone) {
    return (
      <Screen>
        <ErrorState title="No phone number" body="Enter your phone number to receive an OTP." onRetry={() => router.replace('/sign-in' as never)} retryLabel="Go to sign in" />
      </Screen>
    );
  }

  // A locked rider can request a fresh code straight away; otherwise wait for the countdown.
  const canResend = locked || secondsLeft <= 0;

  return (
    <Screen scroll keyboard>
      <View style={styles.header}>
        <AppText variant="display" accessibilityRole="header">
          Enter OTP
        </AppText>
        <View style={styles.subDesc}>
          <AppText variant="bodyLg" color="textSecondary" style={styles.subText}>
            Sent to {formatPhoneWithCode(phone)}
          </AppText>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in' as never))}
            hitSlop={10}
            disabled={busy}
            accessibilityRole="link"
            accessibilityLabel="Edit phone number"
            style={styles.editLink}>
            <AppText variant="titleLg" style={styles.underline}>
              Edit
            </AppText>
          </Pressable>
        </View>
        {deliveryText(delivery) ? <MessageDeliveryNote channel={delivery?.channel ?? null} text={deliveryText(delivery) ?? ''} /> : null}
      </View>

      <Spacer size={spacing.x8l} />

      <Animated.View style={{ transform: [{ translateX }] }}>
        <OtpBoxes value={code} onChange={onChangeCode} length={OTP.loginLength} error={!!error} editable={!locked} onComplete={onComplete} autoFocus />
      </Animated.View>
      {error ? (
        <AppText variant="bodySemi" color="danger" align="center" style={styles.error} accessibilityLiveRegion="assertive">
          {error}
        </AppText>
      ) : null}
      {!isLiveAuth ? (
        <AppText variant="bodySm" color="textMuted" align="center" style={styles.hint}>
          Demo code: {DEMO_OTP_CODE}
        </AppText>
      ) : null}

      <Spacer flex />

      <View style={styles.timerArea}>
        {canResend ? (
          <>
            <AppText variant="bodyLg" color="textSecondary" style={styles.timerText}>
              {locked ? 'Request a new code to continue' : "Didn't get the code?"}
            </AppText>
            <GhostButton label={resending ? 'Sending…' : 'Resend by SMS'} onPress={() => void resend()} disabled={resending || busy} underline />
          </>
        ) : (
          <>
            <AppText variant="bodyLg" color="textSecondary" style={styles.timerText}>
              Auto-reading message...
            </AppText>
            <View style={styles.resendRow} accessibilityLiveRegion="polite" accessibilityLabel={`Resend OTP in ${secondsLeft} seconds`}>
              <AppText variant="bodyLg" color="textSecondary" style={styles.timerText}>
                Resend OTP in
              </AppText>
              <AppText variant="statusTime">{formatCountdown(secondsLeft)}s</AppText>
            </View>
          </>
        )}
      </View>

      <View style={styles.bottomArea}>
        <PrimaryButton label="Verify & Proceed" onPress={() => void verify(code)} loading={busy} disabled={locked} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingTop: spacing.x3l },
  subDesc: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  subText: { lineHeight: 22 },
  editLink: { minHeight: 32, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  error: { marginTop: spacing.xxl },
  hint: { marginTop: spacing.md },
  timerArea: { alignItems: 'center', gap: spacing.md, paddingBottom: spacing.xxl },
  timerText: { fontSize: 15, lineHeight: 20 },
  resendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bottomArea: { paddingBottom: spacing.lg },
});
