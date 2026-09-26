import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { spacing } from '@/theme';
import { AppText, Icon, PrimaryButton, Screen } from '@/components/ui';

/** Branded fallback for unknown deep links (never the default dark "Unmatched Route" page). */
export default function NotFoundScreen() {
  return (
    <Screen>
      <View style={styles.center}>
        <View style={styles.ring}>
          <Icon name="map-pin" size={28} color="textSecondary" />
        </View>
        <AppText variant="h2" align="center">
          This page took a wrong turn
        </AppText>
        <AppText variant="body" color="textSecondary" align="center">
          The link you opened does not exist in OneLocal Rider.
        </AppText>
        <PrimaryButton label="Back to home" onPress={() => router.replace('/home' as never)} fullWidth={false} style={styles.button} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  ring: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#F1F1EF', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  button: { paddingHorizontal: spacing.x5l, marginTop: spacing.md },
});
