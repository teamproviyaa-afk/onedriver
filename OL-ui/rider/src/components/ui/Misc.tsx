import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { initials } from '@/utils/format';

export const Divider = ({ color = colors.border, inset = 0, thickness = 1, style }: { color?: string; inset?: number; thickness?: number; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ height: thickness, backgroundColor: color, marginHorizontal: inset, alignSelf: 'stretch' }, style]} />
);

export const Spacer = ({ size = spacing.xxl, flex }: { size?: number; flex?: boolean }) => <View style={flex ? { flex: 1 } : { height: size }} />;

export interface AvatarProps {
  name?: string;
  source?: ImageSourcePropType | null;
  size?: number;
  borderColor?: string;
  background?: string;
}

/** Circular avatar with lime fallback initials (home-offline: 48px, border 2 #DBE0D6). */
export const Avatar = ({ name = '', source, size = 48, borderColor = colors.border, background = colors.lime }: AvatarProps) => (
  <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, borderColor, backgroundColor: background }]} accessibilityLabel={name ? `${name} avatar` : 'avatar'}>
    {source ? <Image source={source} style={{ width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }} resizeMode="cover" /> : <AppText variant="titleLg">{initials(name)}</AppText>}
  </View>
);

export interface InfoBannerProps {
  icon?: IconName;
  text: string;
  tone?: 'lime' | 'muted' | 'danger' | 'warning' | 'dark';
  bold?: boolean;
  style?: StyleProp<ViewStyle>;
  trailing?: ReactNode;
  radius?: number;
}

/** Pale-green instruction banner (at-pickup "Confirm all 3 items…", home-online store card). */
export const InfoBanner = ({ icon = 'info', text, tone = 'lime', bold = true, style, trailing, radius: r = 21 }: InfoBannerProps) => {
  const bg = tone === 'lime' ? colors.surfaceLime : tone === 'danger' ? colors.surfaceDanger : tone === 'warning' ? colors.surfaceWarning : tone === 'dark' ? colors.ink : colors.surface;
  const fg = tone === 'dark' ? colors.surface : tone === 'danger' ? colors.danger : colors.ink;
  return (
    <View style={[styles.banner, { backgroundColor: bg, borderRadius: r, borderColor: tone === 'dark' ? colors.ink : colors.border }, style]}>
      <Icon name={icon} size={18} color={fg} />
      <AppText variant={bold ? 'titleSm' : 'bodySm'} color={fg} style={styles.bannerText}>
        {text}
      </AppText>
      {trailing}
    </View>
  );
};

export interface StatTileProps {
  label: string;
  value: string;
  radius?: number;
  background?: string;
  labelColor?: string;
  valueColor?: string;
  style?: StyleProp<ViewStyle>;
  valueVariant?: 'h2' | 'h1' | 'display' | 'hero';
}

/** Quick stat card (home-offline "YESTERDAY ₹1,840", radius 43). */
export const StatTile = ({ label, value, radius: r = 43, background = colors.surface, labelColor = colors.textSecondary, valueColor = colors.ink, style, valueVariant = 'h2' }: StatTileProps) => (
  <View style={[styles.stat, { borderRadius: r, backgroundColor: background }, style]}>
    <AppText variant="label" color={labelColor} uppercase>
      {label}
    </AppText>
    <AppText variant={valueVariant} color={valueColor}>
      {value}
    </AppText>
  </View>
);

export interface KeyValueRowProps {
  label: string;
  value: string | ReactNode;
  valueColor?: string;
  labelColor?: string;
  strong?: boolean;
}

export const KeyValueRow = ({ label, value, valueColor = colors.ink, labelColor = colors.textSecondary, strong }: KeyValueRowProps) => (
  <View style={styles.kv}>
    <AppText variant={strong ? 'bodyBold' : 'body'} color={labelColor}>
      {label}
    </AppText>
    {typeof value === 'string' ? (
      <AppText variant={strong ? 'titleLg' : 'bodyBold'} color={valueColor}>
        {value}
      </AppText>
    ) : (
      value
    )}
  </View>
);

export const Dot = ({ color = colors.ink, size = 10, style }: { color?: string; size?: number; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />
);

export const SectionLabel = ({ children, color = colors.textSecondary }: { children: string; color?: string }) => (
  <AppText variant="label" color={color} uppercase>
    {children}
  </AppText>
);

/** Small dark badge (job-badge "FOOD DELIVERY", "3 ITEMS"). */
export const Badge = ({ label, tone = 'dark', radius: r = 14 }: { label: string; tone?: 'dark' | 'lime' | 'muted' | 'danger'; radius?: number }) => {
  const bg = tone === 'dark' ? colors.ink : tone === 'lime' ? colors.lime : tone === 'danger' ? colors.danger : colors.surfaceMuted;
  const fg = tone === 'dark' || tone === 'danger' ? colors.surface : colors.ink;
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderRadius: r, borderColor: tone === 'lime' ? colors.border : bg }]}>
      <AppText variant="label" color={fg} uppercase>
        {label}
      </AppText>
    </View>
  );
};

const styles = StyleSheet.create({
  avatar: { borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, padding: spacing.lg, borderWidth: 2, alignSelf: 'stretch' },
  bannerText: { flex: 1 },
  stat: { flex: 1, borderWidth: 2, borderColor: colors.border, padding: spacing.xxl, gap: spacing.md },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.lg },
  badge: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderWidth: 1, alignSelf: 'flex-start' },
});

export const cardRadius = radius;
