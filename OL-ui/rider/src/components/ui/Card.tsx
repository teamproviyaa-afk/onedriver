import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius as radii, spacing } from '@/theme';

export interface CardProps {
  children: ReactNode;
  /** Figma cards use 20 / 32 / 40 / 43 / 46.5 / 48 — pass the screen's exact value. */
  radius?: number;
  padding?: number;
  background?: string;
  borderColor?: string;
  borderWidth?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  gap?: number;
  row?: boolean;
  accessibilityLabel?: string;
}

/** White card, 2px #DBE0D6 border — the base surface across the Figma screens. */
export const Card = ({ children, radius = radii.card, padding = spacing.x3l, background = colors.surface, borderColor = colors.border, borderWidth = 2, style, onPress, gap, row, accessibilityLabel }: CardProps) => {
  const base: ViewStyle = { borderRadius: radius, padding, backgroundColor: background, borderColor, borderWidth, gap, flexDirection: row ? 'row' : 'column' };
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [styles.base, base, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.base, base, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  base: { alignSelf: 'stretch' },
  pressed: { opacity: 0.9 },
});
