import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, Divider, PrimaryButton, Screen, StatusChip } from '@/components/ui';
import { getDataProvider } from '@/providers';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { ApiError, type StoreLink } from '@/types';
import { isLocalDemo } from '@/config/env';
import { DEMO_STORE_INVITE_CODES } from '@/demo/constants';
import { FormField, OnboardingHeader } from '@/features/onboarding/components';

/**
 * store-link ("Link to Store"): invite code → "Find store" → matched merchant card → link & proceed.
 * The one CTA changes role: it looks up the code until a merchant matches, then confirms the link.
 */
export default function StoreLinkScreen() {
  const draftCode = useOnboardingStore((s) => s.storeInviteCode);
  const draftLink = useOnboardingStore((s) => s.storeLinked);
  const patch = useOnboardingStore((s) => s.patch);
  const complete = useOnboardingStore((s) => s.complete);
  const [code, setCode] = useState(draftCode ?? '');
  const [match, setMatch] = useState<StoreLink | null>(draftLink && draftCode ? { ...draftLink, priority: 1, status: 'active' } : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const findStore = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      setError('Enter the invite code from your store manager.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const link = await getDataProvider().linkStore(trimmed);
      setMatch(link);
      setCode(trimmed);
    } catch (e) {
      setMatch(null);
      setError(ApiError.is(e) ? e.detail : 'Could not look up that code. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const proceed = () => {
    if (!match) return;
    patch({
      storeInviteCode: code.trim().toUpperCase(),
      storeLinked: { storeId: match.storeId, storeName: match.storeName, organization: match.organization, managerName: match.managerName, dailyPayText: match.dailyPayText, zoneName: match.zoneName },
    });
    complete('store_link');
    router.push('/onboarding/kyc' as never);
  };

  return (
    <Screen
      scroll
      keyboard
      contentStyle={styles.content}
      footer={match ? <PrimaryButton label="Link & Proceed to Verification" onPress={proceed} /> : <PrimaryButton label="Find store" icon="search" iconPosition="left" onPress={() => void findStore()} loading={busy} />}>
      <OnboardingHeader title="Link to Store" subtitle="Enter your merchant's unique invitation code to tie your profile to their local deliveries." />

      <FormField
        label="Merchant invite code"
        value={code}
        onChangeText={(t) => {
          setCode(t.toUpperCase());
          if (error) setError(null);
          if (match) setMatch(null);
        }}
        placeholder="e.g. PUN904"
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => void findStore()}
        error={error}
        helper={isLocalDemo ? `Demo code: ${DEMO_STORE_INVITE_CODES[0]}` : undefined}
      />

      {match ? (
        <View style={styles.card} accessibilityLabel={`Matched merchant ${match.storeName}`}>
          <View style={styles.statusRow}>
            <AppText variant="labelXs" color="textSecondary" style={styles.eyebrow} uppercase>
              Matched merchant
            </AppText>
            <View style={styles.activeBadge}>
              <AppText variant="labelXs" uppercase>
                {match.status}
              </AppText>
            </View>
          </View>
          <View style={styles.storeInfo}>
            <AppText variant="h4">{match.storeName}</AppText>
            <AppText variant="bodySm" color="textSecondary" style={styles.storeMeta}>
              {[match.zoneName, match.organization].filter(Boolean).join(', ')}
            </AppText>
          </View>
          <Divider color={colors.borderSubtle} />
          <AppText variant="bodySemi" style={styles.managerLine}>
            {`Manager: ${match.managerName} • ${match.dailyPayText}`}
          </AppText>
        </View>
      ) : (
        <StatusChip label={busy ? 'Looking up code…' : 'Enter a code to find your store'} tone="muted" size="sm" style={styles.hint} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.x3l },
  card: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 32, padding: 18, gap: spacing.lg },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 11, lineHeight: 14 },
  activeBadge: { backgroundColor: 'rgba(118, 236, 0, 0.13)', borderRadius: 11, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  storeInfo: { gap: spacing.xxs },
  storeMeta: { fontSize: 13, lineHeight: 18 },
  managerLine: { fontSize: 12, lineHeight: 17 },
  hint: { alignSelf: 'center' },
});
