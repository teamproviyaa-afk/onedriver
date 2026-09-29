import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { spacing } from '@/theme';
import { AppText, ConfirmationSheet, InfoBanner, PrimaryButton, Screen } from '@/components/ui';
import { getDataProvider } from '@/providers';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { ApiError, type DocumentKind, type RiderDocument } from '@/types';
import { isLocalDemo } from '@/config/env';
import { isValidPan, normalizePan, parseDob } from '@/domain/kyc';
import { DocumentCard, FormField, KycStepper, OnboardingHeader, PhotoSheet, isValidLicence, normalizeLicence, type DocumentCardStatus } from '@/features/onboarding/components';

const REQUIRED: DocumentKind[] = ['aadhaar', 'pan', 'selfie', 'dl'];

type Busy = 'digilocker' | 'pan' | 'selfie' | 'dl' | null;
type Sheet = 'pan' | 'selfie' | 'dl' | null;

const errorText = (e: unknown, fallback: string) => (ApiError.is(e) ? e.detail : e instanceof Error ? e.message : fallback);

/**
 * store-kyc ("KYC Verification") / solo-kyc ("Rider KYC setup", step 3 of 4), verified by Cashfree
 * Secure ID on the server: Aadhaar through DigiLocker, PAN (matched to the Aadhaar name), selfie
 * liveness + face match with the Aadhaar photo, and the driving licence. Each check answers
 * verified / pending / rejected with a reason; results are mirrored into the onboarding draft.
 */
export default function KycScreen() {
  // DigiLocker returns here (onelocalrider://onboarding/kyc?digilocker=<id>) if the app was reopened.
  const { digilocker } = useLocalSearchParams<{ digilocker?: string }>();
  const riderType = useOnboardingStore((s) => s.riderType);
  const documents = useOnboardingStore((s) => s.documents);
  const patch = useOnboardingStore((s) => s.patch);
  const complete = useOnboardingStore((s) => s.complete);
  const isStore = riderType === 'store';
  const variant = isStore ? 'store' : 'solo';

  const [busy, setBusy] = useState<Busy>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [dlNumber, setDlNumber] = useState(documents.dl?.number ?? '');
  const [dob, setDob] = useState('');
  const [pan, setPan] = useState('');
  const [pendingVid, setPendingVid] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const record = (doc: RiderDocument, number?: string) => {
    const current = useOnboardingStore.getState().documents;
    patch({ documents: { ...current, [doc.kind]: { status: doc.status, assetId: doc.assetId, number: number ?? current[doc.kind]?.number, source: doc.source ?? 'upload', reason: doc.rejectionReason } } });
    return doc;
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

  const aadhaarVerified = documents.aadhaar?.status === 'verified';
  const returnedVid = typeof digilocker === 'string' && digilocker !== 'demo' ? digilocker : undefined;
  // A refused session is never resumed: the rider starts a new DigiLocker session instead.
  const resumeVid = aadhaarVerified || documents.aadhaar?.status === 'rejected' ? undefined : (pendingVid ?? returnedVid);

  /** Asks the server for the DigiLocker result (Cashfree Secure ID) and moves on to PAN once Aadhaar is verified. */
  const finishDigilocker = async (verificationId: string | undefined) => {
    const aadhaar = record(await getDataProvider().submitDocument({ kind: 'aadhaar', source: 'digilocker', verificationId }));
    setPendingVid(aadhaar.status === 'pending' ? verificationId : undefined);
    if (aadhaar.status === 'verified' && useOnboardingStore.getState().documents.pan?.status !== 'verified') setSheet('pan');
  };

  const runDigilocker = async () => {
    setBusy('digilocker');
    setError(null);
    try {
      if (resumeVid) {
        await finishDigilocker(resumeVid);
        return;
      }
      const { redirectUrl, verificationId } = await getDataProvider().startDigilocker();
      // The rider signs in to DigiLocker in the system browser; DigiLocker sends them back to this screen.
      if (!isLocalDemo) await WebBrowser.openAuthSessionAsync(redirectUrl, Linking.createURL('/onboarding/kyc'));
      await finishDigilocker(verificationId);
    } catch (e) {
      setError(errorText(e, 'DigiLocker is unavailable right now. Try again in a moment.'));
    } finally {
      setBusy(null);
    }
  };

  const onIdAction = () => {
    if (!aadhaarVerified) void runDigilocker();
    else setSheet('pan');
  };

  const verifyPan = async () => {
    const value = normalizePan(pan);
    if (!isValidPan(value)) return;
    setBusy('pan');
    setError(null);
    try {
      const doc = record(await getDataProvider().submitDocument({ kind: 'pan', number: value, source: 'upload' }));
      if (doc.status !== 'rejected') {
        setSheet(null);
        setPan('');
      }
    } catch (e) {
      setError(errorText(e, 'Could not verify your PAN. Try again.'));
      setSheet(null);
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
    const birthDate = aadhaarVerified ? undefined : (parseDob(dob) ?? undefined);
    if (!aadhaarVerified && !birthDate) return;
    setBusy('dl');
    setError(null);
    try {
      const provider = getDataProvider();
      const { assetId } = await provider.createUpload('dl', 'image/jpeg', uri);
      record(await provider.submitDocument({ kind: 'dl', assetId, number, source: 'upload', dob: birthDate }), number);
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

  const aadhaar = documents.aadhaar;
  const panDoc = documents.pan;
  const idSubtitle =
    idStatus === 'verified'
      ? 'Aadhaar (DigiLocker) and PAN verified'
      : aadhaar?.status === 'rejected'
        ? (aadhaar.reason ?? 'Verification failed · link again via DigiLocker')
        : resumeVid
          ? (aadhaar?.reason ?? 'Back from DigiLocker? Tap to finish')
          : !aadhaarVerified
            ? isStore
              ? 'Verify instantly via DigiLocker'
              : 'Linked via OTP instantly'
            : panDoc?.status === 'rejected'
              ? (panDoc.reason ?? 'PAN rejected · check the number')
              : 'Aadhaar verified · add your PAN';
  const selfieSubtitle =
    selfieStatus === 'verified'
      ? 'Liveness and face match verified'
      : selfieStatus === 'pending'
        ? (documents.selfie?.reason ?? 'Submitted · liveness check in progress')
        : selfieStatus === 'todo'
          ? 'Ensure neutral lighting'
          : (documents.selfie?.reason ?? 'Selfie rejected · capture again in good light');
  const dlSubtitle =
    dlStatus === 'verified' ? 'Licence verified' : dlStatus === 'pending' ? (documents.dl?.reason ?? 'Pending validation') : dlStatus === 'todo' ? 'Reviewing front & back layout' : (documents.dl?.reason ?? 'Licence rejected · check the number');

  const licenceValid = isValidLicence(dlNumber);
  const dobValid = aadhaarVerified || parseDob(dob) !== null;
  const panValid = isValidPan(pan);
  // A card is actionable while any of its checks can still be done.
  const idCardStatus: DocumentCardStatus = idStatus === 'todo' && aadhaarVerified ? 'pending' : idStatus;

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
        <DocumentCard index={1} variant={variant} title={isStore ? 'Aadhaar & PAN Upload' : 'Aadhaar / PAN Card'} subtitle={idSubtitle} status={idCardStatus} onAction={onIdAction} busy={busy === 'digilocker' || busy === 'pan'} />
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
        canConfirm={licenceValid && dobValid}
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
        {aadhaarVerified ? null : (
          <FormField
            label="Date of birth (as on the licence)"
            placeholder="DD-MM-YYYY"
            value={dob}
            onChangeText={setDob}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            maxLength={10}
            helper="Not needed once Aadhaar is verified."
            error={dob.length >= 10 && !parseDob(dob) ? 'Enter a valid date as DD-MM-YYYY.' : null}
          />
        )}
      </PhotoSheet>
      <ConfirmationSheet
        visible={sheet === 'pan'}
        onClose={() => (busy === 'pan' ? undefined : setSheet(null))}
        icon="credit-card"
        title="Add your PAN"
        body={documents.pan?.status === 'rejected' && documents.pan.reason ? documents.pan.reason : 'We check it with the Income Tax records and match it to the name on your Aadhaar.'}
        confirmLabel="VERIFY PAN"
        onConfirm={panValid ? verifyPan : () => undefined}
        loading={busy === 'pan'}>
        <View style={styles.sheetField}>
          <FormField
            label="PAN number"
            placeholder="ABCDE1234F"
            value={pan}
            onChangeText={(t) => setPan(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
            error={pan.length === 10 && !panValid ? 'A PAN has 5 letters, 4 digits and a letter, e.g. ABCDE1234F.' : null}
          />
        </View>
      </ConfirmationSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.gutter },
  list: { gap: spacing.lg },
  sheetField: { alignSelf: 'stretch' },
});
