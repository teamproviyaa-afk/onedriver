import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, Icon, Screen } from '@/components/ui';
import { colors, spacing } from '@/theme';
import type { PayoutNameMatch } from '@/types';
import { StepHeader } from './StepHeader';

export type PayoutTab = 'bank' | 'upi';

export interface PayoutShellProps {
  tab: PayoutTab;
  title: string;
  subtitle: string;
  /** payout-bank title is 24px (h1); payout-upi is 28px (display). */
  titleVariant?: 'display' | 'h1';
  step: number;
  total: number;
  footer: ReactNode;
  children: ReactNode;
  /** Changing the payout account after onboarding (Profile / Withdraw): no step pill, tabs keep the mode. */
  manage?: boolean;
}

const TABS: { value: PayoutTab; label: string; route: string }[] = [
  { value: 'bank', label: 'Bank Account', route: '/onboarding/payout/bank' },
  { value: 'upi', label: 'UPI Connection', route: '/onboarding/payout/upi' },
];

/** Shared payout-bank / payout-upi shell: step header + BANK / UPI tab switch (tabs swap routes with replace). */
export const PayoutShell = ({ tab, title, subtitle, titleVariant = 'display', step, total, footer, children, manage }: PayoutShellProps) => (
  <Screen scroll keyboard footer={footer}>
    <View style={styles.body}>
      <StepHeader step={step} total={total} title={title} subtitle={subtitle} titleVariant={titleVariant} backFallback={manage ? '/profile' : '/onboarding/acceptance'} hideStep={manage} />
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((t) => {
          const active = t.value === tab;
          return (
            <Pressable
              key={t.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t.label}
              onPress={() => {
                if (!active) router.replace((manage ? `${t.route}?mode=manage` : t.route) as never);
              }}
              style={[styles.tab, active ? styles.tabActive : styles.tabInactive]}>
              <AppText variant="chip" color={active ? 'ink' : 'textSecondary'}>
                {t.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {children}
    </View>
  </Screen>
);

/** Light-green "Encrypted secure deposit line" trust badge (payout-bank): Manrope Bold 11. */
export const TrustBadge = ({ text }: { text: string }) => (
  <View style={styles.trust}>
    <Icon name="shield-check" size={16} strokeWidth={2.5} />
    <AppText variant="bodyBoldSm" style={styles.trustText}>
      {text}
    </AppText>
  </View>
);

/** Verified linked account badge (payout-upi / payout-bank after validation). */
export const VerifiedBadge = ({ label, name, note }: { label: string; name: string; note?: string }) => (
  <View style={styles.verified} accessibilityLiveRegion="polite">
    <View style={styles.verifiedDot}>
      <Icon name="check" size={14} strokeWidth={3} />
    </View>
    <View style={styles.verifiedText}>
      <AppText variant="label" color="textSecondary" uppercase style={styles.verifiedLabel}>
        {label}
      </AppText>
      <AppText variant="title">{name}</AppText>
      {note ? (
        <AppText variant="bodySm" color="textSecondary">
          {note}
        </AppText>
      ) : null}
    </View>
  </View>
);

/** Why the provider rejected the account (inactive account, or someone else's name). */
export const PayoutProblem = ({ text }: { text: string }) => (
  <View style={styles.problem} accessibilityRole="alert" accessibilityLiveRegion="assertive">
    <Icon name="alert-triangle" size={18} color={colors.danger} />
    <AppText variant="bodyBoldSm" color="danger" style={styles.problemText}>
      {text}
    </AppText>
  </View>
);

/** Copy for the badge when the bank name only partly matches the rider's legal name. */
export const nameMatchNote = (match: PayoutNameMatch | undefined): string | undefined =>
  match === 'partial' ? 'The name at the bank partly matches your profile name. Payouts are allowed.' : undefined;

const styles = StyleSheet.create({
  body: { gap: spacing.x3l, paddingBottom: spacing.x3l },
  tabs: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderWidth: 2, borderColor: colors.border, borderRadius: 23, padding: spacing.xs, alignSelf: 'stretch' },
  tab: { flex: 1, paddingVertical: spacing.base, borderRadius: 19, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  tabActive: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border },
  tabInactive: { opacity: 0.6 },
  trust: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, padding: spacing.lg, borderRadius: 27, backgroundColor: colors.surfaceLime, borderWidth: 2, borderColor: colors.border, alignSelf: 'stretch' },
  trustText: { flex: 1, fontSize: 11, lineHeight: 15 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.xxl, borderRadius: 34, backgroundColor: colors.surfaceMuted, borderWidth: 2, borderColor: colors.border, alignSelf: 'stretch' },
  verifiedDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.lime, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  verifiedText: { flex: 1, gap: spacing.xxs },
  verifiedLabel: { fontSize: 11, lineHeight: 15 },
  problem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg, borderRadius: 21, backgroundColor: colors.surfaceDanger, borderWidth: 2, borderColor: colors.border, alignSelf: 'stretch' },
  problemText: { flex: 1 },
});
