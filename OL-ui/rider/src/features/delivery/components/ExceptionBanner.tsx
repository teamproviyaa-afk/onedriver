import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText, Icon, type IconName } from '@/components/ui';

export type ExceptionTone = 'danger' | 'warning' | 'success';

/** Exact banner colours from package-mismatch (#FFEAEA/#FF4444), package-incomplete (#FFF5E6/#FFB300) and navigation-handoff (#E8F8D5/#76EC00). */
const TONES: Record<ExceptionTone, { bg: string; border: string; title: string }> = {
  danger: { bg: '#FFEAEA', border: '#FF4444', title: '#FF4444' },
  warning: { bg: '#FFF5E6', border: '#FFB300', title: colors.ink },
  success: { bg: colors.surfaceLime, border: colors.lime, title: colors.ink },
};

export interface ExceptionBannerProps {
  tone: ExceptionTone;
  icon: IconName;
  title: string;
  body: string;
  style?: StyleProp<ViewStyle>;
}

/** Rounded (32) status banner with an icon + uppercase title row and a body line. */
export const ExceptionBanner = ({ tone, icon, title, body, style }: ExceptionBannerProps) => {
  const t = TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg, borderColor: t.border }, style]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <Icon name={icon} size={20} color={t.title} />
        <AppText variant="titleLg" color={t.title} uppercase>
          {title}
        </AppText>
      </View>
      <AppText variant="body">{body}</AppText>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: { borderWidth: 2, borderRadius: 32, padding: spacing.xxl, gap: spacing.md, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
