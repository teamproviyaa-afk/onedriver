import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, IconButton, StepProgress } from '@/components/ui';

export interface OnboardingHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  backIcon?: 'arrow-left' | 'chevron-left';
  /** Figma solo flow "STEP 3 OF 4" pill between the back button and HELP. */
  step?: { current: number; total: number };
  /** Also draw the lime StepProgress rail under the title. */
  rail?: boolean;
  onHelp?: () => void;
  right?: ReactNode;
}

const defaultBack = () => (router.canGoBack() ? router.back() : router.replace('/' as never));
const defaultHelp = () => router.push('/support' as never);

/** White pill "HELP" from the onboarding screens (border 2 #DBE0D6, radius 14, Manrope Bold 12). */
export const HelpPill = ({ onPress, label = 'HELP' }: { onPress: () => void; label?: string }) => (
  <Pressable accessibilityRole="button" accessibilityLabel="Help and support" hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
    <AppText variant="bodyBoldSm">{label}</AppText>
  </Pressable>
);

/**
 * Onboarding header from Figma: circular back button · optional "STEP x OF y" pill · HELP pill,
 * then the 28px ExtraBold title and the muted 14px subtitle (title-stack gap 4, pt 12).
 */
export const OnboardingHeader = ({ title, subtitle, onBack, showBack = true, backIcon = 'arrow-left', step, rail, onHelp, right }: OnboardingHeaderProps) => (
  <View style={styles.wrap}>
    <View style={styles.nav}>
      {showBack ? <IconButton icon={backIcon} accessibilityLabel="Go back" onPress={onBack ?? defaultBack} /> : <View style={styles.spacer} />}
      {step ? (
        <View style={styles.pill} accessibilityRole="text" accessibilityLabel={`Step ${step.current} of ${step.total}`}>
          <AppText variant="bodyBoldSm" uppercase>{`STEP ${step.current} OF ${step.total}`}</AppText>
        </View>
      ) : (
        <View style={styles.flex} />
      )}
      {right ?? <HelpPill onPress={onHelp ?? defaultHelp} />}
    </View>
    <View style={styles.titleStack}>
      <AppText variant="display" style={styles.title} accessibilityRole="header">
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="body" color="textSecondary">
          {subtitle}
        </AppText>
      ) : null}
    </View>
    {rail && step ? <StepProgress step={step.current} total={step.total} /> : null}
  </View>
);

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, alignSelf: 'stretch', paddingTop: spacing.lg },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  flex: { flex: 1 },
  spacer: { width: 40, height: 40 },
  pill: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 14, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 32, justifyContent: 'center' },
  pressed: { opacity: 0.85 },
  titleStack: { gap: spacing.xs, paddingTop: spacing.lg },
  title: { lineHeight: 34 },
});
