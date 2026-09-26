import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors, dimensions, radius, shadows, spacing, typography } from '@/theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface BaseButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName | null;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
  compact?: boolean;
  children?: ReactNode;
}

const pressed = (p: boolean): ViewStyle => (p ? { opacity: 0.85, transform: [{ scale: 0.99 }] } : {});

/** Dark pill (#0C1F15) with lime Inter Bold label + arrow — the one primary action per screen. */
export const PrimaryButton = ({ label, loading, disabled, icon = 'arrow-right', iconPosition = 'right', style, fullWidth = true, compact, ...rest }: BaseButtonProps) => {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      {...rest}
      style={({ pressed: p }) => [styles.primary, compact && styles.compact, fullWidth && styles.fullWidth, inactive && styles.disabled, pressed(p), style]}>
      {loading ? (
        <ActivityIndicator color={colors.limeBright} />
      ) : (
        <View style={styles.row}>
          {icon && iconPosition === 'left' ? <Icon name={icon} size={14} color="limeBright" strokeWidth={2.5} /> : null}
          <AppText variant="buttonPrimary" color="limeBright" numberOfLines={1}>
            {label}
          </AppText>
          {icon && iconPosition === 'right' ? (
            <View style={styles.arrowWrap}>
              <Icon name={icon} size={14} color="limeBright" strokeWidth={2.5} />
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
};

/** White pill with soft shadow and Manrope ExtraBold ink label (GO OFFLINE, DECLINE). */
export const SecondaryButton = ({ label, loading, disabled, icon = null, iconPosition = 'right', style, fullWidth = true, compact, ...rest }: BaseButtonProps) => {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      {...rest}
      style={({ pressed: p }) => [styles.secondary, compact && styles.compact, fullWidth && styles.fullWidth, inactive && styles.disabled, pressed(p), style]}>
      {loading ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <View style={styles.row}>
          {icon && iconPosition === 'left' ? <Icon name={icon} size={16} color="inkSoft" /> : null}
          <AppText variant="buttonSecondary" color="inkSoft" numberOfLines={1}>
            {label}
          </AppText>
          {icon && iconPosition === 'right' ? <Icon name={icon} size={16} color="inkSoft" /> : null}
        </View>
      )}
    </Pressable>
  );
};

/** White, 2px ink border, radius 12 — compact secondary (Reject, Retake). */
export const OutlineButton = ({ label, loading, disabled, icon = null, iconPosition = 'left', style, fullWidth = false, compact = true, ...rest }: BaseButtonProps) => {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      {...rest}
      style={({ pressed: p }) => [styles.outline, !compact && styles.outlineTall, fullWidth && styles.fullWidth, inactive && styles.disabled, pressed(p), style]}>
      {loading ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <View style={styles.row}>
          {icon && iconPosition === 'left' ? <Icon name={icon} size={16} /> : null}
          <AppText variant="buttonSm">{label}</AppText>
          {icon && iconPosition === 'right' ? <Icon name={icon} size={16} /> : null}
        </View>
      )}
    </Pressable>
  );
};

/** Red neo-brutalist button (Account Blocked, SOS, Report). */
export const DestructiveButton = ({ label, loading, disabled, icon = null, iconPosition = 'left', style, fullWidth = true, compact, ...rest }: BaseButtonProps) => {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      {...rest}
      style={({ pressed: p }) => [styles.destructive, compact && styles.compact, fullWidth && styles.fullWidth, inactive && styles.disabled, p && styles.destructivePressed, style]}>
      {loading ? (
        <ActivityIndicator color={colors.surface} />
      ) : (
        <View style={styles.row}>
          {icon && iconPosition === 'left' ? <Icon name={icon} size={18} color="surface" /> : null}
          <AppText variant="buttonSecondary" color="surface">
            {label}
          </AppText>
          {icon && iconPosition === 'right' ? <Icon name={icon} size={18} color="surface" /> : null}
        </View>
      )}
    </Pressable>
  );
};

/** Text-only link button (SKIP, Resend OTP, Change number). */
export const GhostButton = ({ label, disabled, icon = null, iconPosition = 'right', style, color = 'ink', underline, ...rest }: BaseButtonProps & { color?: string; underline?: boolean }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} hitSlop={8} {...rest} style={({ pressed: p }) => [styles.ghost, disabled && styles.disabled, pressed(p), style]}>
    <View style={styles.row}>
      {icon && iconPosition === 'left' ? <Icon name={icon} size={16} color={color} /> : null}
      <AppText variant="bodyBold" color={color} style={underline ? styles.underline : undefined}>
        {label}
      </AppText>
      {icon && iconPosition === 'right' ? <Icon name={icon} size={16} color={color} /> : null}
    </View>
  </Pressable>
);

export interface IconButtonProps extends Omit<PressableProps, 'style'> {
  icon: IconName;
  size?: number;
  iconSize?: number;
  color?: string;
  background?: string;
  bordered?: boolean;
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
}

/** Circular icon button (back / help / close) — white with soft shadow per Figma. */
export const IconButton = ({ icon, size = 40, iconSize = 16, color = colors.ink, background = colors.surface, bordered = false, shadow = true, style, ...rest }: IconButtonProps) => (
  <Pressable
    accessibilityRole="button"
    hitSlop={6}
    {...rest}
    style={({ pressed: p }) => [
      styles.iconButton,
      { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
      bordered && styles.iconButtonBorder,
      shadow && shadows.soft,
      pressed(p),
      style,
    ]}>
    <Icon name={icon} size={iconSize} color={color} strokeWidth={2.25} />
  </Pressable>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  fullWidth: { alignSelf: 'stretch' },
  compact: { height: 48 },
  disabled: { opacity: 0.5 },
  underline: { textDecorationLine: 'underline' },
  arrowWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingLeft: spacing.xs },
  primary: {
    height: dimensions.primaryButtonHeight,
    borderRadius: radius.pill,
    backgroundColor: colors.darkAction,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    ...shadows.primaryButton,
  },
  secondary: {
    height: dimensions.primaryButtonHeight,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    ...shadows.soft,
  },
  outline: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineTall: { height: dimensions.primaryButtonHeight, paddingVertical: 0 },
  destructive: {
    height: dimensions.primaryButtonHeight,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.gutter,
    ...shadows.destructive,
  },
  destructivePressed: { transform: [{ translateY: 2 }], opacity: 0.95 },
  ghost: { paddingVertical: spacing.md, paddingHorizontal: spacing.xs, alignItems: 'center', justifyContent: 'center', minHeight: dimensions.minTouchTarget },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  iconButtonBorder: { borderWidth: 2, borderColor: colors.border },
});

export const buttonTextStyle = typography.buttonPrimary;
