import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, Icon, PrimaryButton, Screen, SecondaryButton, toast } from '@/components/ui';
import { requestNotificationPermission } from '@/notifications/notificationService';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';

const NEXT_ROUTE = '/onboarding/type';

/**
 * notification-permission ("Instant Gig Alerts"): explains why push matters with a mock offer card,
 * then asks the OS. "Maybe Later" continues without asking.
 */
export default function NotificationsPermissionScreen() {
  const complete = useOnboardingStore((s) => s.complete);
  const [busy, setBusy] = useState(false);

  const proceed = () => {
    useAuthStore.getState().markNotificationAsked();
    complete('notifications');
    router.push(NEXT_ROUTE as never);
  };

  const enable = async () => {
    setBusy(true);
    try {
      const granted = await requestNotificationPermission();
      if (!granted) toast.show('Notifications are off. You can enable them later in Settings.', 'warning');
    } finally {
      setBusy(false);
      proceed();
    }
  };

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <>
          <PrimaryButton label="Enable Notifications" onPress={() => void enable()} loading={busy} />
          <SecondaryButton label="Maybe Later" onPress={proceed} disabled={busy} />
        </>
      }>
      <View style={styles.spacer} />
      <View style={styles.text}>
        <AppText variant="display" style={styles.title} accessibilityRole="header">
          Instant Gig Alerts
        </AppText>
        <AppText variant="bodyLg" color="textSecondary" style={styles.body}>
          High-pay delivery slots and single-store exclusive shifts fill up fast. Enable push notifications to lock in shifts instantly.
        </AppText>
      </View>

      <View style={styles.illustration} accessibilityLabel="Example alert: high pay gig nearby">
        <View style={styles.pushCard}>
          <View style={styles.iconWrap}>
            <Icon name="bell" size={20} />
          </View>
          <View style={styles.pushText}>
            <AppText variant="chip" color="lime" style={styles.pushTitle}>
              🔥 HIGH PAY GIG NEARBY
            </AppText>
            <AppText variant="bodySm" color="surface" style={styles.pushBody}>
              Earn ₹180 • 4.2 km away. Accept now!
            </AppText>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.gutter, paddingVertical: spacing.x5l },
  spacer: { height: 1 },
  text: { gap: spacing.xxl },
  title: { lineHeight: 34 },
  body: { lineHeight: 22 },
  illustration: { height: 220, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 32, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, overflow: 'hidden' },
  pushCard: { width: 280, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.lg, backgroundColor: colors.ink, borderRadius: 32, padding: spacing.lg },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  pushText: { flex: 1, gap: 2 },
  pushTitle: { fontSize: 13, lineHeight: 17 },
  pushBody: { fontSize: 11, lineHeight: 15 },
});
