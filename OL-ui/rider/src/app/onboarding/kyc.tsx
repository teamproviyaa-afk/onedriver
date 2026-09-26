import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { spacing } from '@/theme';
import { AppText, InfoBanner, PrimaryButton, Screen } from '@/components/ui';
import { getDataProvider } from '@/providers';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { ApiError, type DocumentKind, type RiderDocument } from '@/types';
import { isLocalDemo } from '@/config/env';
import { DocumentCard, FormField, KycStepper, OnboardingHeader, PhotoSheet, isValidLicence, normalizeLicence, type DocumentCardStatus } from '@/features/onboarding/components';

const REQUIRED: DocumentKind[] = ['aadhaar', 'pan', 'selfie', 'dl'];

type Busy = 'digilocker' | 'selfie' | 'dl' | null;
type Sheet = 'selfie' | 'dl' | null;

const errorText = (e: unknown, fallback: string) => (ApiError.is(e) ? e.detail : e instanceof Error ? e.message : fallback);

/**
 * store-kyc ("KYC Verification") / solo-kyc ("Rider KYC setup", step 3 of 4): Aadhaar & PAN through
 * DigiLocker, selfie liveness and driving licence photo. Document statuses come from the provider
 * responses and are mirrored into the onboarding draft so the rider can resume.
 */
export default function KycScreen() {
  const riderType = useOnboardingStore((s) => s.riderType);
  const documents = useOnboardingStore((s) => s.documents);
  const patch = useOnboardingStore((s) => s.patch);
  const complete = useOnboardingStore((s) => s.complete);
  const isStore = riderType === 'store';
  const variant = isStore ? 'store' : 'solo';

  const [busy, setBusy] = useState<Busy>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [dlNumber, setDlNumber] = useState(documents.dl?.number ?? '');
  const [error, setError] = useState<string | null>(null);

  const record = (doc: RiderDocument, number?: string) => {
    const current = useOnboardingStore.getState().documents;
    patch({ documents: { ...current, [doc.kind]: { status: doc.status, assetId: doc.assetId, number: number ?? current[doc.kind]?.number, source: doc.source ?? 'upload' } } });
  };

  const statusOf = (kinds: DocumentKind[]): DocumentCardStatus => {
    const list = kinds.map((k) => documents[k]);
    if (list.some((d) => !d)) return 'todo';
    if (list.some((d) => d?.status === 'rejected')) return 'rejected';
    if (list.some((d) => d?.status === 'expired')) return 'expired';
    if (list.every((d) => d?.status === 'verified')) return 'verified';
    return 'pending';
  };

  const idStatus = statusOf(['aadhaar', 'pan']);
  const selfieStatus = statusOf(['selfie']);
  const dlStatus = statusOf(['dl']);

  const allSubmitted = useMemo(() => REQUIRED.every((k) => documents[k] && documents[k]?.status !== 'rejected' && documents[k]?.status !== 'expired'), [documents]);
  const allVerified = useMemo(() => REQUIRED.every((k) => documents[k]?.status === 'verified'), [documents]);
  const stepperCompleted = allVerified ? 3 : allSubmitted ? 1 : 0;

  const runDigilocker = async () => {
    setBusy('digilocker');
    setError(null);
    try {
      const provider = getDataProvider();
      const { redirectUrl } = await provider.startDigilocker();
      // Production: the rider signs in to DigiLocker in the system browser; the server verifies the
      // pulled Aadhaar/PAN when the documents are submitted with source 'digilocker'.
      if (!isLocalDemo) await WebBrowser.openBrowserAsync(redirectUrl);
      const aadhaar = await provider.submitDocument({ kind: 'aadhaar', source: 'digilocker' });
      record(aadhaar);
      const pan = await provider.submitDocument({ kind: 'pan', source: 'digilocker' });
      record(pan);
    } catch (e) {
      setError(errorText(e, 'DigiLocker is unavailable right now. Try again in a moment.'));
    } finally {
      setBusy(null);
    }
  };

  const uploadSelfie = async (uri: string) => {
    setBusy('selfie');
    setError(null);
    try {
      const provider = getDataProvider();
      const { assetId } = await provider.createUpload('selfie', 'image/jpeg', uri);
      record(await provider.submitDocument({ kind: 'selfie', assetId, source: 'upload' }));
      setSheet(null);
    } catch (e) {
      setError(errorText(e, 'Could not upload your selfie. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const uploadLicence = async (uri: string) => {
    const number = normalizeLicence(dlNumber);
    if (!isValidLicence(number)) return;
    setBusy('dl');
    setError(null);
    try {
      const provider = getDataProvider();
      const { assetId } = await provider.createUpload('dl', 'image/jpeg', uri);
      record(await provider.submitDocument({ kind: 'dl', assetId, number, source: 'upload' }), number);
      setSheet(null);
    } catch (e) {
      setError(errorText(e, 'Could not upload your licence. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const onContinue = () => {
    if (!allSubmitted) return;
    complete('kyc');
    router.push('/onboarding/vehicle' as never);
  };

  const idSubtitle =
    idStatus === 'verified' ? 'Verified automatically via UIDAI' : idStatus === 'pending' ? 'Submitted · awaiting UIDAI confirmation' : idStatus === 'todo' ? (isStore ? 'Verify instantly via DigiLocker' : 'Linked via OTP instantly') : 'Verification failed · link again via DigiLocker';
  const selfieSubtitle =
    selfieStatus === 'verified' ? 'Liveness dynamic selfie verified' : selfieStatus === 'pending' ? 'Submitted · liveness check in progress' : selfieStatus === 'todo' ? 'Ensure neutral lighting' : 'Selfie rejected · capture again in good light';
  const dlSubtitle = dlStatus === 'verified' ? 'Licence verified' : dlStatus === 'pending' ? 'Pending manual validation' : dlStatus === 'todo' ? 'Reviewing front & back layout' : 'Licence rejected · upload a clearer photo';

  const licenceValid = isValidLicence(dlNumber);

  return (
    <Screen scroll contentStyle={styles.content} footer={<PrimaryButton label={isStore ? 'Submit KYC for Review' : 'Proceed with Verification'} onPress={onContinue} disabled={!allSubmitted} />}>
      <OnboardingHeader
        title={isStore ? 'KYC Verification' : 'Rider KYC setup'}
        subtitle={isStore ? 'Complete these regulatory checks to begin commercial operations.' : 'Complete Solo registration to go online. Instantly verified by Digilocker.'}
        backIcon={isStore ? 'arrow-left' : 'chevron-left'}
        step={isStore ? undefined : { current: 3, total: 4 }}
      />

      {isStore ? <KycStepper completed={stepperCompleted} /> : null}
      {error ? <InfoBanner tone="danger" icon="alert-triangle" text={error} bold={false} /> : null}

      <View style={styles.list}>
        <DocumentCard index={1} variant={variant} title={isStore ? 'Aadhaar & PAN Upload' : 'Aadhaar / PAN Card'} subtitle={idSubtitle} status={idStatus} onAction={() => void runDigilocker()} busy={busy === 'digilocker'} />
        <DocumentCard index={2} variant={variant} title={isStore ? 'Selfie Liveness Capture' : 'Selfie Liveness Verification'} subtitle={selfieSubtitle} status={selfieStatus} onAction={() => setSheet('selfie')} busy={busy === 'selfie'} />
        <DocumentCard index={3} variant={variant} title={isStore ? 'Driving License Photo' : 'Driving License Upload'} subtitle={dlSubtitle} status={dlStatus} onAction={() => setSheet('dl')} busy={busy === 'dl'} />
      </View>

      {!allSubmitted ? (
        <AppText variant="bodySm" color="textSecondary" align="center">
          Complete all three checks to continue.
        </AppText>
      ) : null}

      <PhotoSheet
        visible={sheet === 'selfie'}
        onClose={() => setSheet(null)}
        title="Selfie liveness"
        hint="Look straight at the camera in neutral lighting. No hats or sunglasses."
        placeholder={require('@/assets/figma/avatar-rider-profile.png')}
        confirmLabel="Use this selfie"
        onConfirm={uploadSelfie}
        busy={busy === 'selfie'}
      />
      <PhotoSheet
        visible={sheet === 'dl'}
        onClose={() => setSheet(null)}
        title="Driving licence"
        hint="Photograph the front of your licence with all four corners visible."
        placeholder={require('@/assets/figma/proof-photo-preview.png')}
        canConfirm={licenceValid}
        onConfirm={uploadLicence}
        busy={busy === 'dl'}>
        <FormField
          label="Driving licence number"
          placeholder="e.g. MH14 20110012345"
          value={dlNumber}
          onChangeText={setDlNumber}
          autoCapitalize="characters"
          autoCorrect={false}
          error={dlNumber.length > 0 && !licenceValid ? 'Enter the number as printed on your licence (state code + digits).' : null}
        />
      </PhotoSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.gutter },
  list: { gap: spacing.lg },
});
