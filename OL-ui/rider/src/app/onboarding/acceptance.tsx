import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, Icon, PrimaryButton, Screen, toast } from '@/components/ui';
import { StepHeader, stepPosition } from '@/features/onboarding-setup/StepHeader';
import { getDataProvider } from '@/providers';
import { useOnboardingStore } from '@/stores';
import { colors, spacing } from '@/theme';
import { ApiError, type AcceptanceMode } from '@/types';

const STORE_COPY = {
  subtitle: 'Configure how you receive your incoming store deliveries.',
  auto: { title: 'Auto-Accept Mode', body: 'Seamlessly chains orders. Instantly matches store payouts without rider interaction. Keep riding without looking at the screen.' },
  manual: { title: 'Manual Accept', body: 'Receive alerts for incoming routes. You have a 30-second window to accept or decline. Unaccepted orders flow to next rider.' },
  info: 'Acceptance mode settings can be toggled any time from your rider profile settings menu.',
  cta: 'Set Acceptance Mode',
};
const SOLO_COPY = {
  subtitle: 'Choose how incoming delivery orders are assigned and accepted.',
  auto: { title: 'Auto-Accept', body: 'Orders are assigned immediately. Best for non-stop earnings and maximum trip efficiency in busy hubs.' },
  manual: { title: 'Manual-Accept', body: 'Manually review and accept each booking. Gives full control but might result in fewer overall matching pings.' },
  info: 'You can change your job acceptance mode anytime in your Profile Settings after registration.',
  cta: 'Apply Mode',
};

/** Onboarding — Acceptance Mode (store 3/5 · solo 2/4): Auto-Accept (recommended) vs Manual (30 s window). */
export default function AcceptanceScreen() {
  const riderType = useOnboardingStore((s) => s.riderType);
  const draft = useOnboardingStore((s) => s.acceptance);
  const categories = useOnboardingStore((s) => s.categories);
  const multiStore = useOnboardingStore((s) => s.multiStore);
  const storeIds = useOnboardingStore((s) => s.storeIds);
  const patch = useOnboardingStore((s) => s.patch);
  const complete = useOnboardingStore((s) => s.complete);
  const [mode, setMode] = useState<AcceptanceMode>(draft ?? 'auto');
  const [busy, setBusy] = useState(false);

  const isStore = riderType === 'store';
  const copy = isStore ? STORE_COPY : SOLO_COPY;
  const { step, total } = stepPosition(riderType, 'acceptance');

  const onContinue = async () => {
    setBusy(true);
    try {
      await getDataProvider().setPreferences({ categories, acceptance: mode, multiStore: isStore ? multiStore : false, storeIds: isStore ? storeIds : [] });
      patch({ acceptance: mode });
      complete('acceptance');
      router.push((isStore ? '/onboarding/priority' : '/onboarding/payout/bank') as never);
    } catch (e) {
      toast.error(ApiError.is(e) ? e.detail : 'Could not save your preferences. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const modes: { id: AcceptanceMode; title: string; body: string; icon: 'zap' | 'hand' }[] = [
    { id: 'auto', title: copy.auto.title, body: copy.auto.body, icon: 'zap' },
    { id: 'manual', title: copy.manual.title, body: copy.manual.body, icon: 'hand' },
  ];

  return (
    <Screen scroll footer={<PrimaryButton label={copy.cta} onPress={() => void onContinue()} loading={busy} />}>
      <View style={styles.body}>
        <StepHeader step={step} total={total} title="Acceptance Mode" subtitle={copy.subtitle} backFallback={isStore ? '/onboarding/stores' : '/onboarding/categories'} />

        <View style={styles.cards}>
          {modes.map((m) => {
            const on = mode === m.id;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${m.title}. ${m.body}`}
                onPress={() => setMode(m.id)}
                style={({ pressed }) => [styles.card, isStore ? styles.cardStore : styles.cardSolo, { borderColor: on ? colors.border : colors.borderSubtle }, isStore && !on && styles.dimmed, pressed && styles.pressed]}>
                <View style={styles.cardHead}>
                  {isStore ? (
                    <AppText variant="h4" style={styles.cardTitle}>
                      {m.title}
                    </AppText>
                  ) : (
                    <View style={styles.labelGroup}>
                      <Icon name={m.icon} size={20} strokeWidth={2.25} />
                      <AppText variant="titleLg" style={styles.cardTitle}>
                        {m.title}
                      </AppText>
                    </View>
                  )}
                  {isStore && m.id === 'auto' ? (
                    <View style={styles.recommended}>
                      <AppText variant="label" uppercase style={styles.recommendedText}>
                        RECOMMENDED
                      </AppText>
                    </View>
                  ) : (
                    <View style={[styles.radio, on ? styles.radioOn : null]} />
                  )}
                </View>
                <AppText variant="bodySm" color="textSecondary" style={styles.cardBody}>
                  {m.body}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.info, { borderRadius: isStore ? 33 : 41.5 }]}>
          <Icon name="info" size={isStore ? 20 : 18} color={isStore ? 'textSecondary' : 'ink'} />
          <AppText variant={isStore ? 'bodySm' : 'bodySemi'} color={isStore ? 'textSecondary' : 'ink'} style={[styles.infoText, !isStore && styles.infoTextSolo]}>
            {copy.info}
          </AppText>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.x3l, paddingBottom: spacing.x3l },
  cards: { gap: spacing.lg, alignSelf: 'stretch' },
  card: { backgroundColor: colors.surface, borderWidth: 2, borderRadius: 32, gap: spacing.lg, alignSelf: 'stretch' },
  cardStore: { padding: spacing.x3l },
  cardSolo: { padding: 18 },
  dimmed: { opacity: 0.6 },
  pressed: { opacity: 0.9 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  labelGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, flex: 1 },
  cardTitle: { flexShrink: 1 },
  cardBody: { fontSize: 13, lineHeight: 18 },
  recommended: { backgroundColor: colors.lime, borderWidth: 2, borderColor: colors.border, borderRadius: 11.5, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  recommendedText: { fontSize: 11, lineHeight: 15 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  radioOn: { backgroundColor: colors.lime, borderColor: colors.borderStrong },
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.xxl, backgroundColor: colors.surfaceMuted, alignSelf: 'stretch' },
  infoText: { flex: 1 },
  infoTextSolo: { fontSize: 12, lineHeight: 17 },
});
