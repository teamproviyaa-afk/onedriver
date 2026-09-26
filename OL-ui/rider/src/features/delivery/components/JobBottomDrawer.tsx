import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';
import { Screen } from '@/components/ui';

export interface JobBottomDrawerProps {
  children: ReactNode;
  padding?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

/** White bottom drawer from the Figma job screens: top radius 24, 2px #DBE0D6 top border, padding 24, gap 16. */
export const JobBottomDrawer = ({ children, padding = spacing.gutter, gap = spacing.xxl, style }: JobBottomDrawerProps) => {
  const insets = useSafeAreaInsets();
  return <View style={[styles.drawer, { padding, gap, paddingBottom: Math.max(insets.bottom, spacing.xxl) }, style]}>{children}</View>;
};

/** Pass as `footerStyle` to `Screen` so the drawer sits flush with the screen edges. */
export const drawerFooterStyle: ViewStyle = { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0 };

export interface JobDrawerLayoutProps {
  children: ReactNode;
  drawer: ReactNode;
  /** Scroll the top area (default) or let it flex to fill (map screens). */
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  drawerPadding?: number;
  background?: string;
}

/**
 * Top area (16px gutter, 16px gap) + pinned bottom drawer — the shell shared by the
 * exception, navigation-handoff, arrival, delivery-confirmation and proof screens.
 */
export const JobDrawerLayout = ({ children, drawer, scroll = true, contentStyle, drawerPadding, background }: JobDrawerLayoutProps) => (
  <Screen padded={false} edges={['top']} background={background} footer={<JobBottomDrawer padding={drawerPadding}>{drawer}</JobBottomDrawer>} footerStyle={drawerFooterStyle}>
    {scroll ? (
      <ScrollView style={styles.flex} contentContainerStyle={[styles.top, contentStyle]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    ) : (
      <View style={[styles.flex, contentStyle]}>{children}</View>
    )}
  </Screen>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexGrow: 1, paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl, paddingBottom: spacing.xxl, gap: spacing.xxl },
  drawer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    alignSelf: 'stretch',
  },
});
