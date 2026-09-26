import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { AppText } from '@/components/ui';

export interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

/** pickup-verification segmented control: #F0F0EE track, dark pill active segment with lime label. */
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(o.value)} style={[styles.segment, active && styles.segmentActive]}>
            <AppText variant={active ? 'bodyBold' : 'bodySm'} color={active ? 'limeBright' : 'textSecondary'} style={active ? styles.activeText : undefined} uppercase>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: spacing.xs, backgroundColor: '#F0F0EE', borderWidth: 2, borderColor: colors.border, borderRadius: 22, padding: spacing.xs, alignSelf: 'stretch' },
  segment: { flex: 1, paddingVertical: spacing.base, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  segmentActive: { backgroundColor: colors.darkAction },
  activeText: { fontSize: 15, lineHeight: 20 },
});
