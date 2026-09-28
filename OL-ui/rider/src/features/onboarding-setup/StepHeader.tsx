import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, Icon } from '@/components/ui';
import { colors, shadows, spacing } from '@/theme';
import type { RiderType } from '@/types';

export type SetupStepKey = 'categories' | 'stores' | 'acceptance' | 'priority' | 'payout';

/** "STEP x OF y" labels per Figma variant: store path 1/5…4/5, solo path 1/4…3/4. */
export const stepPosition = (riderType: RiderType | undefined, key: SetupStepKey): { step: number; total: number } => {
  if (riderType === 'store') {
    const order: SetupStepKey[] = ['categories', 'stores', 'acceptance', 'priority'];
    return { step: Math.max(1, order.indexOf(key) + 1), total: 5 };
  }
  const order: SetupStepKey[] = ['categories', 'acceptance', 'payout'];
  return { step: Math.max(1, order.indexOf(key) + 1), total: 4 };
};

export interface StepHeaderProps {
  step: number;
  total: number;
  title: string;
  subtitle: string;
  /** payout-bank uses a 24px title (h1); every other setup step is 28px (display). */
  titleVariant?: 'display' | 'h1';
  onBack?: () => void;
  /** Where the back button lands when there is no history (deep link / reload). */
  backFallback?: string;
  /** Editing outside onboarding (e.g. from Profile) — no "STEP x OF y" pill. */
  hideStep?: boolean;
}

/**
 * Onboarding step chrome from the Figma store-/solo- screens: white squircle back
 * button · "STEP 1 OF 5" pill · HELP pill, then the 28px title + secondary subtitle.
 */
export const StepHeader = ({ step, total, title, subtitle, titleVariant = 'display', onBack, backFallback = '/onboarding/type', hideStep }: StepHeaderProps) => {
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace(backFallback as never)));
  return (
    <View style={styles.header}>
      <View style={styles.nav}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={back} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Icon name="chevron-left" size={16} strokeWidth={2.5} />
        </Pressable>
        {hideStep ? (
          <View />
        ) : (
          <View style={styles.pill} accessibilityRole="text" accessibilityLabel={`Step ${step} of ${total}`}>
            <AppText variant="label" uppercase>
              {`STEP ${step} OF ${total}`}
            </AppText>
          </View>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Help and support" hitSlop={8} onPress={() => router.push('/support' as never)} style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
          <AppText variant="label" uppercase>
            HELP
          </AppText>
        </Pressable>
      </View>
      <View style={styles.titleStack}>
        <AppText variant={titleVariant} accessibilityRole="header">
          {title}
        </AppText>
        <AppText variant="body" color="textSecondary">
          {subtitle}
        </AppText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { gap: spacing.lg, alignSelf: 'stretch', paddingTop: spacing.lg },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { backgroundColor: colors.surface, borderRadius: 18, padding: spacing.base, ...shadows.soft },
  pill: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 14, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 32, justifyContent: 'center' },
  pressed: { opacity: 0.85 },
  titleStack: { gap: spacing.sm },
});
