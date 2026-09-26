import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, shadows, spacing } from '@/theme';
import { AppText, Icon, type IconName } from '@/components/ui';

export interface ActionRowProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

/** White pill row with leading icon and trailing chevron (order-not-ready "Report Delay to Support"). */
export const ActionRow = ({ icon, label, onPress, disabled, loading }: ActionRowProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: !!disabled, busy: !!loading }}
    disabled={disabled || loading}
    onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}>
    <View style={styles.left}>
      <Icon name={icon} size={18} color="inkSoft" />
      <AppText variant="title" color="inkSoft">
        {label}
      </AppText>
    </View>
    {loading ? <ActivityIndicator size="small" color={colors.ink} /> : <Icon name="chevron-right" size={14} color="inkSoft" />}
  </Pressable>
);

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: spacing.xl,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    ...shadows.soft,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, flexShrink: 1 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
