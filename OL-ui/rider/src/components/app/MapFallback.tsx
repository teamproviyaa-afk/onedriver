import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/theme';
import type { LatLng } from '@/types';
import { Icon } from '@/components/ui';

export interface MapFallbackProps {
  rider?: LatLng | null;
  pickup?: LatLng | null;
  drop?: LatLng | null;
  style?: StyleProp<ViewStyle>;
  height?: number;
  opacity?: number;
}

const project = (p: LatLng, bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }, w: number, h: number, pad = 0.18) => {
  const spanLat = Math.max(1e-6, bounds.maxLat - bounds.minLat);
  const spanLng = Math.max(1e-6, bounds.maxLng - bounds.minLng);
  const x = pad * w + ((p.lng - bounds.minLng) / spanLng) * (1 - 2 * pad) * w;
  const y = pad * h + ((bounds.maxLat - p.lat) / spanLat) * (1 - 2 * pad) * h;
  return { left: x, top: y };
};

/**
 * Development map: the Figma map drawing (#EBF2F0 roads) with the pickup (black dot),
 * drop (lime ring) and rider (navigation arrow) projected onto it. Used on web, when no
 * Google Maps key is configured, and in tests. Coordinates still come from the data model.
 */
export const MapFallback = ({ rider, pickup, drop, style, height = 300, opacity = 1 }: MapFallbackProps) => {
  const pts = [rider, pickup, drop].filter((p): p is LatLng => !!p);
  const bounds = pts.length
    ? { minLat: Math.min(...pts.map((p) => p.lat)), maxLat: Math.max(...pts.map((p) => p.lat)), minLng: Math.min(...pts.map((p) => p.lng)), maxLng: Math.max(...pts.map((p) => p.lng)) }
    : { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 };
  if (bounds.maxLat - bounds.minLat < 0.002) {
    bounds.minLat -= 0.001;
    bounds.maxLat += 0.001;
  }
  if (bounds.maxLng - bounds.minLng < 0.002) {
    bounds.minLng -= 0.001;
    bounds.maxLng += 0.001;
  }
  return (
    <View style={[styles.wrap, { height }, style]} accessibilityLabel="Map">
      <Image source={require('@/assets/figma/map-background.png')} style={[StyleSheet.absoluteFill, { opacity, width: '100%', height: '100%' }]} resizeMode="cover" />
      <View style={StyleSheet.absoluteFill} onLayout={undefined}>
        <Layer bounds={bounds} rider={rider} pickup={pickup} drop={drop} height={height} />
      </View>
    </View>
  );
};

const Layer = ({ bounds, rider, pickup, drop, height }: { bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }; rider?: LatLng | null; pickup?: LatLng | null; drop?: LatLng | null; height: number }) => {
  const w = 390;
  return (
    <View style={StyleSheet.absoluteFill}>
      {pickup && drop ? <Line a={project(pickup, bounds, w, height)} b={project(drop, bounds, w, height)} /> : null}
      {pickup ? <View style={[styles.pickup, offset(project(pickup, bounds, w, height), 12)]} /> : null}
      {drop ? <View style={[styles.drop, offset(project(drop, bounds, w, height), 14)]} /> : null}
      {rider ? (
        <View style={[styles.rider, offset(project(rider, bounds, w, height), 16)]}>
          <Icon name="navigation" size={16} color="limeBright" />
        </View>
      ) : null}
    </View>
  );
};

const offset = (p: { left: number; top: number }, r: number) => ({ left: `${(p.left / 390) * 100}%` as const, top: p.top - r, marginLeft: -r });

const Line = ({ a, b }: { a: { left: number; top: number }; b: { left: number; top: number } }) => {
  const dx = b.left - a.left;
  const dy = b.top - a.top;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return <View style={[styles.line, { width: len, left: `${(a.left / 390) * 100}%`, top: a.top, transform: [{ translateX: 0 }, { rotate: `${angle}deg` }] }]} />;
};

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#EBF2F0', overflow: 'hidden', alignSelf: 'stretch' },
  pickup: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, borderWidth: 3, borderColor: colors.surface },
  drop: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 6, borderColor: colors.lime },
  rider: { position: 'absolute', width: 32, height: 32, borderRadius: 16, backgroundColor: colors.darkAction, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  line: { position: 'absolute', height: 3, backgroundColor: colors.ink, opacity: 0.25, transformOrigin: 'left center' },
});
