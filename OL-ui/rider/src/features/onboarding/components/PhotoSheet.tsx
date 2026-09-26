import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';
import { AppText, BottomSheet, OutlineButton, PrimaryButton, SecondaryButton } from '@/components/ui';
import { PhotoCapture } from '@/components/app';

export interface PhotoSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  hint?: string;
  /** Reference image used when no camera is available (web / permission denied) so demo flows continue. */
  placeholder?: number;
  /** Extra fields rendered above the viewfinder (e.g. licence number). */
  children?: ReactNode;
  /** Gate the confirm button on the extra fields being valid. */
  canConfirm?: boolean;
  confirmLabel?: string;
  onConfirm: (uri: string) => Promise<void> | void;
  busy?: boolean;
}

/** Bottom sheet wrapping PhotoCapture: take photo → preview → retake / use photo. Used for selfie, DL and RC. */
export const PhotoSheet = ({ visible, ...body }: PhotoSheetProps) => (
  <BottomSheet visible={visible} onClose={body.onClose} title={body.title} dismissable={!body.busy}>
    {/* Mounted only while open so the captured photo resets every time the sheet closes. */}
    {visible ? <SheetBody {...body} /> : null}
  </BottomSheet>
);

const SheetBody = ({ onClose, hint, placeholder, children, canConfirm = true, confirmLabel = 'Use this photo', onConfirm, busy }: Omit<PhotoSheetProps, 'visible' | 'title'>) => {
  const [uri, setUri] = useState<string | null>(null);
  const captureRef = useRef<(() => Promise<void>) | null>(null);

  return (
    <View style={styles.body}>
      {hint ? (
        <AppText variant="body" color="textSecondary">
          {hint}
        </AppText>
      ) : null}
      {children}
      <PhotoCapture value={uri} onChange={setUri} captureRef={captureRef} height={260} placeholder={placeholder} />
      {uri ? (
        <View style={styles.actions}>
          <PrimaryButton label={confirmLabel} onPress={() => void onConfirm(uri)} loading={busy} disabled={!canConfirm} icon="check" />
          <OutlineButton label="Retake" icon="rotate-ccw" onPress={() => setUri(null)} disabled={busy} fullWidth compact={false} />
        </View>
      ) : (
        <View style={styles.actions}>
          <PrimaryButton label="Take photo" icon="camera" iconPosition="left" onPress={() => void captureRef.current?.()} disabled={busy} />
          <SecondaryButton label="Cancel" onPress={onClose} disabled={busy} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  body: { gap: spacing.xxl },
  actions: { gap: spacing.lg },
});
