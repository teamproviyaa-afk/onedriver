import { StyleSheet, View } from 'react-native';

import { AppText, Dot } from '@/components/ui';
import { fontFamily, spacing } from '@/theme';
import type { LatLng } from '@/types';
import { figmaText } from '@/features/delivery/components';
import { formatKm1 } from '../distance';
import { useLiveDistanceKm } from '../useLiveDistance';

export interface PlaceRowProps {
  /** Figma: black dot for the store, lime dot for the drop. */
  dotColor: string;
  label: string;
  /** Store name or drop area — never the drop address before pickup verification. */
  name: string;
  /** Show "(x km)" from the rider's live position to this point… */
  distanceTo?: LatLng | null;
  /** …or a fixed distance in km when there is no live fix (or no target). */
  fallbackKm?: number | null;
  /** ExtraBold 15 (pickup) or Medium 15 (drop). */
  emphasis?: 'strong' | 'regular';
}

/** "PICKUP FROM / Gourmet Kitchen (0.8 km)" row from the current-job drawer. */
export const PlaceRow = ({ dotColor, label, name, distanceTo, fallbackKm, emphasis = 'strong' }: PlaceRowProps) => {
  const liveKm = useLiveDistanceKm(distanceTo);
  const km = liveKm ?? fallbackKm ?? null;
  return (
    <View style={styles.row}>
      <Dot color={dotColor} size={10} />
      <View style={styles.text}>
        <AppText variant="label" color="textSecondary" uppercase>
          {label}
        </AppText>
        <AppText style={emphasis === 'strong' ? figmaText.value15 : styles.medium15} numberOfLines={2}>
          {km === null ? name : `${name} (${formatKm1(km)})`}
        </AppText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, alignSelf: 'stretch' },
  text: { flex: 1, gap: 2 },
  medium15: { fontFamily: fontFamily.manropeMedium, fontSize: 15, lineHeight: 20 },
});
