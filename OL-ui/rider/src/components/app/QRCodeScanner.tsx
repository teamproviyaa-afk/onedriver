import { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { colors, radius, spacing } from '@/theme';
import { AppText, OutlineButton } from '@/components/ui';

export interface QRCodeScannerProps {
  onScanned: (code: string) => void;
  active?: boolean;
  height?: number;
  hint?: string;
}

/** Scanner box from pickup-verification: #121212 container, radius 32, lime bracket viewfinder. Remount (key) to scan again after a result. */
export const QRCodeScanner = ({ onScanned, active = true, height = 260, hint = 'Scan store receipt/box barcode' }: QRCodeScannerProps) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const lastRef = useRef<string | null>(null);
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);
  const canUseCamera = Platform.OS !== 'web' && permission?.granted;
  return (
    <View style={[styles.box, { height }]} accessibilityLabel="QR scanner">
      {canUseCamera && active ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8'] }}
          onBarcodeScanned={
            locked
              ? undefined
              : ({ data }) => {
                  if (!data || lastRef.current === data) return;
                  lastRef.current = data;
                  setLocked(true);
                  onScanned(data);
                }
          }
        />
      ) : null}
      <View style={styles.center} pointerEvents="none">
        <Image source={require('@/assets/figma/qr-viewfinder.png')} style={styles.viewfinder} resizeMode="contain" />
        <AppText variant="bodySm" color="surface" style={styles.hint}>
          {hint}
        </AppText>
      </View>
      {!canUseCamera ? (
        <View style={styles.permission}>
          <AppText variant="bodySm" color="surface" align="center" style={styles.hint}>
            {Platform.OS === 'web' ? 'Camera scanning is not available on web.' : permission?.canAskAgain === false ? 'Camera permission denied. Enable it in Settings or enter the code manually.' : 'Allow camera access to scan the receipt.'}
          </AppText>
          {Platform.OS !== 'web' && permission?.canAskAgain !== false ? <OutlineButton label="Allow camera" onPress={() => void requestPermission()} /> : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { backgroundColor: colors.ink, borderRadius: radius.card, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', padding: spacing.x3l },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  viewfinder: { width: 180, height: 180 },
  hint: { opacity: 0.8 },
  permission: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg, gap: spacing.md, alignItems: 'center' },
});
