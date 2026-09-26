import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, InfoBanner, PrimaryButton, Screen } from '@/components/ui';
import { getDataProvider } from '@/providers';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { ApiError, type VehicleClass, type VehicleOwnership } from '@/types';
import { FormField, OnboardingHeader, PhotoSheet, UploadCard, VehicleClassSelector, formatRegistration, isValidRegistration } from '@/features/onboarding/components';

/**
 * store-vehicle ("Your Vehicle") / solo-vehicle ("Vehicle & Ownership", step 4 of 4): class, registration
 * number (Indian format) and RC photo. Solo riders can switch to "I Need to Rent" → rental marketplace (V2).
 */
export default function VehicleScreen() {
  const riderType = useOnboardingStore((s) => s.riderType);
  const draft = useOnboardingStore((s) => s.vehicle);
  const patch = useOnboardingStore((s) => s.patch);
  const complete = useOnboardingStore((s) => s.complete);
  const isStore = riderType === 'store';
  const variant = isStore ? 'store' : 'solo';

  const [vehicleClass, setVehicleClass] = useState<VehicleClass>(draft?.class ?? '2w');
  const [registration, setRegistration] = useState(draft?.registrationNo ?? '');
  const [regError, setRegError] = useState<string | null>(null);
  const [rc, setRc] = useState<{ assetId: string; uri: string } | null>(draft?.rcAssetId ? { assetId: draft.rcAssetId, uri: '' } : null);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState<'rc' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onOwnership = (o: VehicleOwnership) => {
    if (o === 'rent') router.push('/onboarding/rental' as never);
  };

  const uploadRc = async (uri: string) => {
    setBusy('rc');
    setError(null);
    try {
      const { assetId } = await getDataProvider().createUpload('rc', 'image/jpeg', uri);
      setRc({ assetId, uri });
      setSheet(false);
    } catch (e) {
      setError(ApiError.is(e) ? e.detail : 'Could not upload the RC photo. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const onContinue = async () => {
    if (!isValidRegistration(registration)) {
      setRegError('Enter a valid registration number, e.g. MH 24 AB 1234.');
      return;
    }
    if (!rc) {
      setError('Add a clear photo of the Registration Certificate (RC) to continue.');
      return;
    }
    setRegError(null);
    setError(null);
    setBusy('save');
    try {
      const registrationNo = formatRegistration(registration);
      const saved = await getDataProvider().setVehicle({ class: vehicleClass, ownership: 'own', registrationNo, rcAssetId: rc.assetId });
      patch({ vehicle: { class: saved.class, ownership: saved.ownership, registrationNo: saved.registrationNo, rcAssetId: rc.assetId } });
      complete('vehicle');
      router.push('/onboarding/categories' as never);
    } catch (e) {
      setError(ApiError.is(e) ? e.detail : 'Could not save your vehicle. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      scroll
      keyboard
      contentStyle={styles.content}
      footer={<PrimaryButton label={isStore ? 'Finish Setup & Go Online' : 'Submit & Verify Profile'} onPress={() => void onContinue()} loading={busy === 'save'} />}>
      <OnboardingHeader
        title={isStore ? 'Your Vehicle' : 'Vehicle & Ownership'}
        subtitle={isStore ? 'Select your operational vehicle class and register documents.' : 'Do you operate your own registered vehicle or require a daily rental?'}
        backIcon={isStore ? 'arrow-left' : 'chevron-left'}
        step={isStore ? undefined : { current: 4, total: 4 }}
      />

      {!isStore ? (
        <View style={styles.ownership} accessibilityRole="tablist">
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: true }} style={styles.segmentActive} onPress={() => onOwnership('own')}>
            <AppText variant="titleSm">I Own a Vehicle</AppText>
          </Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: false }} accessibilityLabel="I Need to Rent, coming soon" style={styles.segmentInactive} onPress={() => onOwnership('rent')}>
            <AppText variant="titleSm" color="textSecondary">
              I Need to Rent
            </AppText>
          </Pressable>
        </View>
      ) : (
        <View style={styles.flex} />
      )}

      <VehicleClassSelector value={vehicleClass} onChange={setVehicleClass} variant={variant} />

      <View style={styles.form}>
        <FormField
          label="Vehicle registration number"
          placeholder="e.g. MH-12-AB-1234"
          value={registration}
          onChangeText={(t) => {
            setRegistration(t.toUpperCase());
            if (regError) setRegError(null);
          }}
          onBlur={() => {
            if (registration && isValidRegistration(registration)) setRegistration(formatRegistration(registration));
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          error={regError}
        />
        <UploadCard
          title={isStore ? 'Registration Certificate (RC)' : 'Upload Registration Certificate (RC)'}
          subtitle={isStore ? 'Upload clear front photo' : 'Image size limit 5MB'}
          dashed={isStore}
          photoUri={rc?.uri || (rc ? undefined : null)}
          onPress={() => setSheet(true)}
          busy={busy === 'rc'}
        />
        {rc && !rc.uri ? (
          <AppText variant="bodySm" color="textSecondary">
            RC photo already added · tap to retake.
          </AppText>
        ) : null}
        {error ? <InfoBanner tone="danger" icon="alert-triangle" text={error} bold={false} /> : null}
      </View>

      <PhotoSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Registration Certificate"
        hint="Photograph the front of the RC. Make sure the registration number is readable."
        placeholder={require('@/assets/figma/proof-photo-preview.png')}
        onConfirm={uploadRc}
        busy={busy === 'rc'}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.x3l },
  flex: { flex: 1, minHeight: spacing.x6l },
  ownership: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderWidth: 2, borderColor: colors.border, borderRadius: 23, padding: spacing.xs, alignSelf: 'stretch' },
  segmentActive: { flex: 1, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 19, paddingVertical: spacing.base, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  segmentInactive: { flex: 1, opacity: 0.6, paddingVertical: spacing.base, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  form: { gap: spacing.xl },
});
