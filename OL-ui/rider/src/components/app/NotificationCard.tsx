import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText } from '@/components/ui';
import type { NotificationKind, RiderNotification } from '@/types';

/** Left accent bar per notification kind (Figma notifications: lime / amber / blue / red). */
export const NOTIFICATION_ACCENT: Record<NotificationKind, string> = {
  new_delivery: colors.lime,
  incentive: colors.lime,
  document_expiry: colors.warning,
  payment_disbursed: '#3B82F6',
  order_reassigned: colors.danger,
  tier_upgrade: colors.lime,
  system: colors.textSecondary,
};

/** Figma timestamp copy: "2 min ago" · "1 hr ago" · "3 hrs ago" · "Yesterday" · "2 days ago". */
export const notificationAge = (iso: string, now: Date = new Date()): string => {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hr' : 'hrs'} ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
};

export interface NotificationCardProps {
  notification: RiderNotification;
  onPress?: (n: RiderNotification) => void;
  now?: Date;
}

/**
 * Notification row from the Figma notifications frame: white card, 2px #DBE0D6 border,
 * 8px colour-coded accent bar, title + relative time, body copy. Unread rows show a dot.
 */
export const NotificationCard = memo(({ notification, onPress, now }: NotificationCardProps) => {
  const unread = !notification.readAt;
  const accent = NOTIFICATION_ACCENT[notification.kind] ?? colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread: ' : ''}${notification.title}. ${notification.body}`}
      onPress={onPress ? () => onPress(notification) : undefined}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}>
            {unread ? <View style={styles.unreadDot} accessibilityLabel="Unread" /> : null}
            <AppText variant="title" numberOfLines={2} style={styles.title}>
              {notification.title}
            </AppText>
          </View>
          <AppText variant="bodySm" color="textSecondary" style={styles.time}>
            {notificationAge(notification.createdAt, now)}
          </AppText>
        </View>
        <AppText variant="bodySm" color="textSecondary">
          {notification.body}
        </AppText>
      </View>
    </Pressable>
  );
});

NotificationCard.displayName = 'NotificationCard';

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 32, alignSelf: 'stretch', minHeight: 56 },
  pressed: { opacity: 0.9 },
  accent: { width: 8, borderRadius: 4, alignSelf: 'stretch' },
  content: { flex: 1, gap: spacing.xs, paddingVertical: spacing.xs, paddingRight: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flexShrink: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  time: { fontSize: 11, lineHeight: 16, paddingTop: 1 },
});
