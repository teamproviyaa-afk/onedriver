import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { DestructiveButton, PrimaryButton, SecondaryButton } from './Buttons';
import { Icon, type IconName } from './Icon';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  dismissable?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Slide-up sheet: white, top radius 24, 2px #DBE0D6 top border (matches Figma bottom drawers). */
export const BottomSheet = ({ visible, onClose, children, title, dismissable = true, style }: BottomSheetProps) => {
  const insets = useSafeAreaInsets();
  const [translate] = useState(() => new Animated.Value(400));
  useEffect(() => {
    Animated.spring(translate, { toValue: visible ? 0 : 400, useNativeDriver: true, bounciness: 2 }).start();
  }, [visible, translate]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismissable ? onClose : undefined} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismissable ? onClose : undefined} accessibilityLabel="Close" />
        <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xxl), transform: [{ translateY: translate }] }, style]}>
          <View style={styles.handle} />
          {title ? (
            <AppText variant="h4" style={styles.title}>
              {title}
            </AppText>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
};

export interface ConfirmationSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  body?: string;
  icon?: IconName;
  tone?: 'default' | 'danger' | 'warning';
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void | Promise<void>;
  loading?: boolean;
  children?: ReactNode;
}

/** Confirmation dialog built on BottomSheet (Go offline?, Decline offer?, Escalate?). */
export const ConfirmationSheet = ({ visible, onClose, title, body, icon, tone = 'default', confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, loading, children }: ConfirmationSheetProps) => (
  <BottomSheet visible={visible} onClose={onClose} dismissable={!loading}>
    <View style={styles.confirmBody}>
      {icon ? (
        <View style={[styles.iconRing, tone === 'danger' && styles.iconDanger, tone === 'warning' && styles.iconWarning]}>
          <Icon name={icon} size={26} color={tone === 'danger' ? 'danger' : 'ink'} />
        </View>
      ) : null}
      <AppText variant="h3" align="center">
        {title}
      </AppText>
      {body ? (
        <AppText variant="body" color="textSecondary" align="center">
          {body}
        </AppText>
      ) : null}
      {children}
    </View>
    <View style={styles.actions}>
      {onConfirm ? (
        tone === 'danger' ? (
          <DestructiveButton label={confirmLabel} onPress={() => void onConfirm()} loading={loading} />
        ) : (
          <PrimaryButton label={confirmLabel} onPress={() => void onConfirm()} loading={loading} />
        )
      ) : null}
      <SecondaryButton label={cancelLabel} onPress={onClose} disabled={loading} />
    </View>
  </BottomSheet>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, borderTopWidth: 2, borderColor: colors.border, paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, gap: spacing.xxl },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: radius.pill, backgroundColor: colors.border },
  title: { marginTop: spacing.xs },
  confirmBody: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.md },
  iconRing: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceLime, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  iconDanger: { backgroundColor: colors.surfaceDanger },
  iconWarning: { backgroundColor: colors.surfaceWarning },
  actions: { gap: spacing.lg },
});
