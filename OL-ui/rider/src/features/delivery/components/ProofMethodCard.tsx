import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText, Icon, type IconName } from '@/components/ui';

export interface ProofMethodCardProps {
  icon: IconName;
  title: string;
  subtitle: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/** Selectable verification-method row (delivery-confirmation): icon + text block + radio dot, radius 35. */
export const ProofMethodCard = ({ icon, title, subtitle, selected, disabled, onPress }: ProofMethodCardProps) => (
  <Pressable
    accessibilityRole="radio"
    accessibilityLabel={`${title}. ${subtitle}`}
    accessibilityState={{ selected, disabled: !!disabled, checked: selected }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.card, selected && styles.cardSelected, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <View style={styles.left}>
      <Icon name={icon} size={24} color={disabled ? 'textMuted' : 'ink'} />
      <View style={styles.text}>
        <AppText variant="statusTime" color={disabled ? 'textMuted' : 'ink'}>
          {title}
        </AppText>
        <AppText variant="bodySm" color="textSecondary">
          {subtitle}
        </AppText>
      </View>
    </View>
    <View style={[styles.radio, selected && styles.radioOn]} />
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 35,
    padding: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    alignSelf: 'stretch',
    minHeight: 72,
  },
  cardSelected: { borderColor: colors.lime },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.9 },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flexShrink: 1 },
  text: { gap: 2, flexShrink: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.surface },
  radioOn: { backgroundColor: colors.lime },
});
