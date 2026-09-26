import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, BottomSheet, PrimaryButton, SecondaryButton, SelectableRow, TextField } from '@/components/ui';
import { spacing } from '@/theme';

export const PICKUP_FAR_REASONS = ['GPS is inaccurate here', 'Store entrance is away from the pin', 'Store staff handed over nearby', 'Other'] as const;
export const DROP_FAR_REASONS = ['GPS is inaccurate here', 'Customer asked to meet nearby', 'Gate or building entrance is far from the pin', 'Other'] as const;

export interface ReasonSheetProps {
  visible: boolean;
  title: string;
  /** Geofence message, e.g. "You are 720 m from the store pin. Add a reason to continue." */
  message?: string;
  options: readonly string[];
  confirmLabel?: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void | Promise<void>;
}

/** "Too far" reason picker (spec §3.2): preset reasons + optional note; the reason is flagged for review server-side. */
export const ReasonSheet = ({ visible, title, message, options, confirmLabel = 'CONTINUE', loading, onClose, onSubmit }: ReasonSheetProps) => {
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState('');
  // Reset the form when the sheet closes — derived from the previous render, not an effect.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible) {
      setChoice(null);
      setNote('');
    }
  }

  const needsNote = choice === 'Other';
  const canSubmit = !!choice && (!needsNote || note.trim().length >= 3);
  const reason = choice ? (note.trim() ? `${choice}: ${note.trim()}` : choice) : '';

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} dismissable={!loading}>
      {message ? (
        <AppText variant="body" color="textSecondary">
          {message}
        </AppText>
      ) : null}
      <View style={styles.options}>
        {options.map((o) => (
          <SelectableRow key={o} title={o} selected={choice === o} onPress={() => setChoice(o)} radius={16} style={styles.option} />
        ))}
      </View>
      <TextField
        label={needsNote ? 'Tell us what happened' : 'Add a note (optional)'}
        placeholder="e.g. Gate is 300 m from the pin"
        value={note}
        onChangeText={setNote}
        multiline
        height={72}
        textAlignVertical="top"
        style={styles.noteInput}
      />
      <View style={styles.actions}>
        <PrimaryButton label={confirmLabel} onPress={() => void onSubmit(reason)} disabled={!canSubmit} loading={loading} />
        <SecondaryButton label="Cancel" onPress={onClose} disabled={loading} />
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  options: { gap: spacing.md },
  option: { paddingVertical: spacing.lg },
  noteInput: { paddingTop: spacing.lg },
  actions: { gap: spacing.lg },
});
