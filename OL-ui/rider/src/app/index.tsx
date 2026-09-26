import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';

import { colors } from '@/theme';
import { resolveEntryRoute } from '@/navigation/resume';
import { AppText, PrimaryButton } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Splash (Figma screen-splash): lime gradient + OneLocal wordmark while the session,
 * rider status and active job are restored. Then routes to the correct screen.
 */
export default function SplashScreen() {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const setStatus = useAuthStore((s) => s.setStatus);

  useEffect(() => {
    let cancelled = false;
    const start = Date.now();
    (async () => {
      try {
        const route = await resolveEntryRoute();
        const wait = Math.max(0, 900 - (Date.now() - start));
        setTimeout(() => {
          if (!cancelled) router.replace(route as never);
        }, wait);
      } catch (e) {
        if (!cancelled) {
          setStatus('signed_out');
          setError(e instanceof Error ? e.message : 'Could not start the app');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, setStatus]);

  return (
    <LinearGradient colors={[colors.limeSplashTop, colors.limeSplashMid, colors.limeSplashTop]} locations={[0, 0.5, 1]} style={styles.fill}>
      <StatusBar style="dark" />
      <View style={styles.center}>
        <Image source={require('@/assets/figma/splash-wordmark.png')} style={styles.wordmark} resizeMode="contain" accessibilityLabel="OneLocal" />
      </View>
      {error ? (
        <View style={styles.error}>
          <AppText variant="bodyBold" align="center">
            {error}
          </AppText>
          <PrimaryButton label="Try again" onPress={() => setAttempt((a) => a + 1)} />
        </View>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wordmark: { width: 342, height: 192, maxWidth: '88%' },
  error: { padding: 24, gap: 12 },
});
