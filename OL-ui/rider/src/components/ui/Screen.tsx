import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { colors, spacing } from '@/theme';

export interface ScreenProps {
  children: ReactNode;
  /** Pinned below the content, above the home indicator (Figma "bottom-content"). */
  footer?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  background?: string;
  edges?: Edge[];
  contentStyle?: ViewStyle;
  footerStyle?: ViewStyle;
  keyboard?: boolean;
  statusBarStyle?: 'dark' | 'light';
  testID?: string;
}

/**
 * Screen shell: safe areas, background, optional scrolling body and a pinned footer.
 * Layouts are flex-based (never absolute page coordinates) so they adapt to any phone.
 */
export const Screen = ({ children, footer, scroll = false, padded = true, background = colors.background, edges = ['top', 'left', 'right'], contentStyle, footerStyle, keyboard = false, statusBarStyle = 'dark', testID }: ScreenProps) => {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[padded && styles.padded, styles.scrollContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded, contentStyle]}>{children}</View>
  );
  const content = keyboard ? (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: background }]} edges={edges} testID={testID}>
      <StatusBar style={statusBarStyle} />
      {content}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md }, footerStyle]}>{footer}</View>
      ) : (
        <View style={{ height: edges.includes('bottom') ? 0 : insets.bottom }} />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { paddingHorizontal: spacing.gutter },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.gutter },
  footer: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, gap: spacing.lg },
});
