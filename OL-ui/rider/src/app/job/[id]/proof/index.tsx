import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { spacing } from '@/theme';
import { AppText, Divider, InfoBanner, PrimaryButton } from '@/components/ui';
import { FloatingJobHeader } from '@/components/app';
import type { ProofMethod } from '@/types';
import { formatINR } from '@/utils/format';
import { OTP } from '@/domain/otp';
import { useJobScreen } from '@/features/delivery/useJobScreen';
import { allowedProofMethods, defaultProofMethod } from '@/features/delivery/proof';
import { DeliveryStepper, JobDrawerLayout, JobScreenFallback, ProofMethodCard } from '@/features/delivery/components';

const METHODS: { method: ProofMethod; icon: 'lock' | 'camera' | 'pencil'; title: string; subtitle: string }[] = [
  { method: 'otp', icon: 'lock', title: 'Secure OTP', subtitle: 'Customer receives a 4-digit code' },
  { method: 'photo', icon: 'camera', title: 'Photo Proof', subtitle: 'Take a picture at door / handoff' },
  { method: 'signature', icon: 'pencil', title: 'Digital Signature', subtitle: 'Customer signs on device' },
];

/**
 * Delivery confirmation (Figma delivery-confirmation): choose how the handover is
 * verified. Only the methods the order allows are enabled; a locked OTP falls back to photo.
 */
export default function DeliveryConfirmationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isLoading, error, refetch } = useJobScreen(id, ['handover', 'proof']);
  const [method, setMethod] = useState<ProofMethod | null>(null);

  if (!job) return <JobScreenFallback error={isLoading ? null : error} onRetry={refetch} />;

  // The rider's pick wins while it stays allowed (e.g. OTP getting locked drops back to the suggestion).
  const allowed = allowedProofMethods(job);
  const suggested = defaultProofMethod(job);
  const selected = method && allowed.includes(method) ? method : suggested;

  return (
    <JobDrawerLayout
      drawer={
        <>
          <DeliveryStepper phase="verify" />
          <Divider />
          <PrimaryButton label="CONFIRM METHOD" disabled={!selected} onPress={() => selected && router.push(`/job/${job.id}/proof/${selected}` as never)} />
        </>
      }>
      <FloatingJobHeader label="VERIFICATION" orderRef={job.orderRef} payout={job.payoutEstimate} radius={35.5} />
      <AppText variant="h4">Select Verification Method</AppText>
      {job.cashToCollect > 0 ? <InfoBanner icon="indian-rupee" text={`Collect ${formatINR(job.cashToCollect)} cash from ${job.drop.customerFirstName} before handover`} /> : null}
      {job.otpLocked ? <InfoBanner icon="lock" tone="warning" text={`OTP locked after ${OTP.maxAttempts} wrong attempts — use photo proof instead`} /> : null}
      {allowed.length === 0 ? <InfoBanner icon="alert-triangle" tone="danger" text="No verification method is configured for this order. Contact support." /> : null}
      <View style={styles.methods}>
        {METHODS.map((m) => {
          const enabled = allowed.includes(m.method);
          const lockedOtp = m.method === 'otp' && job.otpLocked;
          return (
            <ProofMethodCard
              key={m.method}
              icon={m.icon}
              title={m.title}
              subtitle={enabled ? m.subtitle : lockedOtp ? `Locked after ${OTP.maxAttempts} wrong attempts` : 'Not available for this order'}
              selected={selected === m.method}
              disabled={!enabled}
              onPress={() => setMethod(m.method)}
            />
          );
        })}
      </View>
    </JobDrawerLayout>
  );
}

const styles = StyleSheet.create({
  methods: { gap: spacing.xxl },
});
