import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, Icon, PrimaryButton, Screen, toast, type IconName } from '@/components/ui';
import { StepHeader, stepPosition } from '@/features/onboarding-setup/StepHeader';
import { useOnboardingStore } from '@/stores';
import { colors, spacing } from '@/theme';
import type { DeliveryCategory } from '@/types';

interface CategoryOption {
  id: DeliveryCategory;
  title: string;
  body: string;
  icon: IconName;
}

/** Copy + icons differ between the store-categories and solo-categories Figma variants. */
const STORE_OPTIONS: CategoryOption[] = [
  { id: 'quick_drop', title: 'Quick Drop', body: 'Instant groceries & daily staples within 2km.', icon: 'zap' },
  { id: 'on_order', title: 'On-Order Delivery', body: 'Scheduled meals, baked goods & farm fresh items.', icon: 'shopping-bag' },
  { id: 'pick_drop', title: 'Pick & Drop', body: 'Store to customer custom packages and keys.', icon: 'package' },
];
/** Figma default selection (Quick Drop + On-Order) until the rider has saved this step once. */
const DEFAULT_SELECTION: DeliveryCategory[] = ['quick_drop', 'on_order'];
const SOLO_OPTIONS: CategoryOption[] = [
  { id: 'quick_drop', title: 'Quick Drop', body: 'Local documents, food, & packages under 5kg', icon: 'package' },
  { id: 'on_order', title: 'On-Order Delivery', body: 'Deliver food & grocery orders from partner merchants', icon: 'shopping-cart' },
  { id: 'pick_drop', title: 'Pick & Drop', body: 'Custom requests to buy and pick up from any location', icon: 'map-pin' },
];

/** Onboarding — Delivery Categories (store 1/5 · solo 1/4): multi-select the shipment types the rider runs. */
export default function CategoriesScreen() {
  const riderType = useOnboardingStore((s) => s.riderType);
  const draftCategories = useOnboardingStore((s) => s.categories);
  const savedBefore = useOnboardingStore((s) => s.completed.includes('categories'));
  const patch = useOnboardingStore((s) => s.patch);
  const complete = useOnboardingStore((s) => s.complete);
  const [selected, setSelected] = useState<DeliveryCategory[]>(() => (savedBefore && draftCategories.length ? draftCategories : DEFAULT_SELECTION));

  const isStore = riderType === 'store';
  const options = isStore ? STORE_OPTIONS : SOLO_OPTIONS;
  const { step, total } = stepPosition(riderType, 'categories');

  const toggle = (id: DeliveryCategory) => setSelected((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));

  const onContinue = () => {
    if (!selected.length) {
      toast.error('Select at least one delivery category');
      return;
    }
    const ordered = options.map((o) => o.id).filter((id) => selected.includes(id));
    patch({ categories: ordered });
    complete('categories');
    router.push((isStore ? '/onboarding/stores' : '/onboarding/acceptance') as never);
  };

  return (
    <Screen scroll footer={<PrimaryButton label="Save & Continue" onPress={onContinue} disabled={!selected.length} />}>
      <View style={styles.body}>
        <StepHeader
          step={step}
          total={total}
          title="Delivery Categories"
          subtitle={isStore ? 'Which types of shipments are you equipped to run? Multi-select below.' : 'Select which types of deliveries you want to service in your operating area.'}
          backFallback="/onboarding/vehicle"
        />
        <View style={styles.list}>
          {options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <Pressable
                key={o.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${o.title}. ${o.body}`}
                onPress={() => toggle(o.id)}
                style={({ pressed }) => [styles.card, { borderRadius: isStore ? 46 : 43, borderColor: on ? colors.border : colors.borderSubtle }, pressed && styles.pressed]}>
                <View style={[styles.iconFrame, isStore ? styles.iconFrameLg : styles.iconFrameMd, { backgroundColor: on ? colors.lime : colors.surfaceMuted, borderWidth: on || !isStore ? 2 : 1 }]}>
                  <Icon name={o.icon} size={20} strokeWidth={2.25} />
                </View>
                <View style={[styles.text, { gap: isStore ? spacing.xs : spacing.xxs }]}>
                  <AppText variant="titleLg" style={!isStore ? styles.titleSolo : undefined}>
                    {o.title}
                  </AppText>
                  <AppText variant="bodySm" color="textSecondary">
                    {o.body}
                  </AppText>
                </View>
                <View style={[styles.check, { backgroundColor: on ? colors.lime : colors.surface }]}>{on ? <Icon name="check" size={14} strokeWidth={3} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.x3l, paddingBottom: spacing.x3l },
  list: { gap: spacing.lg, alignSelf: 'stretch' },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxl, padding: spacing.xxl, backgroundColor: colors.surface, borderWidth: 2, alignSelf: 'stretch' },
  pressed: { opacity: 0.9 },
  iconFrame: { alignItems: 'center', justifyContent: 'center', borderColor: colors.border },
  iconFrameLg: { width: 48, height: 48, borderRadius: 24 },
  iconFrameMd: { width: 44, height: 44, borderRadius: 22 },
  text: { flex: 1 },
  titleSolo: { fontSize: 15, lineHeight: 20 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
});
