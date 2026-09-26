import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fontFamily, spacing } from '@/theme';
import { AppText } from '@/components/ui';

export interface PillTabsProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

/**
 * Figma earnings-today "tabs-header": dark active pill (Manrope ExtraBold 13 white) and
 * white pills with a 1px #E5E5E0 border (Manrope Bold 13 #666660). Radius 20, padding 10/16, gap 8.
 */
export function PillTabs<T extends string>({ options, value, onChange }: PillTabsProps<T>) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [styles.pill, active ? styles.pillActive : styles.pillIdle, pressed && styles.pressed]}>
            <AppText variant="chip" color={active ? 'surface' : 'textSecondary'} style={active ? undefined : styles.labelIdle}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', alignSelf: 'stretch' },
  pill: { paddingVertical: spacing.base, paddingHorizontal: spacing.xxl, borderRadius: 20, borderWidth: 1 },
  pillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillIdle: { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
  pressed: { opacity: 0.85 },
  labelIdle: { fontFamily: fontFamily.manropeBold },
});
