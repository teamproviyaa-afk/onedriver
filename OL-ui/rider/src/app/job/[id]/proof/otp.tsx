import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, Card, Divider, Icon, PrimaryButton, toast } from '@/components/ui';
import { FloatingJobHeader, NumericKeypad, OTPInput } from '@/components/app';
import { useJobActions } from '@/hooks';
import { ApiError } from '@/types';
import { OTP, attemptsLeft } from '@/domain/otp';
import { getDemoProvider } from '@/providers';
import { isLocalDemo } from '@/config/env';
import { useJobScreen } from '@/features/delivery/useJobScreen';
import { errorMessage } from '@/features/delivery/errors';
import { finishProof, type ProofSubmission } from '@/features/delivery/proof';
import { DeliveryStepper, JobDrawerLayout, JobScreenFallback } from '@/features/delivery/components';

/**
 * OTP proof (Figma proof-otp): the rider keys in the 4-digit code the customer received
 * on the in-app keypad. Wrong codes count down the 5 attempts; a locked OTP offers photo proof.
 */
export default function ProofOtpScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isLoading, error, refetch, lockRedirect, unlockRedirect } = useJobScreen(id, ['handover', 'proof']);
  const { submitProof } = useJobActions();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockedLocally, setLockedLocally] = useState(false);
  const [demoOtp, setDemoOtp] = useState<string | undefined>();

  useEffect(() => {
    if (!isLocalDemo || !id) return;
    let cancelled = false;
    void getDemoProvider()
      ?.getDemoDeliveryOtp(id)
      .then((v) => !cancelled && setDemoOtp(v))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!job) return <JobScreenFallback error={isLoading ? null : error} onRetry={refetch} />;

  const locked = job.otpLocked || lockedLocally;
  const left = attemptsLeft(job.otpAttempts);
  const complete = code.length === OTP.deliveryLength;

  const verify = async () => {
    if (!complete || busy) return;
    setBusy(true);
    setMessage(null);
    lockRedirect();
    try {
      const input: ProofSubmission = { method: 'otp', code, cashCollected: job.cashToCollect || undefined };
      const res = await submitProof(job, input);
      finishProof(job.id, res);
    } catch (e) {
      unlockRedirect();
      setCode('');
      if (ApiError.is(e, 'otp_invalid')) {
        const remaining = (e.meta as { attemptsLeft?: number } | undefined)?.attemptsLeft;
        setMessage(remaining !== undefined ? `Wrong OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} left` : e.detail);
      } else if (ApiError.is(e, 'otp_locked')) {
        setLockedLocally(true);
      } else {
        toast.error(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <JobDrawerLayout
      drawer={
        <>
          <DeliveryStepper phase="verify" />
          <Divider />
          {locked ? (
            <PrimaryButton label="USE PHOTO PROOF" icon="camera" iconPosition="left" onPress={() => router.replace(`/job/${job.id}/proof/photo` as never)} />
          ) : (
            <PrimaryButton label="VERIFY & COMPLETE" onPress={() => void verify()} disabled={!complete} loading={busy} />
          )}
        </>
      }>
      <FloatingJobHeader label="VERIFICATION" orderRef={job.orderRef} payout={job.payoutEstimate} radius={35.5} />
      <View style={styles.heading}>
        <AppText variant="h4">Enter Customer OTP</AppText>
        <AppText variant="bodySm" color="textSecondary">
          {OTP.deliveryLength}-digit verification code has been shared with {job.drop.customerFirstName}.
        </AppText>
      </View>

      {locked ? (
        <Card radius={32} padding={spacing.x3l} gap={spacing.lg} style={styles.lockedCard} background={colors.surfaceWarning} borderColor={colors.warning}>
          <View style={styles.lockedRow}>
            <Icon name="lock" size={22} />
            <AppText variant="titleLg">OTP locked after {OTP.maxAttempts} wrong attempts</AppText>
          </View>
          <AppText variant="body" color="textSecondary">
            Take a photo of the package at the door instead. Operations will review the handover.
          </AppText>
        </Card>
      ) : (
        <>
          <OTPInput value={code} onChange={setCode} length={OTP.deliveryLength} keypad boxSize={64} boxRadius={32} error={!!message} />
          {message ? (
            <AppText variant="bodySemi" color="danger" align="center" accessibilityLiveRegion="assertive">
              {message}
            </AppText>
          ) : job.otpAttempts > 0 ? (
            <AppText variant="bodySm" color="textSecondary" align="center">
              {left} attempt{left === 1 ? '' : 's'} left
            </AppText>
          ) : null}
          {isLocalDemo && demoOtp ? (
            <AppText variant="bodySm" color="textMuted" align="center">
              Demo OTP: {demoOtp}
            </AppText>
          ) : null}
          <NumericKeypad onDigit={(d) => setCode((c) => (c.length < OTP.deliveryLength ? c + d : c))} onDelete={() => setCode((c) => c.slice(0, -1))} disabled={busy} />
        </>
      )}
    </JobDrawerLayout>
  );
}

const styles = StyleSheet.create({
  heading: { gap: spacing.xs },
  lockedCard: { alignSelf: 'stretch' },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
