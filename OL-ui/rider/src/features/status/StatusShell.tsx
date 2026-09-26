import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { AppText, GhostButton, Icon, Screen, type IconName } from '@/components/ui';
import { AppHeader } from '@/components/app';
import { colors, shadows, spacing, type TypographyToken } from '@/theme';

export type StatusTone = 'green' | 'red';

const GRADIENTS: Record<StatusTone, readonly [string, string, string]> = {
  green: ['#A5F257', '#76EC00', '#5CB800'],
  red: ['#F48484', '#EF4444', '#BA3535'],
};
const GRADIENT_STOPS = [0.125, 0.486, 0.819] as const;

export interface StatusShellProps {
  title: string;
  subtitle: string;
  tone: StatusTone;
  icon: IconName;
  badge: string;
  /** Illustration card fill / border (Figma: white, #E8F8D5 or #FEE2E2 · #DBE0D6 or #EF4444). */
  cardBackground?: string;
  cardBorder?: string;
  badgeTone?: 'dark' | 'danger';
  /** Solid flat avatar (approval-pending-solo) instead of the diagonal gradient. */
  flatAvatar?: boolean;
  showBack?: boolean;
  onSignOut?: () => void;
  signingOut?: boolean;
  /** Pinned primary CTA. */
  footer: ReactNode;
  /** Optional text action rendered on the same row as "Sign out" (e.g. Refresh Status). */
  secondary?: ReactNode;
  children?: ReactNode;
}

/**
 * Shared skeleton for the account-status screens (application-submitted, verification-pending,
 * approved, rejected, documents-expired, account-suspended): "OneLocal Rider" header · title stack ·
 * gradient avatar illustration card with a status badge · secondary block · pinned CTA.
 */
export const StatusShell = ({ title, subtitle, tone, icon, badge, cardBackground = colors.surface, cardBorder = colors.border, badgeTone = 'dark', flatAvatar, showBack = true, onSignOut, signingOut, footer, secondary, children }: StatusShellProps) => {
  const canGoBack = showBack && router.canGoBack();
  return (
    <Screen
      scroll
      footer={
        <View style={styles.footer}>
          {footer}
          {secondary || onSignOut ? (
            <View style={styles.footerRow}>
              {secondary}
              {onSignOut ? <GhostButton label="Sign out" icon="log-out" iconPosition="left" color={colors.textSecondary} onPress={onSignOut} disabled={signingOut} /> : null}
            </View>
          ) : null}
        </View>
      }>
      <AppHeader title="OneLocal Rider" showBack={canGoBack} onBack={() => router.back()} onHelp={() => router.push('/support' as never)} />
      <View style={styles.body}>
        <View style={styles.titleStack}>
          <AppText variant="display" accessibilityRole="header">
            {title}
          </AppText>
          <AppText variant="body" color="textSecondary">
            {subtitle}
          </AppText>
        </View>

        <View style={[styles.illustration, { backgroundColor: cardBackground, borderColor: cardBorder }]}>
          <View style={styles.avatar}>
            {flatAvatar ? (
              <View style={[styles.avatarFill, { backgroundColor: colors.lime }]}>
                <Icon name={icon} size={50} strokeWidth={2} />
              </View>
            ) : (
              <LinearGradient colors={GRADIENTS[tone]} locations={GRADIENT_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarFill}>
                <Icon name={icon} size={44} strokeWidth={2} />
              </LinearGradient>
            )}
          </View>
          <View style={[styles.badge, { backgroundColor: badgeTone === 'danger' ? colors.danger : colors.ink }]}>
            <AppText variant="label" color="surface" uppercase style={styles.badgeText}>
              {badge}
            </AppText>
          </View>
        </View>

        {children}
      </View>
    </Screen>
  );
};

/** Solid red CTA (rejected / account-suspended): radius 28, Manrope ExtraBold 16 white, no arrow. */
export const DangerCta = ({ label, onPress, loading, disabled }: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
    disabled={disabled || loading}
    onPress={onPress}
    style={({ pressed }) => [styles.danger, (pressed || disabled || loading) && styles.dangerPressed]}>
    <AppText variant="buttonSecondary" color="surface">
      {loading ? 'Please wait…' : label}
    </AppText>
  </Pressable>
);

export interface BulletRow {
  icon: IconName;
  text: string;
  /** Figma: application-submitted rows are Bold 13, solo bullets SemiBold 13, store bullets ExtraBold 12. */
  variant?: TypographyToken;
  size?: number;
  muted?: boolean;
}

/** Neutral #F1F1EF list card (timeline / check-bullets) — rows of a 16px icon + short text. */
export const BulletCard = ({ rows, radius = 40, gap = spacing.lg }: { rows: BulletRow[]; radius?: number; gap?: number }) => (
  <View style={[styles.bullets, { borderRadius: radius, gap }]}>
    {rows.map((r, i) => {
      const size = r.size ?? 13;
      return (
        <View key={`${r.text}-${i}`} style={styles.bulletRow}>
          <Icon name={r.icon} size={16} strokeWidth={2.5} color={r.muted ? 'textSecondary' : 'ink'} />
          <AppText variant={r.variant ?? (r.muted ? 'bodySemi' : 'bodyBold')} color={r.muted ? 'textSecondary' : 'ink'} style={[styles.bulletText, { fontSize: size, lineHeight: Math.round(size * 1.4) }]}>
            {r.text}
          </AppText>
        </View>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  body: { gap: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.x3l },
  titleStack: { gap: spacing.sm },
  illustration: { borderWidth: 2, borderRadius: 32, padding: spacing.gutter, gap: spacing.xxl, alignItems: 'center', alignSelf: 'stretch' },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: colors.border, overflow: 'hidden' },
  avatarFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: 13.5, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  badgeText: { fontSize: 11, lineHeight: 15 },
  footer: { gap: spacing.xs },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.lg },
  danger: { height: 56, borderRadius: 28, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.gutter, alignSelf: 'stretch', ...shadows.soft },
  dangerPressed: { opacity: 0.85 },
  bullets: { backgroundColor: colors.surfaceMuted, padding: spacing.xxl, alignSelf: 'stretch' },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  bulletText: { flex: 1 },
});
