import { useCallback, useState } from 'react';
import { Image, Linking, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, PrimaryButton, Screen, SecondaryButton, Spacer } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';
import { useAuthStore } from '@/stores/useAuthStore';
import { requestForegroundPermission } from '@/location/locationService';

const SCENE = require('@/assets/figma/location-permission-scene.png');

/**
 * Location permission (Figma screen-location): "Find Orders Nearby" illustration,
 * Allow → OS prompt, Not Now → continue without it. Either way the ask is recorded
 * so the splash router never shows this screen twice.
 */
export default function LocationPermissionScreen() {
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  const proceed = useCallback(() => {
    useAuthStore.getState().markLocationAsked();
    router.replace('/sign-in' as never);
  }, []);

  const allow = useCallback(async () => {
    if (denied) {
      // Second tap after a denial: the OS no longer prompts, so send the rider to Settings.
      if (Platform.OS !== 'web') await Linking.openSettings().catch(() => {});
      return;
    }
    setBusy(true);
    try {
      const state = await requestForegroundPermission();
      if (state === 'granted') {
        proceed();
        return;
      }
      useAuthStore.getState().markLocationAsked();
      setDenied(true);
    } finally {
      setBusy(false);
    }
  }, [denied, proceed]);

  return (
    <Screen
      footerStyle={styles.footer}
      footer={
        <>
          {denied ? (
            <AppText variant="bodySm" color="textSecondary" align="center" accessibilityLiveRegion="polite" style={styles.note}>
              Location access was denied. You can turn it on later in Settings to see nearby orders.
            </AppText>
          ) : null}
          <PrimaryButton label={denied && Platform.OS !== 'web' ? 'Open Settings' : 'Allow Location Access'} onPress={() => void allow()} loading={busy} />
          <SecondaryButton label="Not Now" onPress={proceed} disabled={busy} />
        </>
      }>
      <Spacer size={44} />
      <View style={styles.scene} accessibilityLabel="Rider on a scooter over a map with a location pin" accessibilityRole="image">
        <Image source={SCENE} style={styles.sceneImage} resizeMode="cover" accessible={false} />
      </View>
      <View style={styles.textContent}>
        <AppText variant="display" align="center" style={styles.heading} accessibilityRole="header">
          Find Orders Nearby
        </AppText>
        <AppText variant="bodyLg" color="textSecondary" align="center" style={styles.body}>
          OneLocal needs your location permission to show you deliveries near your current spot and offer optimized navigation routes.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scene: { height: 260, alignSelf: 'stretch', borderRadius: radius.card, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: spacing.gutter, backgroundColor: colors.surface },
  sceneImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: undefined, height: undefined, borderRadius: radius.card },
  textContent: { gap: spacing.xxl, alignItems: 'center', alignSelf: 'stretch', marginTop: spacing.gutter },
  heading: { lineHeight: 34 },
  body: { lineHeight: 22 },
  footer: { gap: spacing.xxl },
  note: { paddingHorizontal: spacing.md },
});
