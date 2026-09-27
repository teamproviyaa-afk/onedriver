import { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

import { colors, radius, shadows, spacing } from '@/theme';
import { AppText, OutlineButton } from '@/components/ui';
import { log } from '@/utils/logger';

export interface PhotoCaptureProps {
  /** Captured photo URI (private app storage) or null while previewing the camera. */
  value: string | null;
  onChange: (uri: string | null) => void;
  height?: number;
  /** Exposed so the parent can trigger capture from its own button. */
  captureRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  placeholder?: number;
}

const PROOF_DIR = `${FileSystem.documentDirectory ?? ''}proofs/`;

/** Saves a captured image into the app's private document directory (never the camera roll). */
export const persistPrivately = async (uri: string, prefix = 'proof'): Promise<string> => {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) return uri;
  try {
    const info = await FileSystem.getInfoAsync(PROOF_DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(PROOF_DIR, { intermediates: true });
    const dest = `${PROOF_DIR}${prefix}-${Date.now()}.jpg`;
    await FileSystem.moveAsync({ from: uri, to: dest });
    return dest;
  } catch (e) {
    log.warn('persist photo failed', e);
    return uri;
  }
};

/** proof-photo viewfinder: #121212 box, radius 32, rule-of-thirds grid + lime focus ring. */
export const PhotoCapture = ({ value, onChange, height = 280, captureRef, placeholder }: PhotoCaptureProps) => {
  const [permission, requestPermission] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);
  const canUseCamera = Platform.OS !== 'web' && permission?.granted;

  useEffect(() => {
    if (!captureRef) return;
    captureRef.current = async () => {
      if (value) return;
      if (!canUseCamera || !cam.current || !ready) {
        // No camera (web / denied): use the reference placeholder so the flow can continue in demo.
        // Asset.fromModule works on native and web (RN-web's Image has no resolveAssetSource).
        if (placeholder) onChange(Asset.fromModule(placeholder).uri);
        return;
      }
      try {
        const photo = await cam.current.takePictureAsync({ quality: 0.7, skipProcessing: true });
        if (photo?.uri) onChange(await persistPrivately(photo.uri));
      } catch (e) {
        log.warn('capture failed', e);
      }
    };
    return () => {
      captureRef.current = null;
    };
  }, [captureRef, canUseCamera, ready, value, onChange, placeholder]);

  return (
    <View style={[styles.box, { height }]} accessibilityLabel="Camera viewfinder">
      {value ? (
        <Image source={{ uri: value }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : canUseCamera ? (
        <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} />
      ) : placeholder ? (
        <Image source={placeholder} style={[StyleSheet.absoluteFill, styles.placeholder]} resizeMode="cover" />
      ) : null}
      {!value ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[styles.gridV, { left: '33%' }]} />
          <View style={[styles.gridV, { left: '66%' }]} />
          <View style={[styles.gridH, { top: '33%' }]} />
          <View style={[styles.gridH, { top: '66%' }]} />
          <View style={styles.ring} />
        </View>
      ) : null}
      {!canUseCamera && !value ? (
        <View style={styles.permission}>
          <AppText variant="bodySm" color="surface" align="center">
            {Platform.OS === 'web' ? 'Camera is not available on web — a reference image will be used.' : permission?.canAskAgain === false ? 'Camera permission denied. Enable it in Settings.' : 'Allow camera access to take the proof photo.'}
          </AppText>
          {Platform.OS !== 'web' && permission?.canAskAgain !== false ? <OutlineButton label="Allow camera" onPress={() => void requestPermission()} /> : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { backgroundColor: colors.ink, borderRadius: radius.card, borderWidth: 2, borderColor: colors.border, overflow: 'hidden', alignSelf: 'stretch', ...shadows.soft },
  placeholder: { opacity: 0.9 },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  ring: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: colors.lime, top: '50%', left: '50%', marginLeft: -40, marginTop: -40 },
  permission: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg, gap: spacing.md, alignItems: 'center' },
});
