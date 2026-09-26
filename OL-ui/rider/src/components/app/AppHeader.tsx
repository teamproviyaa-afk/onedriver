import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { spacing } from '@/theme';
import { AppText, IconButton } from '@/components/ui';

export interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  backIcon?: 'arrow-left' | 'chevron-left';
  right?: ReactNode;
  onHelp?: () => void;
  align?: 'center' | 'left';
}

/**
 * Screen header from Figma: circular white back button (soft shadow) · centered
 * Manrope ExtraBold 18/20 title · optional help / right slot.
 */
export const AppHeader = ({ title, subtitle, onBack, showBack = true, backIcon = 'arrow-left', right, onHelp, align = 'center' }: AppHeaderProps) => {
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/home')));
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {showBack ? <IconButton icon={backIcon} accessibilityLabel="Go back" onPress={back} /> : <View style={styles.spacer} />}
        {title && align === 'center' ? (
          <AppText variant="h4" style={styles.title} numberOfLines={1}>
            {title}
          </AppText>
        ) : (
          <View style={styles.title} />
        )}
        {right ?? (onHelp ? <IconButton icon="help-circle" accessibilityLabel="Help and support" onPress={onHelp} /> : <View style={styles.spacer} />)}
      </View>
      {title && align === 'left' ? <AppText variant="h1">{title}</AppText> : null}
      {subtitle ? (
        <AppText variant="body" color="textSecondary" align={align}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg, alignSelf: 'stretch', paddingTop: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  title: { flex: 1, textAlign: 'center' },
  spacer: { width: 40, height: 40 },
});
