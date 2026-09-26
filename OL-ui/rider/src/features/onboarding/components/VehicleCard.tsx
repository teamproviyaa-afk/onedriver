import { Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText, Icon, type IconName } from '@/components/ui';
import type { VehicleClass } from '@/types';

export type VehicleGlyph = { kind: 'image'; source: ImageSourcePropType } | { kind: 'icon'; name: IconName };

export interface VehicleCardProps {
  label: string;
  glyph: VehicleGlyph;
  selected: boolean;
  onPress: () => void;
  /** store-vehicle: radius 46.5, inactive cards at 60% opacity · solo-vehicle: radius 44, #F1F1EF icon frame. */
  variant?: 'store' | 'solo';
}

/** 2/3/4-wheeler selector card: 40px icon frame (lime when selected) + ExtraBold label. */
export const VehicleCard = ({ label, glyph, selected, onPress, variant = 'store' }: VehicleCardProps) => {
  const solo = variant === 'solo';
  const frameBg = selected ? colors.lime : solo ? colors.surfaceMuted : colors.surface;
  const frameBorder = selected || solo ? colors.border : colors.borderSubtle;
  const tint = selected || solo ? colors.ink : colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderRadius: solo ? 44 : 46.5, borderColor: selected ? colors.border : colors.borderSubtle, gap: solo ? spacing.md : spacing.base },
        !selected && !solo && styles.dim,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.frame, { backgroundColor: frameBg, borderColor: frameBorder }]}>
        {glyph.kind === 'image' ? <Image source={glyph.source} style={[styles.glyph, { tintColor: tint }]} resizeMode="contain" /> : <Icon name={glyph.name} size={solo ? 18 : 20} color={tint} />}
      </View>
      <AppText variant={solo ? 'label' : 'title'} color={selected || solo ? 'ink' : 'textSecondary'} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
};

export const VEHICLE_OPTIONS: { value: VehicleClass; label: string; glyph: VehicleGlyph }[] = [
  { value: '2w', label: '2-Wheeler', glyph: { kind: 'image', source: require('@/assets/figma/icon-motorbike.png') } },
  { value: '3w', label: '3-Wheeler', glyph: { kind: 'image', source: require('@/assets/figma/icon-auto-rickshaw.png') } },
  { value: '4w', label: '4-Wheeler', glyph: { kind: 'icon', name: 'truck' } },
];

export interface VehicleClassSelectorProps {
  value: VehicleClass;
  onChange: (v: VehicleClass) => void;
  variant?: 'store' | 'solo';
}

/** Row of three equal-width vehicle cards (gap 10). */
export const VehicleClassSelector = ({ value, onChange, variant = 'store' }: VehicleClassSelectorProps) => (
  <View style={styles.row} accessibilityRole="radiogroup">
    {VEHICLE_OPTIONS.map((o) => (
      <VehicleCard key={o.value} label={o.label} glyph={o.glyph} selected={o.value === value} onPress={() => onChange(o.value)} variant={variant} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.base, alignSelf: 'stretch' },
  card: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 2, padding: spacing.lg, minHeight: 88 },
  dim: { opacity: 0.6 },
  pressed: { opacity: 0.9 },
  frame: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  glyph: { width: 20, height: 20 },
});
