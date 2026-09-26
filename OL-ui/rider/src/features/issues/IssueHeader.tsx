import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { spacing } from '@/theme';
import { AppText, IconButton } from '@/components/ui';

export interface IssueHeaderProps {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}

/**
 * Screen header shared by the delivery-failed / customer-unavailable / wrong-address /
 * safety-exception frames: 36px white chevron button (soft shadow) followed by a
 * left-aligned Manrope ExtraBold 20 title (AppHeader centres its title, these frames do not).
 */
export const IssueHeader = ({ title, onBack, right }: IssueHeaderProps) => (
  <View style={styles.row}>
    <IconButton icon="chevron-left" size={36} iconSize={20} accessibilityLabel="Go back" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/home' as never)))} />
    <AppText variant="h3" numberOfLines={1} style={styles.title}>
      {title}
    </AppText>
    {right}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.md, alignSelf: 'stretch' },
  title: { flex: 1 },
});
