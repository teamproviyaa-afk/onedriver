import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, Badge, Card, Checkbox, GhostButton, InfoBanner, PrimaryButton, Screen, StatusChip, toast } from '@/components/ui';
import { AppHeader } from '@/components/app';
import { useCountdown, useJobActions } from '@/hooks';
import { useJobScreen } from '@/features/delivery/useJobScreen';
import { errorMessage } from '@/features/delivery/errors';
import { JobScreenFallback } from '@/features/delivery/components';
import { usePickupChecklistStore } from '@/features/pickup/pickupChecklistStore';

/**
 * At Pickup (Figma at-pickup): the rider is at the merchant. Shows the merchant order id,
 * item count and the package verification checklist (ticks are kept per job in the
 * pickup checklist store and reported by the verify endpoint), then hands over to
 * order verification. "Order not ready?" raises the not_ready exception and opens the
 * waiting screen.
 */
export default function AtPickupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isLoading, error, refetch } = useJobScreen(id, ['at_pickup']);
  const { raiseException } = useJobActions();
  const checked = usePickupChecklistStore((s) => (id ? s.byJob[id] : undefined));
  const setChecked = usePickupChecklistStore((s) => s.setChecked);
  const readyIn = useCountdown(job?.merchantReadyAt);
  const [raising, setRaising] = useState(false);

  if (!job) return <JobScreenFallback error={isLoading ? null : error} onRetry={refetch} label="Loading pickup…" />;

  const checkedIds = checked ?? [];
  const count = job.itemsCount || job.items.length;
  const preparing = !!job.merchantReadyAt && readyIn > 0;

  const toggle = (itemId: string, on: boolean) => {
    const rest = checkedIds.filter((x) => x !== itemId);
    setChecked(job.id, on ? [...rest, itemId] : rest);
  };

  const orderNotReady = async () => {
    setRaising(true);
    try {
      const res = await raiseException(job, 'not_ready');
      if ('queued' in res) toast.show('Saved offline — will sync');
      router.push(`/job/${job.id}/pickup/waiting` as never);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRaising(false);
    }
  };

  return (
    <Screen
      scroll
      footer={
        <View style={styles.footer}>
          <PrimaryButton label="VERIFY PICKUP" onPress={() => router.push(`/job/${job.id}/pickup/verify` as never)} />
          <GhostButton label="Order not ready?" onPress={() => void orderNotReady()} disabled={raising} />
        </View>
      }>
      <AppHeader title="At Pickup" onBack={() => router.replace(`/job/${job.id}` as never)} onHelp={() => router.push('/support' as never)} />
      <View style={styles.body}>
        <AppText variant="body" color="textSecondary">
          Collect packages from {job.pickup.name}
        </AppText>

        <InfoBanner icon="info" text={`Confirm all ${count} item${count === 1 ? '' : 's'} with store manager.`} />

        <Card radius={40} padding={spacing.xxl} row style={styles.merchantCard}>
          <View style={styles.merchantText}>
            <AppText variant="title" color="textSecondary" uppercase>
              Merchant order id
            </AppText>
            <AppText variant="h4" numberOfLines={1}>
              {job.orderRef}
            </AppText>
          </View>
          <View style={styles.merchantRight}>
            <Badge label={`${count} ${count === 1 ? 'item' : 'items'}`} />
            {preparing ? <StatusChip label="Preparing" tone="warning" size="sm" /> : null}
          </View>
        </Card>

        <Card radius={32} padding={spacing.xxl} gap={0} style={styles.checklist}>
          <AppText variant="label" color="textSecondary" uppercase style={styles.checklistTitle}>
            Package verification checklist
          </AppText>
          {job.items.length === 0 ? (
            <AppText variant="bodySm" color="textSecondary" style={styles.emptyItems}>
              No item details were shared for this order. Confirm the package count with the store manager.
            </AppText>
          ) : (
            job.items.map((item) => {
              const on = checkedIds.includes(item.id);
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${item.qty}x ${item.name}`}
                  onPress={() => toggle(item.id, !on)}
                  hitSlop={{ top: 4, bottom: 4 }}
                  style={({ pressed }) => [styles.itemRow, pressed && styles.pressed]}>
                  <View style={styles.itemText}>
                    <AppText variant="title">{item.qty}x</AppText>
                    <AppText variant="body" style={styles.itemName} numberOfLines={2}>
                      {item.name}
                    </AppText>
                  </View>
                  <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                    <Checkbox checked={on} size={24} radius={10} borderColor={colors.border} />
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.x3l, paddingTop: spacing.lg },
  footer: { gap: spacing.xs },
  merchantCard: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  merchantText: { gap: spacing.xs, flexShrink: 1 },
  merchantRight: { alignItems: 'flex-end', gap: spacing.sm },
  checklist: { paddingBottom: spacing.base },
  checklistTitle: { marginBottom: spacing.sm },
  emptyItems: { paddingVertical: spacing.sm },
  // Rows keep the Figma 12px pitch (24px box + 12 gap) while the touch target is 36 + 8 hit slop = 44.
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg, paddingVertical: spacing.sm, minHeight: 36 },
  itemText: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  itemName: { flexShrink: 1 },
  pressed: { opacity: 0.85 },
});
