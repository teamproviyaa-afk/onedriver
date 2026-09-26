import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { RiderMap } from '@/components/app';
import type { RiderMapProps } from '@/components/app/RiderMap';
import { selectPosition, useDeliveryStore } from '@/stores';
import type { LatLng } from '@/types';

export interface LiveRiderMapProps {
  pickup?: LatLng | null;
  drop?: LatLng | null;
  focus?: RiderMapProps['focus'];
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * RiderMap fed by the live rider position. The position subscription lives in this
 * small component so a GPS tick re-renders the map only, never the whole job screen.
 * Measures its own height so the drawing fallback can project pins correctly.
 */
export const LiveRiderMap = ({ pickup, drop, focus = 'all', interactive = true, style }: LiveRiderMapProps) => {
  const position = useDeliveryStore(selectPosition);
  const [height, setHeight] = useState(0);
  return (
    <View style={[styles.wrap, style]} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
      {height > 0 ? <RiderMap rider={position} pickup={pickup} drop={drop} focus={focus} height={height} style={StyleSheet.absoluteFill} interactive={interactive} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 200, backgroundColor: '#EBF2F0', overflow: 'hidden' },
});
