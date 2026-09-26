import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, EmptyState, PrimaryButton, Radio, Screen, Toggle, toast } from '@/components/ui';
import { StepHeader, stepPosition } from '@/features/onboarding-setup/StepHeader';
import { useOnboardingStore, useRiderStore } from '@/stores';
import { colors, spacing } from '@/theme';

interface StoreOption {
  id: string;
  name: string;
  subtitle: string;
}

/** Demo nearby hubs listed under the rider's linked store (distances are illustrative until the geo API lands). */
const NEARBY_STORES: StoreOption[] = [
  { id: 'store-gourmet', name: 'Gourmet Kitchen', subtitle: '0.8 km away' },
  { id: 'store-sai-courier', name: 'Sai Courier Point', subtitle: '1.5 km away' },
  { id: 'store-freshmart-ausa', name: 'FreshMart Ausa Road', subtitle: '2.4 km away' },
];

/**
 * Onboarding — "Which store(s) will you ride for?" (store 2/5). Figma store-assignment: a
 * single preferred hub (radio) plus the "Available to multiple stores" toggle that opts the
 * rider into fallback orders from nearby hubs.
 */
export default function StoresScreen() {
  const riderType = useOnboardingStore((s) => s.riderType);
  const storeLinked = useOnboardingStore((s) => s.storeLinked);
  const draftMulti = useOnboardingStore((s) => s.multiStore);
  const draftStoreIds = useOnboardingStore((s) => s.storeIds);
  const patch = useOnboardingStore((s) => s.patch);
  const complete = useOnboardingStore((s) => s.complete);
  const serverLink = useRiderStore((s) => s.me?.storeLinks[0] ?? null);

  const options = useMemo<StoreOption[]>(() => {
    const linked = storeLinked ?? serverLink;
    if (!linked) return NEARBY_STORES;
    return [{ id: linked.storeId, name: linked.storeName, subtitle: `Your linked hub · ${linked.zoneName}` }, ...NEARBY_STORES.filter((s) => s.id !== linked.storeId)];
  }, [storeLinked, serverLink]);

  const [multiStore, setMultiStore] = useState(draftMulti);
  const [preferredId, setPreferredId] = useState<string | undefined>(() => draftStoreIds.find((id) => options.some((o) => o.id === id)) ?? options[0]?.id);
  const { step, total } = stepPosition(riderType, 'stores');

  const onContinue = () => {
    const preferred = options.find((o) => o.id === preferredId);
    if (!preferred) {
      toast.error('Select your preferred store hub');
      return;
    }
    // The preferred hub is the assignment; `multiStore` lets dispatch add fallback orders from nearby hubs.
    patch({ multiStore, storeIds: [preferred.id] });
    complete('stores');
    router.push('/onboarding/acceptance' as never);
  };

  return (
    <Screen scroll footer={<PrimaryButton label="Confirm Store Assignment" onPress={onContinue} disabled={!preferredId} />}>
      <View style={styles.body}>
        <StepHeader step={step} total={total} title="Which store(s) will you ride for?" subtitle="Select your preferred hub. Enabling multiple stores unlocks 2x more order flows." backFallback="/onboarding/categories" />

        <View style={styles.toggleCard}>
          <View style={styles.toggleText}>
            <AppText variant="title">Available to multiple stores</AppText>
            <AppText variant="bodySm" color="textSecondary" style={styles.toggleSub}>
              Auto-receive fallback orders from nearby hubs
            </AppText>
          </View>
          <Toggle value={multiStore} onValueChange={setMultiStore} accessibilityLabel="Available to multiple stores" />
        </View>

        {options.length ? (
          <View style={styles.list} accessibilityRole="radiogroup">
            {options.map((o) => {
              const on = o.id === preferredId;
              return (
                <Pressable
                  key={o.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${o.name}, ${o.subtitle}`}
                  onPress={() => setPreferredId(o.id)}
                  style={({ pressed }) => [styles.storeCard, { borderColor: on ? colors.border : colors.borderSubtle }, pressed && styles.pressed]}>
                  <Radio selected={on} />
                  <View style={styles.storeText}>
                    <AppText variant="title" numberOfLines={1}>
                      {o.name}
                    </AppText>
                    <AppText variant="bodySm" color="textSecondary">
                      {o.subtitle}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <EmptyState icon="map-pin" title="No store hubs yet" body="Link a store with your invite code to pick a preferred hub." actionLabel="Link a store" onAction={() => router.push('/onboarding/store/link' as never)} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.x3l, paddingBottom: spacing.x3l },
  toggleCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxl, padding: spacing.xxl, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 34, alignSelf: 'stretch' },
  toggleText: { flex: 1, gap: spacing.xxs },
  toggleSub: { fontSize: 11, lineHeight: 15 },
  list: { gap: spacing.lg, alignSelf: 'stretch' },
  storeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxl, padding: spacing.xxl, backgroundColor: colors.surface, borderWidth: 2, borderRadius: 34.5, alignSelf: 'stretch', minHeight: 64 },
  storeText: { flex: 1, gap: spacing.xxs },
  pressed: { opacity: 0.9 },
});
