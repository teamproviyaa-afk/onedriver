import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';

export type ChipTone = 'online' | 'offline' | 'syncing' | 'sync_failed' | 'lime' | 'dark' | 'muted' | 'danger' | 'warning' | 'info' | 'success';

const TONES: Record<ChipTone, { bg: string; fg: string; border: string }> = {
  online: { bg: colors.lime, fg: colors.ink, border: colors.borderStrong },
  offline: { bg: colors.surfaceMuted, fg: colors.ink, border: colors.borderStrong },
  syncing: { bg: colors.surfaceLime, fg: colors.ink, border: colors.borderStrong },
  sync_failed: { bg: colors.surfaceDanger, fg: colors.danger, border: colors.borderStrong },
  lime: { bg: colors.lime, fg: colors.ink, border: colors.border },
  dark: { bg: colors.ink, fg: colors.surface, border: colors.ink },
  muted: { bg: colors.surfaceMuted, fg: colors.textSecondary, border: colors.surfaceMuted },
  danger: { bg: colors.surfaceDanger, fg: colors.danger, border: colors.surfaceDanger },
  warning: { bg: colors.surfaceWarning, fg: colors.ink, border: colors.surfaceWarning },
  info: { bg: '#DBEAFE', fg: colors.ink, border: '#DBEAFE' },
  success: { bg: colors.surfaceLime, fg: colors.ink, border: colors.surfaceLime },
};

export interface StatusChipProps {
  label: string;
  tone?: ChipTone;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  radius?: number;
  bordered?: boolean;
}

/** Operational status pill from rider-ui-kit (ONLINE / OFFLINE / SYNCING / SYNC FAILED) and small badges. */
export const StatusChip = ({ label, tone = 'muted', size = 'md', style, radius: r, bordered }: StatusChipProps) => {
  const t = TONES[tone];
  const border = bordered ?? (tone === 'online' || tone === 'offline' || tone === 'syncing' || tone === 'sync_failed');
  return (
    <View
      accessibilityRole="text"
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: t.bg, borderColor: border ? t.border : t.bg, borderRadius: r ?? (size === 'sm' ? radius.sm : radius.md) },
        style,
      ]}>
      <AppText variant={size === 'sm' ? 'labelXs' : 'chip'} color={t.fg} uppercase>
        {label}
      </AppText>
    </View>
  );
};

const styles = StyleSheet.create({
  base: { alignSelf: 'flex-start', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  md: { paddingHorizontal: spacing.xxl, paddingVertical: spacing.md },
  sm: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderWidth: 1 },
});
