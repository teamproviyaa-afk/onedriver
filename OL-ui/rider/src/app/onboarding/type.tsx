import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { spacing } from '@/theme';
import { ConfirmationSheet, InfoBanner, PrimaryButton, Screen } from '@/components/ui';
import { getDataProvider } from '@/providers';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { ApiError, type RiderType } from '@/types';
import { OnboardingHeader, RiderTypeCard } from '@/features/onboarding/components';

const OPTIONS: { value: RiderType; title: string; description: string; icon: 'store' | 'zap' | 'car-taxi-front'; gated?: boolean; badges?: string[] }[] = [
  { value: 'store', title: 'Store Rider', description: 'Linked to a specific local shop. Fixed shifts, high repeat order density.', icon: 'store' },
  { value: 'solo', title: 'Solo Rider', description: 'Flexible on-demand courier. Work anywhere, select multiple payouts.', icon: 'zap' },
  { value: 'taxi', title: 'Taxi Partner', description: 'Passenger services. Limited strictly to Auto-rickshaws and commercial cars.', icon: 'car-taxi-front', gated: true, badges: ['3/4W ONLY', 'COMING SOON'] },
];

/** rider-type-selection ("How do you ride?"): Store · Solo · Taxi Partner (V1: coming soon). */
export default function RiderTypeScreen() {
  const draftType = useOnboardingStore((s) => s.riderType);
  const patch = useOnboardingStore((s) => s.patch);
  const complete = useOnboardingStore((s) => s.complete);
  const [type, setType] = useState<RiderType>(draftType && draftType !== 'taxi' ? draftType : 'store');
  const [busy, setBusy] = useState(false);
  const [comingSoon, setComingSoon] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onContinue = async () => {
    setBusy(true);
    setError(null);
    try {
      await getDataProvider().setType(type);
      patch({ riderType: type });
      complete('type');
      router.push((type === 'store' ? '/onboarding/store/link' : '/onboarding/kyc') as never);
    } catch (e) {
      if (ApiError.is(e, 'coming_soon')) setComingSoon(true);
      else setError(ApiError.is(e) ? e.detail : 'Could not save your choice. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll contentStyle={styles.content} footer={<PrimaryButton label="Select & Proceed" onPress={() => void onContinue()} loading={busy} />}>
      <OnboardingHeader title="How do you ride?" subtitle="Select your business model. You can switch models later in settings." />
      <View style={styles.flex} />
      {error ? <InfoBanner tone="danger" icon="alert-triangle" text={error} bold={false} /> : null}
      <View style={styles.options} accessibilityRole="radiogroup">
        {OPTIONS.map((o) => (
          <RiderTypeCard
            key={o.value}
            title={o.title}
            description={o.description}
            icon={o.icon}
            selected={type === o.value}
            gated={o.gated}
            badges={o.badges}
            onPress={() => (o.gated ? setComingSoon(true) : setType(o.value))}
          />
        ))}
      </View>
      <ConfirmationSheet
        visible={comingSoon}
        onClose={() => setComingSoon(false)}
        icon="car-taxi-front"
        title="Taxi Partner is coming soon"
        body="Passenger services for auto-rickshaws and commercial cars launch in a later release. Choose Store Rider or Solo Rider to start delivering today."
        cancelLabel="Got it"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.x3l },
  flex: { flex: 1 },
  options: { gap: spacing.lg },
});
