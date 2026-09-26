import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { colors, radius, spacing } from '@/theme';
import { AppText, Icon } from '@/components/ui';
import { useDeliveryStore, selectJob, selectPosition } from '@/stores/useDeliveryStore';
import { routeForJob, STATE_LABELS } from '@/state-machine/deliveryStateMachine';
import { haversineKm } from '@/domain/geo';
import type { RiderFlowState } from '@/types';

/** Persistent dark "Current Active Dispatch" bar from rider-ui-kit; tap → MAP VIEW. */
export const ActiveJobBar = () => {
  const job = useDeliveryStore(selectJob);
  const position = useDeliveryStore(selectPosition);
  if (!job) return null;
  const toPickup = ['accepted', 'to_pickup', 'at_pickup', 'pickup_verified'].includes(job.state);
  const target = toPickup ? job.pickup : job.drop;
  const km = position ? haversineKm(position, target) : (toPickup ? job.pickupDistanceKm : job.distanceKm) ?? 0;
  const label = job.state === 'accepted' || job.state === 'to_pickup' ? 'En-route to pickup' : job.state === 'to_drop' || job.state === 'picked_up' ? 'En-route to drop' : STATE_LABELS[job.state as RiderFlowState]?.subtitle ?? 'Active job';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open current job" onPress={() => router.push(routeForJob(job) as never)} style={styles.bar}>
      <View style={styles.left}>
        <Icon name="navigation" size={20} color="limeBright" />
        <AppText variant="bodyBold" color="surface" numberOfLines={1} style={styles.text}>
          {label} · {km.toFixed(1)} km away
        </AppText>
      </View>
      <View style={styles.pill}>
        <AppText variant="buttonPrimary" color="limeBright">
          MAP VIEW
        </AppText>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: spacing.xxl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg, marginHorizontal: spacing.gutter },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flex: 1 },
  text: { flexShrink: 1 },
  pill: { backgroundColor: colors.darkAction, borderRadius: radius.pill, paddingHorizontal: spacing.base, paddingVertical: spacing.xs },
});
