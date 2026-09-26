import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { colors, radius, shadows, spacing } from '@/theme';
import { AppText, Icon } from '@/components/ui';

export interface SOSButtonProps {
  jobId?: string;
  compact?: boolean;
}

/** Red SOS affordance shown on every active-job screen; opens the safety flow. */
export const SOSButton = ({ jobId, compact }: SOSButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Emergency SOS"
    onPress={() => router.push((jobId ? `/job/${jobId}/sos` : '/sos') as never)}
    style={({ pressed }) => [styles.btn, compact && styles.compact, pressed && styles.pressed]}>
    <View style={styles.row}>
      <Icon name="siren" size={compact ? 16 : 18} color="surface" strokeWidth={2.5} />
      {!compact ? (
        <AppText variant="buttonSm" color="surface">
          SOS
        </AppText>
      ) : null}
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  btn: { backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingHorizontal: spacing.xxl, height: 44, alignItems: 'center', justifyContent: 'center', ...shadows.soft },
  compact: { width: 40, height: 40, paddingHorizontal: 0, borderRadius: 20 },
  pressed: { opacity: 0.9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
