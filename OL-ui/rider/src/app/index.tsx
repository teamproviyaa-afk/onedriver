import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';

import { resolveEntryRoute } from '@/navigation/resume';
import { AppText, PrimaryButton } from '@/components/ui';
import { BrandSplash } from '@/features/splash/BrandSplash';
import { SPLASH, splashMode, type SplashMode } from '@/features/splash/splashPlan';
import { colors, spacing } from '@/theme';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Splash: the OneLocal brand film plays while the session, rider status and active job are
 * restored; the app moves on when both are done. First launch shows the whole film (with Skip),
 * later launches only the logo reveal, and reduced motion shows the static logo.
 */
export default function SplashScreen() {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [route, setRoute] = useState<string | null>(null);
  const [mode, setMode] = useState<SplashMode | null>(null);
  const [filmDone, setFilmDone] = useState(false);
  const setStatus = useAuthStore((s) => s.setStatus);

  useEffect(() => {
    let cancelled = false;
    Promise.all([AsyncStorage.getItem(SPLASH.seenKey).catch(() => null), AccessibilityInfo.isReduceMotionEnabled().catch(() => false)]).then(([seen, reduceMotion]) => {
      if (!cancelled) setMode(splashMode({ seenBefore: seen === '1', reduceMotion }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await resolveEntryRoute();
        if (!cancelled) setRoute(next);
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

  useEffect(() => {
    if (!filmDone || !route) return;
    if (mode === 'full') AsyncStorage.setItem(SPLASH.seenKey, '1').catch(() => {});
    router.replace(route as never);
  }, [filmDone, route, mode]);

  return (
    <View style={styles.fill}>
      <StatusBar hidden />
      <BrandSplash mode={mode} onDone={() => setFilmDone(true)} paused={!!error} />
      {error ? (
        <View style={styles.error}>
          <AppText variant="bodyBold" align="center">
            {error}
          </AppText>
          <PrimaryButton
            label="Try again"
            onPress={() => {
              setError(null);
              setAttempt((a) => a + 1);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: SPLASH.background },
  error: { position: 'absolute', left: spacing.gutter, right: spacing.gutter, bottom: spacing.x3l, padding: spacing.xxl, gap: spacing.md, borderRadius: 24, backgroundColor: colors.surface },
});
