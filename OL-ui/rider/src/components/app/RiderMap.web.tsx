import { MapFallback } from './MapFallback';
import type { RiderMapProps } from './RiderMap';

export const nativeMapAvailable = false;

/** Web build: react-native-maps has no web renderer, so the Figma drawing is used. */
export const RiderMap = ({ rider, pickup, drop, height = 300, style }: RiderMapProps) => <MapFallback rider={rider} pickup={pickup} drop={drop} height={height} style={style} />;
