import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface CheckboxProps {
  checked: boolean;
  onChange?: (v: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** ui-kit: 24px, radius 6, border 2 #121212; at-pickup checklist: radius 10, border #DBE0D6. */
  size?: number;
  radius?: number;
  borderColor?: string;
  labelRight?: boolean;
}

/** Lime checkbox from rider-ui-kit (24×24, #76EC00 fill, 2px border, check icon). */
export const Checkbox = ({ checked, onChange, label, description, disabled, style, size = 24, radius: r = radius.xs, borderColor = colors.borderStrong, labelRight = true }: CheckboxProps) => {
  const box = (
    <View style={[styles.box, { width: size, height: size, borderRadius: r, borderColor, backgroundColor: checked ? colors.lime : colors.surface }]}>
      {checked ? <Icon name="check" size={Math.round(size / 2)} strokeWidth={3} /> : null}
    </View>
  );
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      disabled={disabled || !onChange}
      onPress={() => onChange?.(!checked)}
      style={[styles.row, disabled && styles.disabled, style]}>
      {labelRight ? box : null}
      {label ? (
        <View style={styles.labelCol}>
          <AppText variant="bodySemi">{label}</AppText>
          {description ? (
            <AppText variant="bodySm" color="textSecondary">
              {description}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {!labelRight ? box : null}
    </Pressable>
  );
};

export interface RadioProps {
  selected: boolean;
  onPress?: () => void;
  size?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** 20px radio: 2px ring, filled ink dot when selected (Figma radio-outer / radio-selector). */
export const Radio = ({ selected, onPress, size = 20, accessibilityLabel, style }: RadioProps) => (
  <Pressable accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={accessibilityLabel} onPress={onPress} disabled={!onPress} hitSlop={8} style={style}>
    <View style={[styles.radio, { width: size, height: size, borderRadius: size / 2, borderColor: selected ? colors.ink : colors.border }]}>
      {selected ? <View style={[styles.radioDot, { width: size / 2, height: size / 2, borderRadius: size / 4 }]} /> : null}
    </View>
  </Pressable>
);

export interface ToggleProps {
  value: boolean;
  onValueChange?: (v: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}

/** 52×32 switch: lime track when on, ink knob (Figma store-assignment switch-track). */
export const Toggle = ({ value, onValueChange, accessibilityLabel, disabled }: ToggleProps) => (
  <Pressable
    accessibilityRole="switch"
    accessibilityState={{ checked: value, disabled }}
    accessibilityLabel={accessibilityLabel}
    disabled={disabled}
    onPress={() => onValueChange?.(!value)}
    style={[styles.track, { backgroundColor: value ? colors.lime : colors.surfaceMuted, borderColor: value ? colors.borderStrong : colors.border }, disabled && styles.disabled]}>
    <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
  </Pressable>
);

export interface SelectableRowProps {
  selected: boolean;
  onPress: () => void;
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  control?: 'radio' | 'checkbox' | 'none';
  disabled?: boolean;
  badge?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Card-style option row used by onboarding pickers (rider type, categories, acceptance mode…). */
export const SelectableRow = ({ selected, onPress, title, subtitle, leading, trailing, control = 'radio', disabled, badge, radius: r = radius.xl, style }: SelectableRowProps) => (
  <Pressable
    accessibilityRole={control === 'checkbox' ? 'checkbox' : 'radio'}
    accessibilityState={{ selected, checked: selected, disabled }}
    accessibilityLabel={title}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.option,
      { borderRadius: r, borderColor: selected ? colors.borderStrong : colors.border, backgroundColor: selected ? colors.surfaceLime : colors.surface },
      pressed && styles.pressed,
      disabled && styles.disabled,
      style,
    ]}>
    {leading ? <View style={styles.leading}>{leading}</View> : null}
    <View style={styles.labelCol}>
      <View style={styles.titleRow}>
        <AppText variant="titleLg">{title}</AppText>
        {badge ? (
          <View style={styles.badge}>
            <AppText variant="labelXs" uppercase>
              {badge}
            </AppText>
          </View>
        ) : null}
      </View>
      {subtitle ? (
        <AppText variant="bodySm" color="textSecondary">
          {subtitle}
        </AppText>
      ) : null}
    </View>
    {trailing ?? (control === 'radio' ? <Radio selected={selected} /> : control === 'checkbox' ? <Checkbox checked={selected} size={24} radius={radius.xs} /> : null)}
  </Pressable>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, alignSelf: 'stretch' },
  box: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  labelCol: { flex: 1, gap: spacing.xxs },
  disabled: { opacity: 0.5 },
  radio: { borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  radioDot: { backgroundColor: colors.ink },
  track: { width: 52, height: 32, borderRadius: 16, borderWidth: 2, padding: 2, justifyContent: 'center' },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink },
  knobOn: { alignSelf: 'flex-end' },
  knobOff: { alignSelf: 'flex-start', backgroundColor: colors.textSecondary },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, borderWidth: 2, padding: spacing.xxl, alignSelf: 'stretch' },
  pressed: { opacity: 0.9 },
  leading: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  badge: { backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
});
