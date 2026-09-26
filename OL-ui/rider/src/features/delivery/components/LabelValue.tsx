import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { figmaText } from './text';

export interface LabelValueProps {
  label: string;
  value: string;
  color?: string;
  labelColor?: string;
  align?: 'left' | 'right';
  /** Label → value spacing: 2 on the route preview, 4 on the SKU / drop-address blocks (Figma). */
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

/** "DESTINATION ADDRESS / Apt 4B…" block: ExtraBold 11 label over ExtraBold 15 value. */
export const LabelValue = ({ label, value, color = 'ink', labelColor = 'textSecondary', align = 'left', gap = 2, style }: LabelValueProps) => (
  <View style={[styles.wrap, { gap }, align === 'right' && styles.right, style]}>
    <AppText style={figmaText.label11} color={labelColor} uppercase>
      {label}
    </AppText>
    <AppText style={figmaText.value15} color={color} align={align}>
      {value}
    </AppText>
  </View>
);

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  right: { alignItems: 'flex-end' },
});
