import { Pressable, StyleSheet } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadows, spacing } from '@/theme';
import { AppText } from '@/components/ui';
import { useConnectivityStore } from '@/stores/useConnectivityStore';

/** Floating DEV chip → scenario switcher. Rendered only when isDevBuild. */
export const DevOverlay = () => {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const state = useConnectivityStore((s) => s.state);
  if (pathname.startsWith('/dev')) return null;
  return (
    <Pressable accessibilityLabel="Open developer scenarios" onPress={() => router.push('/dev/scenarios' as never)} style={[styles.chip, { top: insets.top + 56 }]}>
      <AppText variant="labelXs" color="limeBright">
        DEV · {state === 'offline' ? 'OFFLINE' : 'SCENARIOS'}
      </AppText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: { position: 'absolute', right: spacing.md, backgroundColor: colors.darkAction, borderRadius: radius.pill, paddingHorizontal: spacing.base, paddingVertical: spacing.xs, opacity: 0.85, ...shadows.soft },
});
