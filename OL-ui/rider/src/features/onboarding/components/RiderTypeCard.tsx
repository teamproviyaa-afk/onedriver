import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText, Icon, type IconName } from '@/components/ui';

export interface RiderTypeCardProps {
  title: string;
  description: string;
  icon: IconName;
  selected: boolean;
  onPress: () => void;
  /** Gated option (Taxi Partner): muted surface, 70% opacity, still pressable so it can explain itself. */
  gated?: boolean;
  badges?: string[];
}

/** rider-type-selection option card: radius 45, 48px badge icon (lime when selected), title + description. */
export const RiderTypeCard = ({ title, description, icon, selected, onPress, gated, badges = [] }: RiderTypeCardProps) => (
  <Pressable
    accessibilityRole="radio"
    accessibilityState={{ selected, disabled: gated }}
    accessibilityLabel={gated ? `${title}, coming soon` : title}
    onPress={onPress}
    style={({ pressed }) => [
      styles.card,
      { backgroundColor: gated ? colors.surfaceMuted : colors.surface, borderColor: selected && !gated ? colors.border : colors.borderSubtle },
      gated && styles.gated,
      pressed && styles.pressed,
    ]}>
    <View style={[styles.badge, { backgroundColor: selected && !gated ? colors.lime : colors.surface, borderColor: selected && !gated ? colors.border : colors.borderSubtle }]}>
      <Icon name={icon} size={24} color={gated ? 'textSecondary' : 'ink'} />
    </View>
    <View style={styles.info}>
      <View style={styles.titleRow}>
        <AppText variant="titleLg" color={gated ? 'textSecondary' : 'ink'}>
          {title}
        </AppText>
        {badges.map((b) => (
          <View key={b} style={styles.pill}>
            <AppText variant="labelXs" color="lime" style={styles.pillText} uppercase>
              {b}
            </AppText>
          </View>
        ))}
      </View>
      <AppText variant="bodySm" color="textSecondary">
        {description}
      </AppText>
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxl, borderWidth: 2, borderRadius: 45, padding: spacing.xxl, alignSelf: 'stretch' },
  gated: { opacity: 0.7 },
  pressed: { opacity: 0.9 },
  badge: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: spacing.xxs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  pill: { backgroundColor: colors.ink, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pillText: { fontSize: 9, lineHeight: 12 },
});
