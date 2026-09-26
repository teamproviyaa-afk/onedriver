import { Image, Pressable, StyleSheet, View } from 'react-native';

import { colors, shadows, spacing } from '@/theme';
import { AppText, Icon } from '@/components/ui';

export interface UploadCardProps {
  title: string;
  subtitle: string;
  onPress: () => void;
  /** Dashed border = "tap to add" (store-vehicle); solid with soft shadow = solo-vehicle. */
  dashed?: boolean;
  /** Captured photo URI: shows a thumbnail and a RETAKE pill instead of the camera icon. */
  photoUri?: string | null;
  busy?: boolean;
}

/** Upload action row from the vehicle screens: 36px lime camera frame, title 14 ExtraBold, subtitle 11 Medium. */
export const UploadCard = ({ title, subtitle, onPress, dashed, photoUri, busy }: UploadCardProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={photoUri ? `${title}, photo added, retake` : title}
    accessibilityState={{ busy }}
    disabled={busy}
    onPress={onPress}
    style={({ pressed }) => [styles.row, dashed ? styles.dashed : styles.solid, pressed && styles.pressed, busy && styles.busy]}>
    {photoUri ? (
      <Image source={{ uri: photoUri }} style={styles.thumb} resizeMode="cover" accessibilityLabel="Uploaded photo" />
    ) : (
      <View style={styles.frame}>
        <Icon name="camera" size={18} />
      </View>
    )}
    <View style={styles.text}>
      {/* store-vehicle title is ExtraBold 14; solo-vehicle's solid card uses ExtraBold 13. */}
      <AppText variant={dashed ? 'title' : 'titleSm'}>{title}</AppText>
      <AppText variant="bodySm" color="textSecondary" style={styles.subtitle}>
        {photoUri ? 'Photo added · tap to retake' : subtitle}
      </AppText>
    </View>
    {photoUri ? <Icon name="circle-check" size={22} color="success" /> : null}
  </Pressable>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, backgroundColor: colors.surface, borderRadius: 34, padding: spacing.xxl, alignSelf: 'stretch', minHeight: 44 },
  dashed: { borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed' },
  solid: { ...shadows.soft },
  pressed: { opacity: 0.9 },
  busy: { opacity: 0.6 },
  frame: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.lime, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.border },
  text: { flex: 1, gap: spacing.xxs },
  subtitle: { fontSize: 11, lineHeight: 15 },
});
