import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { spacing } from '@/theme';
import { AppText, BottomSheet, PrimaryButton, TextField } from '@/components/ui';

export interface ReportNoteSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  body?: string;
  placeholder?: string;
  confirmLabel: string;
  onConfirm: (note: string | undefined) => void | Promise<void>;
  loading?: boolean;
}

interface NoteFormProps {
  body?: string;
  placeholder: string;
  confirmLabel: string;
  onConfirm: ReportNoteSheetProps['onConfirm'];
  loading?: boolean;
}

/** Remounted every time the sheet opens (via `key`) so the note always starts empty. */
const NoteForm = ({ body, placeholder, confirmLabel, onConfirm, loading }: NoteFormProps) => {
  const [note, setNote] = useState('');
  return (
    <>
      {body ? (
        <AppText variant="body" color="textSecondary">
          {body}
        </AppText>
      ) : null}
      <TextField value={note} onChangeText={setNote} placeholder={placeholder} multiline numberOfLines={3} height={96} maxLength={240} style={styles.input} editable={!loading} accessibilityLabel="Note for operations" />
      <PrimaryButton label={confirmLabel} loading={loading} onPress={() => void onConfirm(note.trim() || undefined)} />
    </>
  );
};

/** Bottom sheet that collects an optional note before raising an exception with operations. */
export const ReportNoteSheet = ({ visible, onClose, title, body, placeholder = 'Add a note for operations (optional)', confirmLabel, onConfirm, loading }: ReportNoteSheetProps) => (
  <BottomSheet visible={visible} onClose={onClose} title={title} dismissable={!loading}>
    <NoteForm key={visible ? 'open' : 'closed'} body={body} placeholder={placeholder} confirmLabel={confirmLabel} onConfirm={onConfirm} loading={loading} />
  </BottomSheet>
);

const styles = StyleSheet.create({
  input: { textAlignVertical: 'top', paddingVertical: spacing.lg },
});
