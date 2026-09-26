import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, ErrorState, Icon, InfoBanner, PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { RiderMap, nativeMapAvailable } from '@/components/app';
import { getDataProvider } from '@/providers';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { ApiError } from '@/types';
import { OnboardingHeader } from '@/features/onboarding/components';

const MAP_ASPECT = 342 / 240;

/**
 * location-confirmation ("Is this correct?"): shows the hub pin + address badge and saves the hub on the
 * server. An `out_of_zone` rejection flips the emphasis to "No, Change Pin".
 */
export default function HubConfirmScreen() {
  const hub = useOnboardingStore((s) => s.hub);
  const zoneId = useOnboardingStore((s) => s.zoneId);
  const zoneName = useOnboardingStore((s) => s.zoneName);
  const patch = useOnboardingStore((s) => s.patch);
  const complete = useOnboardingStore((s) => s.complete);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: 'out_of_zone' | 'other'; message: string } | null>(null);

  const changePin = () => (router.canGoBack() ? router.back() : router.replace('/onboarding/hub' as never));

  const confirm = async () => {
    if (!hub || !zoneId) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await getDataProvider().setHub({ zoneId, lat: hub.lat, lng: hub.lng, address: hub.address, landmark: hub.landmark });
      patch({ hub: { ...hub, lat: saved.lat, lng: saved.lng, name: saved.name }, hubConfirmed: true });
      complete('hub_confirm');
      router.push('/permissions/notifications' as never);
    } catch (e) {
      if (ApiError.is(e, 'out_of_zone')) setError({ code: 'out_of_zone', message: e.detail });
      else setError({ code: 'other', message: ApiError.is(e) ? e.detail : 'Could not save your hub. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  if (!hub || !zoneId) {
    return (
      <Screen>
        <OnboardingHeader title="Is this correct?" />
        <ErrorState title="No start hub yet" body="Set your starting address and drop the pin first." onRetry={() => router.replace('/onboarding/hub' as never)} retryLabel="Set start hub" />
      </Screen>
    );
  }

  const outOfZone = error?.code === 'out_of_zone';
  const badgeText = [hub.address, hub.landmark].filter(Boolean).join(' · ');

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      footer={
        outOfZone ? (
          <>
            <PrimaryButton label="No, Change Pin" icon="map-pin" iconPosition="left" onPress={changePin} />
            <SecondaryButton label="Try again" onPress={() => void confirm()} loading={busy} />
          </>
        ) : (
          <>
            <PrimaryButton label="Yes, Confirm Hub" onPress={() => void confirm()} loading={busy} />
            <SecondaryButton label="No, Change Pin" onPress={changePin} disabled={busy} />
          </>
        )
      }>
      <OnboardingHeader title="Is this correct?" subtitle="Confirm your regular starting area. We calibrate your radius payouts based on this pin." />

      <View style={[styles.mapCard, nativeMapAvailable ? styles.mapFixed : styles.mapAspect]}>
        {nativeMapAvailable ? (
          <RiderMap pickup={{ lat: hub.lat, lng: hub.lng }} focus="pickup" height={240} interactive={false} />
        ) : (
          // Figma illustration; its baked-in sample badge sits under the live address badge below.
          <Image source={require('@/assets/figma/hub-confirm-map.png')} style={styles.mapImage} resizeMode="cover" accessibilityLabel="Map with your start pin" />
        )}
        <View style={[styles.badge, nativeMapAvailable ? styles.badgeFixed : styles.badgeCover]} accessibilityLabel={`Hub address: ${badgeText}`}>
          <Icon name="map-pin" size={18} />
          <AppText variant="bodyBoldSm" numberOfLines={1} style={styles.badgeText}>
            {badgeText}
          </AppText>
        </View>
      </View>

      {error ? (
        <View style={styles.errorCard} accessibilityLiveRegion="assertive">
          <InfoBanner tone="danger" icon="alert-triangle" text={outOfZone ? `Pin is outside ${zoneName ?? 'your zone'}` : 'Could not save your hub'} radius={21} />
          <AppText variant="body" color="textSecondary">
            {error.message}
          </AppText>
        </View>
      ) : null}

      <View style={styles.prompt}>
        <AppText variant="h4">{"Is this where you'll start your day?"}</AppText>
        <AppText variant="body" color="textSecondary">
          Once saved, this baseline configuration ensures stable navigation offsets.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.x3l },
  mapCard: { borderRadius: 32, borderWidth: 2, borderColor: colors.border, overflow: 'hidden', backgroundColor: '#EBF2F0', alignSelf: 'stretch' },
  mapFixed: { height: 240 },
  mapAspect: { aspectRatio: MAP_ASPECT },
  mapImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  badge: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 21, padding: spacing.lg, minHeight: 46 },
  badgeFixed: { left: 14, right: 14, bottom: 14 },
  // Same relative box as the badge baked into the 342×240 illustration (left 14, top 164, width 310).
  badgeCover: { left: '3.5%', right: '4.5%', top: '67.5%' },
  badgeText: { flex: 1 },
  errorCard: { gap: spacing.md, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.danger, borderRadius: 24, padding: spacing.xxl },
  prompt: { gap: spacing.md },
});
