import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { AppText, BottomSheet, PrimaryButton, TextField, toast } from '@/components/ui';
import { ApiError, type Rider } from '@/types';
import { getDataProvider } from '@/providers';
import { queryKeys } from '@/hooks/queryClient';
import { useRiderStore } from '@/stores/useRiderStore';
import { optionalEmailSchema } from '@/features/auth/phone';
import { spacing } from '@/theme';

export interface EmailSheetProps {
  rider: Rider;
  visible: boolean;
  onClose: () => void;
}

/** Profile → "Email for statements": weekly statements, payout and approval emails. */
export const EmailSheet = ({ rider, visible, onClose }: EmailSheetProps) => {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(rider.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsed = optionalEmailSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await getDataProvider().updateProfile({
        fullName: rider.fullName,
        emergencyPhone: rider.emergencyPhone ?? '',
        email: parsed.data,
        language: rider.language,
        photoAssetId: rider.photoAssetId,
        photoUri: rider.photoUri,
      });
      useRiderStore.getState().patchMe({ rider: updated });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
      toast.success(parsed.data ? 'Email saved' : 'Email removed');
      onClose();
    } catch (e) {
      setError(ApiError.is(e) ? e.detail : 'Could not save your email. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={() => (saving ? undefined : onClose())} title="Email for statements" dismissable={!saving}>
      <View style={styles.body}>
        <AppText variant="bodySm" color="textSecondary">
          Weekly statements, payout confirmations and account updates are sent here. Leave it empty to stop emails.
        </AppText>
        <TextField
          label="Email"
          value={draft}
          onChangeText={(v) => {
            setDraft(v);
            if (error) setError(null);
          }}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          error={error}
          editable={!saving}
        />
        <PrimaryButton label="SAVE EMAIL" onPress={() => void save()} loading={saving} />
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
});
