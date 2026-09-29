import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { spacing } from '@/theme';
import { SPLASH, clipFinished, type SplashMode } from './splashPlan';
import { SPLASH_VIDEO } from './splashVideo';

export interface BrandSplashProps {
  /** null while the launch settings are being read (treated as the short logo clip). */
  mode: SplashMode | null;
  /** Called once, when the film ends, is skipped, or the static logo has been shown. */
  onDone: () => void;
  /** Stop the film (e.g. to show an error over it). */
  paused?: boolean;
}

/**
 * The OneLocal brand film, full screen and muted (it never interrupts the rider's music or navigation
 * voice). Until the first frame is on screen the static wordmark — the same image as the native launch
 * screen — covers it, so launch → film has no flash. Falls back to the static logo when motion is
 * reduced or the video cannot play.
 */
export const BrandSplash = ({ mode, onDone, paused }: BrandSplashProps) => {
  const insets = useSafeAreaInsets();
  const [firstFrame, setFirstFrame] = useState(false);
  const [failed, setFailed] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const done = useRef(false);
  const progressed = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  const player = useVideoPlayer(SPLASH_VIDEO, (p) => {
    p.muted = true;
    p.loop = false;
    p.audioMixingMode = 'mixWithOthers';
    p.timeUpdateEventInterval = 0.1;
    p.play();
  });

  useEventListener(player, 'playToEnd', finish);
  // play() in the setup callback can run before the web <video> exists; start again once it is ready.
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') setFailed(true);
    else if (status === 'readyToPlay' && !done.current && !paused) player.play();
  });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (currentTime > 0) progressed.current = true;
    if (currentTime >= SPLASH.skipAfterSeconds) setCanSkip(true);
    if (clipFinished(mode, currentTime)) {
      player.pause();
      finish();
    }
  });

  const staticLogo = mode === 'static' || failed;

  useEffect(() => {
    if (paused || staticLogo) player.pause();
  }, [paused, staticLogo, player]);

  // Static logo: keep it up briefly, then continue. Playback not moving after a few seconds: fall back to it.
  useEffect(() => {
    const t = staticLogo
      ? setTimeout(finish, SPLASH.staticMinMs)
      : setTimeout(() => {
          if (!progressed.current) setFailed(true);
        }, SPLASH.loadTimeoutMs);
    return () => clearTimeout(t);
    // finish is stable in effect (guarded by a ref); re-run only when the mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staticLogo]);

  // Whatever happens, the splash never holds the app longer than SPLASH.maxMs.
  useEffect(() => {
    const t = setTimeout(finish, SPLASH.maxMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showSkip = mode === 'full' && canSkip && !staticLogo && !paused;

  return (
    <View style={styles.fill}>
      {staticLogo ? null : (
        <VideoView
          player={player}
          style={styles.video}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={false}
          onFirstFrameRender={() => {
            setFirstFrame(true);
            if (!done.current && !paused) player.play();
          }}
          accessible={false}
        />
      )}
      {staticLogo || !firstFrame ? (
        <View style={styles.cover} pointerEvents="none">
          <Image source={require('@/assets/brand/onelocal-wordmark.png')} style={styles.wordmark} resizeMode="contain" accessibilityLabel="OneLocal" />
        </View>
      ) : null}
      {showSkip ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip intro"
          hitSlop={12}
          onPress={() => {
            player.pause();
            finish();
          }}
          style={({ pressed }) => [styles.skip, { top: insets.top + spacing.md }, pressed && styles.pressed]}>
          <AppText variant="bodyBoldSm" color="textOnDark">
            Skip
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: SPLASH.background },
  // Explicit size: on web a <video> ignores `inset: 0` and would keep its 720×1280 intrinsic size.
  video: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: SPLASH.background, alignItems: 'center', justifyContent: 'center' },
  // Same visible width as the native launch screen logo (660/1024 of a 240 dp image ≈ 155 dp).
  wordmark: { width: 155, height: 38 },
  skip: { position: 'absolute', right: spacing.gutter, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 100, backgroundColor: 'rgba(0,0,0,0.45)', minHeight: 36, justifyContent: 'center' },
  pressed: { opacity: 0.8 },
});
