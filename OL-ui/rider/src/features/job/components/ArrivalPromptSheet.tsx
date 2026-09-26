import { StyleSheet, View } from 'react-native';

import { AppText, BottomSheet, PrimaryButton, SecondaryButton } from '@/components/ui';
import { spacing } from '@/theme';

export interface ArrivalPromptSheetProps {
  visible: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

/** Auto-prompt once the rider has been within 100 m of the drop for 10 s (spec §3.2). */
export const ArrivalPromptSheet = ({ visible, loading, onConfirm, onDismiss }: ArrivalPromptSheetProps) => (
  <BottomSheet visible={visible} onClose={onDismiss} title="You have arrived?" dismissable={!loading}>
    <AppText variant="body" color="textSecondary">
      You look to be at the drop location. Mark your arrival to start the handover.
    </AppText>
    <View style={styles.actions}>
      <PrimaryButton label="Yes, I'm here" onPress={onConfirm} loading={loading} />
      <SecondaryButton label="Not yet" onPress={onDismiss} disabled={loading} />
    </View>
  </BottomSheet>
);

const styles = StyleSheet.create({
  actions: { gap: spacing.lg, paddingTop: spacing.x3l },
});
