import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, shadows, spacing, type TypographyToken } from '@/theme';
import { AppText } from '@/components/ui';

export interface TintedButtonProps {
  label: string;
  background: string;
  color?: string;
  radius?: number;
  height?: number;
  textVariant?: TypographyToken;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Solid coloured pill from the exception screens (REPORT WRONG BARCODE #FF4444, REPORT INCOMPLETE #FFB300, BACK TO HOME #121212). */
export const TintedButton = ({ label, background, color = colors.surface, radius = 26, height = 54, textVariant = 'statusTime', onPress, loading, disabled, style }: TintedButtonProps) => {
  const inactive = !!disabled || !!loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: background, borderRadius: radius, height }, inactive && styles.disabled, pressed && styles.pressed, style]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <AppText variant={textVariant} color={color}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', paddingHorizontal: spacing.gutter, ...shadows.soft },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
