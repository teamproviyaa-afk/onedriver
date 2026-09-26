import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/theme';

export interface JobBottomDrawerProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** White bottom drawer from current-job / active-delivery: top radius 24, 2px #DBE0D6 top border, pad 20/24, gap 16. */
export const JobBottomDrawer = ({ children, style }: JobBottomDrawerProps) => {
  const insets = useSafeAreaInsets();
  return <View style={[styles.drawer, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md }, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  drawer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderTopWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.x3l,
    gap: spacing.xxl,
    alignSelf: 'stretch',
  },
});
