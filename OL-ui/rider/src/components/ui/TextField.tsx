import { forwardRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { colors, fontFamily, radius, spacing } from '@/theme';
import { AppText } from './AppText';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  helper?: string;
  error?: string | null;
  prefix?: ReactNode;
  suffix?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  /** Figma inputs use a 2px #121212 border on the ui-kit and #DBE0D6 on onboarding forms. */
  borderTone?: 'strong' | 'soft';
  height?: number;
}

/** Form input from rider-ui-kit: white, 2px border, radius 12, Manrope SemiBold 14. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField({ label, helper, error, prefix, suffix, containerStyle, borderTone = 'soft', height = 56, style, editable = true, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.borderStrong : borderTone === 'strong' ? colors.borderStrong : colors.border;
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <AppText variant="titleSm" color="ink">
          {label}
        </AppText>
      ) : null}
      <View style={[styles.field, { borderColor, height, opacity: editable ? 1 : 0.6 }]}>
        {prefix ? <View style={styles.affix}>{prefix}</View> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={label ?? rest.placeholder}
          editable={editable}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, style]}
        />
        {suffix ? <View style={styles.affix}>{suffix}</View> : null}
      </View>
      {error ? (
        <AppText variant="bodySm" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="bodySm" color="textSecondary">
          {helper}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: spacing.md, alignSelf: 'stretch' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  input: { flex: 1, fontFamily: fontFamily.manropeSemiBold, fontSize: 14, color: colors.ink, paddingVertical: 0, height: '100%' },
  affix: { alignItems: 'center', justifyContent: 'center' },
});
