import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, radius, shadows, spacing } from '@/theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type ToastTone = 'info' | 'success' | 'error' | 'warning';
interface ToastState {
  message: string | null;
  tone: ToastTone;
  show: (message: string, tone?: ToastTone) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>()((set) => ({
  message: null,
  tone: 'info',
  show: (message, tone = 'info') => set({ message, tone }),
  hide: () => set({ message: null }),
}));

/** Imperative toast API usable outside React (queue bridge, services). */
export const toast = {
  show: (message: string, tone: ToastTone = 'info') => useToastStore.getState().show(message, tone),
  error: (message: string) => useToastStore.getState().show(message, 'error'),
  success: (message: string) => useToastStore.getState().show(message, 'success'),
};

const ICONS: Record<ToastTone, IconName> = { info: 'info', success: 'circle-check', error: 'alert-triangle', warning: 'alert-triangle' };

export const ToastHost = () => {
  const { message, tone, hide } = useToastStore();
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!message) return;
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const t = setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => hide()), 3200);
    return () => clearTimeout(t);
  }, [message, opacity, hide]);
  if (!message) return null;
  const bg = tone === 'error' ? colors.danger : tone === 'success' ? colors.darkAction : tone === 'warning' ? colors.warning : colors.ink;
  const fg = tone === 'success' ? colors.limeBright : colors.surface;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 96, opacity }]}>
      <Pressable onPress={hide} style={[styles.toast, { backgroundColor: bg }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <Icon name={ICONS[tone]} size={18} color={fg} />
        <AppText variant="bodyBold" color={fg} style={styles.text}>
          {message}
        </AppText>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.gutter, right: spacing.gutter, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg, borderRadius: radius.lg, maxWidth: 420, ...shadows.floating },
  text: { flexShrink: 1 },
});
