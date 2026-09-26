import { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { colors } from '@/theme';
import type { LatLng } from '@/types';
import { Icon } from '@/components/ui';
import { MapFallback } from './MapFallback';

export interface RiderMapProps {
  rider?: LatLng | null;
  pickup?: LatLng | null;
  drop?: LatLng | null;
  route?: LatLng[];
  focus?: 'all' | 'pickup' | 'drop' | 'rider';
  height?: number;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  /** Force the development drawing (used by screens that mimic the Figma illustration). */
  fallback?: boolean;
  onRegionChange?: (center: LatLng) => void;
  draggablePin?: LatLng | null;
  onPinDragEnd?: (p: LatLng) => void;
  zoneBoundary?: LatLng[];
  showsUserLocation?: boolean;
}

const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
const hasGoogleKey = !!(Constants.expoConfig?.android?.config as { googleMaps?: { apiKey?: string } } | undefined)?.googleMaps?.apiKey;

/** Map is usable when a native map provider will actually render tiles. */
export const nativeMapAvailable = Platform.OS === 'ios' || (Platform.OS === 'android' && (isExpoGo || hasGoogleKey));

const regionFor = (points: LatLng[]): Region => {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.6),
  };
};

/**
 * Map abstraction (spec §3.3): react-native-maps with Google on Android / Apple on iOS,
 * rider, pickup and drop pins plus the route line. Falls back to the Figma drawing when
 * no map provider can render (no API key on a native Android build).
 */
export const RiderMap = ({ rider, pickup, drop, route, focus = 'all', height = 300, style, interactive = true, fallback, onRegionChange, draggablePin, onPinDragEnd, zoneBoundary, showsUserLocation }: RiderMapProps) => {
  const ref = useRef<MapView>(null);
  const points = useMemo(() => {
    if (focus === 'pickup' && pickup) return [pickup, ...(rider ? [rider] : [])];
    if (focus === 'drop' && drop) return [drop, ...(rider ? [rider] : [])];
    if (focus === 'rider' && rider) return [rider];
    return [rider, pickup, drop, draggablePin].filter((p): p is LatLng => !!p);
  }, [focus, rider, pickup, drop, draggablePin]);

  const region = useMemo(() => (points.length ? regionFor(points) : regionFor([{ lat: 18.4088, lng: 76.5604 }])), [points]);

  useEffect(() => {
    if (!ref.current || points.length < 2) return;
    ref.current.fitToCoordinates(
      points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      { edgePadding: { top: 80, bottom: 80, left: 60, right: 60 }, animated: true },
    );
  }, [points]);

  if (fallback || !nativeMapAvailable) {
    return <MapFallback rider={rider} pickup={pickup} drop={drop} height={height} style={style} />;
  }

  const line = route && route.length > 1 ? route : pickup && drop ? [pickup, drop] : [];

  return (
    <View style={[{ height }, styles.wrap, style]} accessibilityLabel="Map">
      <MapView
        ref={ref}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onRegionChangeComplete={(r) => onRegionChange?.({ lat: r.latitude, lng: r.longitude })}>
        {zoneBoundary && zoneBoundary.length > 2 ? (
          <Polyline coordinates={[...zoneBoundary, zoneBoundary[0]!].map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={colors.lime} strokeWidth={3} />
        ) : null}
        {line.length > 1 ? <Polyline coordinates={line.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={colors.ink} strokeWidth={4} lineDashPattern={[8, 6]} /> : null}
        {pickup ? (
          <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} anchor={{ x: 0.5, y: 0.5 }} title="Pickup">
            <View style={styles.pickup} />
          </Marker>
        ) : null}
        {drop ? (
          <Marker coordinate={{ latitude: drop.lat, longitude: drop.lng }} anchor={{ x: 0.5, y: 0.5 }} title="Drop">
            <View style={styles.drop} />
          </Marker>
        ) : null}
        {rider ? (
          <Marker coordinate={{ latitude: rider.lat, longitude: rider.lng }} anchor={{ x: 0.5, y: 0.5 }} title="You" flat>
            <View style={styles.rider}>
              <Icon name="navigation" size={16} color="limeBright" />
            </View>
          </Marker>
        ) : null}
        {draggablePin ? (
          <Marker
            coordinate={{ latitude: draggablePin.lat, longitude: draggablePin.lng }}
            draggable
            onDragEnd={(e) => onPinDragEnd?.({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
            anchor={{ x: 0.5, y: 1 }}>
            <Icon name="map-pin" size={36} color="ink" fill={colors.lime} />
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', alignSelf: 'stretch', backgroundColor: '#EBF2F0' },
  pickup: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, borderWidth: 3, borderColor: colors.surface },
  drop: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 6, borderColor: colors.lime },
  rider: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.darkAction, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
});
