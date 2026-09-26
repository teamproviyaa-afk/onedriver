import { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { colors, radius, shadows, spacing } from '@/theme';
import { AppText, GhostButton } from '@/components/ui';
import { log } from '@/utils/logger';
import { persistPrivately } from './PhotoCapture';

export interface SignaturePadProps {
  height?: number;
  onChange?: (hasStrokes: boolean) => void;
  /** Exposed so the parent can export the drawing as a PNG (private storage). */
  exportRef?: React.MutableRefObject<(() => Promise<string | null>) | null>;
}

type Pt = { x: number; y: number };
interface DrawState {
  strokes: string[];
  current: Pt[];
}

const toPath = (pts: Pt[]) => (pts.length ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') : '');

/** proof-signature canvas: 358×240 white card, radius 32, idle illustration, CLEAR pill. */
export const SignaturePad = ({ height = 240, onChange, exportRef }: SignaturePadProps) => {
  const [draw, setDraw] = useState<DrawState>({ strokes: [], current: [] });
  const viewRef = useRef<View>(null);
  const strokeCount = draw.strokes.length;

  useEffect(() => {
    onChange?.(strokeCount > 0);
  }, [strokeCount, onChange]);

  useEffect(() => {
    if (!exportRef) return;
    exportRef.current = async () => {
      if (!draw.strokes.length) return null;
      try {
        if (Platform.OS === 'web') {
          return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg">${draw.strokes.map((d) => `<path d="${d}" stroke="#121212" fill="none" stroke-width="3"/>`).join('')}</svg>`)}`;
        }
        const uri = await captureRef(viewRef, { format: 'png', quality: 0.9, result: 'tmpfile' });
        return await persistPrivately(uri, 'signature');
      } catch (e) {
        log.warn('signature export failed', e);
        return null;
      }
    };
    return () => {
      exportRef.current = null;
    };
  }, [exportRef, draw.strokes]);

  const commit = () =>
    setDraw((s) => (s.current.length > 1 ? { strokes: [...s.strokes, toPath(s.current)], current: [] } : { ...s, current: [] }));

  const pan = Gesture.Pan()
    .minDistance(0)
    .runOnJS(true)
    .onBegin((e) => setDraw((s) => ({ ...s, current: [{ x: e.x, y: e.y }] })))
    .onUpdate((e) => setDraw((s) => ({ ...s, current: [...s.current, { x: e.x, y: e.y }] })))
    .onEnd(commit)
    .onFinalize(commit);

  const clear = () => setDraw({ strokes: [], current: [] });
  const empty = draw.strokes.length === 0 && draw.current.length === 0;

  return (
    <GestureDetector gesture={pan}>
      <View ref={viewRef} collapsable={false} style={[styles.canvas, { height }]} accessibilityLabel="Signature canvas" accessibilityHint="Draw the customer's signature with a finger">
        {empty ? <Image source={require('@/assets/figma/signature-illustration.png')} style={styles.idle} resizeMode="contain" /> : null}
        <Svg style={StyleSheet.absoluteFill}>
          {draw.strokes.map((d, i) => (
            <Path key={i} d={d} stroke={colors.ink} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {draw.current.length ? <Path d={toPath(draw.current)} stroke={colors.ink} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        </Svg>
        <AppText variant="labelXs" color="textSecondary" style={styles.caption}>
          SIGN ON SCREEN
        </AppText>
        <View style={styles.clear}>
          <GhostButton label="CLEAR" onPress={clear} color={colors.inkSoft} style={styles.clearBtn} />
        </View>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  canvas: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: radius.card, overflow: 'hidden', alignSelf: 'stretch' },
  idle: { position: 'absolute', left: 52, top: 48, width: 250, height: 130, borderRadius: 18 },
  caption: { position: 'absolute', left: 10, bottom: 14, fontSize: 11 },
  clear: { position: 'absolute', top: 10, right: 10 },
  clearBtn: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 0, ...shadows.soft },
});
