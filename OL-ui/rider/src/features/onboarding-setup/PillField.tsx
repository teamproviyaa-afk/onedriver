import { forwardRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, fontFamily, spacing } from '@/theme';

export interface PillFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  /** Rendered to the right of the input box on the same row (payout-upi "Verify"). */
  trailing?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

/** payout-bank / payout-upi input: 11px ExtraBold uppercase label + 52px white pill (radius 26, 2px #DBE0D6), Manrope SemiBold 14. */
export const PillField = forwardRef<TextInput, PillFieldProps>(function PillField({ label, error, trailing, containerStyle, style, editable = true, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.borderStrong : colors.border;
  return (
    <View style={[styles.container, containerStyle]}>
      <AppText variant="label" uppercase style={styles.label}>
        {label}
      </AppText>
      <View style={styles.row}>
        <View style={[styles.box, { borderColor, opacity: editable ? 1 : 0.6 }]}>
          <TextInput
            ref={ref}
            placeholderTextColor={colors.textMuted}
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
        </View>
        {trailing}
      </View>
      {error ? (
        <AppText variant="bodySm" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: spacing.md, alignSelf: 'stretch' },
  label: { fontSize: 11, lineHeight: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  box: { flex: 1, height: 52, borderRadius: 26, borderWidth: 2, backgroundColor: colors.surface, paddingLeft: spacing.xxl, paddingRight: spacing.lg, justifyContent: 'center' },
  input: { fontFamily: fontFamily.manropeSemiBold, fontSize: 14, color: colors.ink, paddingVertical: 0, height: '100%' },
});
