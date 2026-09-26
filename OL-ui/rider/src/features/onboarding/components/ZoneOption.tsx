import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText, Radio } from '@/components/ui';

export interface ZoneOptionProps {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

/** location-selection option row: white, radius 36, 2px border (#DBE0D6 selected / #E5E5E0), radio + name + region. */
export const ZoneOption = ({ title, subtitle, selected, onPress, disabled }: ZoneOptionProps) => (
  <Pressable
    accessibilityRole="radio"
    accessibilityState={{ selected, disabled }}
    accessibilityLabel={title}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.row, { borderColor: selected ? colors.border : colors.borderSubtle }, pressed && styles.pressed, disabled && styles.disabled]}>
    <Radio selected={selected} />
    <View style={styles.text}>
      <AppText variant="titleLg" color={selected ? 'ink' : 'textSecondary'}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="bodySm" color="textSecondary">
          {subtitle}
        </AppText>
      ) : null}
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, backgroundColor: colors.surface, borderWidth: 2, borderRadius: 36, padding: spacing.xxl, alignSelf: 'stretch', minHeight: 44 },
  text: { flex: 1, gap: spacing.xxs },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.5 },
});
