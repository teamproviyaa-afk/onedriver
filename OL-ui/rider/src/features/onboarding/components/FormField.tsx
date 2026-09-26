import { forwardRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { colors, fontFamily, spacing } from '@/theme';
import { AppText } from '@/components/ui';

export interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  helper?: string;
  suffix?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Onboarding input from Figma (address-setup / store-link / vehicle): uppercase Manrope ExtraBold 12
 * label, white box with 2px #DBE0D6 border, radius 26, height 52, Manrope SemiBold 15 value.
 */
export const FormField = forwardRef<TextInput, FormFieldProps>(function FormField({ label, error, helper, suffix, containerStyle, editable = true, style, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.borderStrong : colors.border;
  return (
    <View style={[styles.wrap, containerStyle]}>
      <AppText variant="label" uppercase>
        {label}
      </AppText>
      <View style={[styles.box, { borderColor }, !editable && styles.readOnly]}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={label}
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
        {suffix ? <View style={styles.suffix}>{suffix}</View> : null}
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
  wrap: { gap: spacing.sm, alignSelf: 'stretch' },
  box: { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: 26, borderWidth: 2, backgroundColor: colors.surface, paddingHorizontal: spacing.xxl, gap: spacing.md },
  readOnly: { backgroundColor: colors.surfaceMuted },
  input: { flex: 1, fontFamily: fontFamily.manropeSemiBold, fontSize: 15, color: colors.ink, paddingVertical: 0, height: '100%' },
  suffix: { alignItems: 'center', justifyContent: 'center' },
});
