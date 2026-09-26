import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { colors, fontFamily, spacing } from '@/theme';
import { AppText, EmptyState, ErrorState, GhostButton, LoadingState, Screen, toast } from '@/components/ui';
import { AppHeader } from '@/components/app/AppHeader';
import { NotificationCard } from '@/components/app/NotificationCard';
import { queryKeys, useNotifications } from '@/hooks';
import { getDataProvider } from '@/providers';
import { ApiError, type Paginated, type RiderNotification } from '@/types';

/**
 * Notifications (Figma notifications): colour-coded alert cards, unread count in the header,
 * tap → mark read + follow the deep link, "Mark all read", pull-to-refresh, loading / error / empty.
 */
export default function AlertsScreen() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isRefetching } = useNotifications();
  const [markingAll, setMarkingAll] = useState(false);
  const items = data?.items ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const at = new Date().toISOString();
      const set = new Set(ids);
      // Optimistic: flip the rows locally, then confirm with the provider and refetch.
      qc.setQueryData<Paginated<RiderNotification>>(queryKeys.notifications, (prev) => (prev ? { ...prev, items: prev.items.map((n) => (set.has(n.id) && !n.readAt ? { ...n, readAt: at } : n)) } : prev));
      try {
        await getDataProvider().markNotificationsRead(ids);
      } catch (e) {
        toast.error(ApiError.is(e) ? e.detail : 'Could not update notifications');
      } finally {
        void qc.invalidateQueries({ queryKey: queryKeys.notifications });
      }
    },
    [qc],
  );

  const open = useCallback(
    (n: RiderNotification) => {
      if (!n.readAt) void markRead([n.id]);
      if (n.deepLink) router.push(n.deepLink as never);
    },
    [markRead],
  );

  const markAll = async () => {
    if (markingAll || !unread) return;
    setMarkingAll(true);
    try {
      await markRead(items.filter((n) => !n.readAt).map((n) => n.id));
    } finally {
      setMarkingAll(false);
    }
  };

  const subtitle = unread ? `${unread} PENDING UPDATE${unread === 1 ? '' : 'S'} & INCIDENTS` : 'YOU ARE ALL CAUGHT UP';
  const header = (
    <View style={styles.headerWrap}>
      <AppHeader title="Notifications" backIcon="chevron-left" right={unread ? <GhostButton label="Mark all read" onPress={() => void markAll()} disabled={markingAll} style={styles.markAll} /> : undefined} />
      <AppText color="textSecondary" style={styles.subtitle} align="center" accessibilityLiveRegion="polite">
        {subtitle}
      </AppText>
    </View>
  );

  if (isLoading && !data) {
    return (
      <Screen>
        {header}
        <LoadingState label="Loading alerts…" />
      </Screen>
    );
  }
  if (isError && !data) {
    return (
      <Screen>
        {header}
        <ErrorState title="Could not load alerts" body="Check your connection and try again." onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => <NotificationCard notification={item} onPress={open} />}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={<EmptyState icon="bell" title="No alerts yet" body="Offers, incentives, payouts and document reminders will show up here." style={styles.empty} />}
        contentContainerStyle={[styles.list, !items.length && styles.listEmpty]}
        refreshControl={<RefreshControl refreshing={isRefetching && !markingAll} onRefresh={() => void refetch()} tintColor={colors.ink} colors={[colors.ink]} />}
        showsVerticalScrollIndicator={false}
        accessibilityRole="list"
      />
    </Screen>
  );
}

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  headerWrap: { gap: spacing.xxs, paddingBottom: spacing.x3l },
  subtitle: { fontFamily: fontFamily.manropeSemiBold, fontSize: 12, lineHeight: 16 },
  list: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.gutter },
  listEmpty: { flexGrow: 1 },
  separator: { height: spacing.base },
  empty: { paddingTop: spacing.x6l },
  markAll: { paddingHorizontal: 0 },
});
