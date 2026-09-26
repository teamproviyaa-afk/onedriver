import { forwardRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { colors, fontFamily, spacing } from '@/theme';
import { AppText } from '@/components/ui';
import { INDIA_DIAL_CODE } from './phone';

export interface PillFieldProps extends TextInputProps {
  /** Uppercase Manrope Bold 14 label above the box (Figma "FULL NAME", "ENTER PHONE NUMBER"). */
  label?: string;
  error?: string | null;
  helper?: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  /** Figma shows entered values in Manrope Bold and placeholders in Manrope Medium. */
  boldValue?: boolean;
}

/**
 * Auth / onboarding input from screen-login, screen-register and screen-profile-setup:
 * white box, 2px #DBE0D6 border, height 56, radius 28, padding-x 16, gap 12.
 * (The ui-kit `TextField` is the radius-12 form input; this is the pill variant.)
 */
export const PillField = forwardRef<TextInput, PillFieldProps>(function PillField(
  { label, error, helper, prefix, suffix, containerStyle, boldValue = false, style, editable = true, value, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.lime : colors.border;
  const filled = typeof value === 'string' && value.length > 0;
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <AppText variant="bodyBold" uppercase>
          {label}
        </AppText>
      ) : null}
      <View style={[styles.box, { borderColor, opacity: editable ? 1 : 0.6 }]}>
        {prefix ? <View style={styles.affix}>{prefix}</View> : null}
        <TextInput
          ref={ref}
          value={value}
          placeholderTextColor={colors.textSecondary}
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
          style={[styles.input, boldValue && filled && styles.inputBold, style]}
        />
        {suffix ? <View style={styles.affix}>{suffix}</View> : null}
      </View>
      {error ? (
        <AppText variant="bodySm" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : helper ? (
        typeof helper === 'string' ? (
          <AppText variant="bodySm" color="textSecondary">
            {helper}
          </AppText>
        ) : (
          helper
        )
      ) : null}
    </View>
  );
});

export interface PhoneFieldProps extends Omit<PillFieldProps, 'prefix' | 'keyboardType' | 'maxLength'> {
  /** Show the flag emoji before the dial code (screen-login "🇮🇳 +91"). */
  flag?: boolean;
}

/** PillField with the static "+91" prefix and a 10-digit numeric keypad. */
export const PhoneField = forwardRef<TextInput, PhoneFieldProps>(function PhoneField({ flag = false, onChangeText, ...rest }, ref) {
  return (
    <PillField
      ref={ref}
      prefix={
        <AppText variant="bodyBold" style={styles.prefix} accessibilityLabel="Country code +91">
          {flag ? `🇮🇳 ${INDIA_DIAL_CODE}` : INDIA_DIAL_CODE}
        </AppText>
      }
      keyboardType="number-pad"
      textContentType="telephoneNumber"
      autoComplete="tel"
      maxLength={10}
      placeholder="98765 43210"
      onChangeText={(t) => onChangeText?.(t.replace(/\D/g, '').slice(0, 10))}
      {...rest}
    />
  );
});

const styles = StyleSheet.create({
  container: { gap: spacing.md, alignSelf: 'stretch' },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderRadius: 28,
    height: 56,
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  input: { flex: 1, fontFamily: fontFamily.manropeMedium, fontSize: 16, color: colors.ink, paddingVertical: 0, height: '100%' },
  inputBold: { fontFamily: fontFamily.manropeBold },
  prefix: { fontSize: 16, lineHeight: 22 },
  affix: { alignItems: 'center', justifyContent: 'center' },
});
