import { useCallback, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, BottomSheet, Icon, PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { PhotoCapture } from '@/components/app';
import { colors, spacing } from '@/theme';
import { ApiError, type AppLanguage } from '@/types';
import { getDataProvider } from '@/providers';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { useRiderStore } from '@/stores/useRiderStore';
import { PhoneField, PillField } from '@/features/auth/FormFields';
import { normalizePhone, profileSchema, type ProfileFormInput, type ProfileFormOutput } from '@/features/auth/phone';
import { zodResolver } from '@/features/auth/zodResolver';

const LANGUAGES: { code: AppLanguage; label: string; a11y: string }[] = [
  { code: 'en', label: 'English', a11y: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)', a11y: 'Hindi' },
  { code: 'mr', label: 'मराठी (Marathi)', a11y: 'Marathi' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kan)', a11y: 'Kannada' },
];

const PHOTO_PLACEHOLDER = require('@/assets/figma/avatar-rider-profile.png');

/**
 * Rider profile (Figma screen-profile-setup): selfie, legal name, emergency contact
 * and app language. Saved through the data provider, mirrored into the onboarding draft.
 */
export default function ProfileSetupScreen() {
  const draftName = useOnboardingStore((s) => s.fullName);
  const draftEmergency = useOnboardingStore((s) => s.emergencyPhone);
  const draftLanguage = useOnboardingStore((s) => s.language);
  const draftPhotoUri = useOnboardingStore((s) => s.photoUri);
  const pendingName = useAuthStore((s) => s.pendingRegistration?.fullName);
  const ownPhone = useAuthStore((s) => s.session?.phone ?? s.pendingPhone);
  const meName = useRiderStore((s) => s.me?.rider.fullName);
  const meEmail = useRiderStore((s) => s.me?.rider.email);

  const [photoUri, setPhotoUri] = useState<string | null>(draftPhotoUri ?? null);
  const [sheet, setSheet] = useState(false);
  const [draftPhoto, setDraftPhoto] = useState<string | null>(null);
  const captureRef = useRef<(() => Promise<void>) | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const emergencyRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProfileFormInput, unknown, ProfileFormOutput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: draftName || pendingName || meName || '', emergencyPhone: draftEmergency, email: meEmail ?? '', language: draftLanguage },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const openPhotoSheet = useCallback(() => {
    Keyboard.dismiss();
    setDraftPhoto(null);
    setSheet(true);
  }, []);

  const usePhoto = useCallback(() => {
    if (!draftPhoto) return;
    setPhotoUri(draftPhoto);
    // A new picture invalidates any asset id uploaded for the previous one.
    useOnboardingStore.getState().patch({ photoUri: draftPhoto, photoAssetId: undefined });
    setSheet(false);
  }, [draftPhoto]);

  const onSave = useCallback(
    async (values: ProfileFormOutput) => {
      Keyboard.dismiss();
      if (ownPhone && normalizePhone(ownPhone) === values.emergencyPhone) {
        setError('emergencyPhone', { type: 'manual', message: 'Emergency contact must be a different number from yours' });
        return;
      }
      setSaving(true);
      setSaveError(null);
      try {
        const provider = getDataProvider();
        const onboarding = useOnboardingStore.getState();
        // The API only stores an uploaded asset id; reuse the draft's id when the same picture was already uploaded.
        let photoAssetId = photoUri && onboarding.photoUri === photoUri ? onboarding.photoAssetId : undefined;
        if (photoUri && !photoAssetId) {
          photoAssetId = (await provider.createUpload('profile_photo', 'image/jpeg', photoUri)).assetId;
          onboarding.patch({ photoUri, photoAssetId });
        }
        const rider = await provider.updateProfile({
          fullName: values.fullName,
          emergencyPhone: values.emergencyPhone,
          email: values.email,
          language: values.language,
          photoUri: photoUri ?? undefined,
          photoAssetId,
        });
        onboarding.patch({ fullName: values.fullName, emergencyPhone: values.emergencyPhone, language: values.language, photoUri: photoUri ?? undefined, photoAssetId });
        onboarding.complete('profile');
        useRiderStore.getState().patchMe({ rider });
        router.push('/onboarding/zone' as never);
      } catch (e) {
        setSaveError(ApiError.is(e) ? e.detail : 'Could not save your profile. Check your connection and try again.');
      } finally {
        setSaving(false);
      }
    },
    [ownPhone, photoUri, setError],
  );

  return (
    <Screen scroll keyboard contentStyle={styles.content}>
      <View style={styles.top}>
        <View style={styles.header}>
          <AppText variant="display" accessibilityRole="header">
            Rider Profile
          </AppText>
          <AppText variant="bodyLg" color="textSecondary" style={styles.subtext}>
            Complete details to request app approval
          </AppText>
        </View>

        <Pressable onPress={openPhotoSheet} disabled={saving} accessibilityRole="button" accessibilityLabel={photoUri ? 'Change profile photo' : 'Upload profile photo'} style={({ pressed }) => [styles.photoArea, pressed && styles.pressed]}>
          <View style={styles.avatar}>
            {photoUri ? <Image source={{ uri: photoUri }} style={styles.avatarImage} resizeMode="cover" accessible={false} /> : <Icon name="user" size={44} color="textSecondary" strokeWidth={1.75} />}
            <View style={styles.cameraBadge}>
              <Icon name="camera" size={16} strokeWidth={2.25} />
            </View>
          </View>
          <AppText variant="bodyBold" uppercase style={styles.photoLabel}>
            {photoUri ? 'Change photo' : 'Upload photo'}
          </AppText>
        </Pressable>

        <View style={styles.form}>
          <Controller
            control={control}
            name="fullName"
            render={({ field: { value, onChange, onBlur } }) => (
              <PillField
                label="Full Name (as in Aadhaar)"
                placeholder="eg. Rahul Sharma"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                boldValue
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                onSubmitEditing={() => emergencyRef.current?.focus()}
                editable={!saving}
                error={errors.fullName?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="emergencyPhone"
            render={({ field: { value, onChange, onBlur } }) => (
              <PhoneField
                ref={emergencyRef}
                label="Emergency Contact Number"
                placeholder="98765 00000"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                editable={!saving}
                error={errors.emergencyPhone?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="email"
            render={({ field: { value, onChange, onBlur } }) => (
              <PillField
                ref={emailRef}
                label="Email (optional)"
                placeholder="For statements and payouts"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="done"
                onSubmitEditing={() => void handleSubmit(onSave)()}
                editable={!saving}
                error={errors.email?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="language"
            render={({ field: { value, onChange } }) => (
              <View style={styles.languageSelector}>
                <AppText variant="bodyBold" uppercase>
                  Preferred App Language
                </AppText>
                <View style={styles.chips} accessibilityRole="radiogroup">
                  {LANGUAGES.map((l) => {
                    const selected = value === l.code;
                    return (
                      <Pressable
                        key={l.code}
                        onPress={() => onChange(l.code)}
                        disabled={saving}
                        accessibilityRole="radio"
                        accessibilityState={{ selected, checked: selected }}
                        accessibilityLabel={l.a11y}
                        style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
                        <AppText variant={selected ? 'chip' : 'bodySemi'} style={!selected && styles.chipLabelUnselected}>
                          {l.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                {errors.language?.message ? (
                  <AppText variant="bodySm" color="danger">
                    {errors.language.message}
                  </AppText>
                ) : null}
              </View>
            )}
          />
        </View>
      </View>

      <View style={styles.bottomArea}>
        {saveError ? (
          <AppText variant="bodySemi" color="danger" align="center" accessibilityLiveRegion="assertive">
            {saveError}
          </AppText>
        ) : null}
        <PrimaryButton label={saveError ? 'Try again' : 'Save & Submit Profile'} onPress={() => void handleSubmit(onSave)()} loading={saving} />
      </View>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Profile photo" dismissable>
        <AppText variant="body" color="textSecondary">
          Take a clear selfie with your face fully visible. It is stored privately and used for verification only.
        </AppText>
        <PhotoCapture value={draftPhoto} onChange={setDraftPhoto} height={300} captureRef={captureRef} placeholder={PHOTO_PLACEHOLDER} />
        {draftPhoto ? (
          <View style={styles.sheetActions}>
            <PrimaryButton label="Use this photo" icon="check" iconPosition="left" onPress={usePhoto} />
            <SecondaryButton label="Retake" onPress={() => setDraftPhoto(null)} />
          </View>
        ) : (
          <View style={styles.sheetActions}>
            <PrimaryButton label="Take selfie" icon="camera" iconPosition="left" onPress={() => void captureRef.current?.()} />
            <SecondaryButton label="Cancel" onPress={() => setSheet(false)} />
          </View>
        )}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'space-between' },
  top: { gap: spacing.gutter },
  header: { gap: spacing.xs, paddingTop: spacing.lg },
  subtext: { fontSize: 15, lineHeight: 21 },
  photoArea: { alignItems: 'center', gap: spacing.md, alignSelf: 'stretch', paddingTop: spacing.md, paddingBottom: spacing.x3l },
  pressed: { opacity: 0.8 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  avatarImage: { width: 92, height: 92, borderRadius: 46 },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.lime,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLabel: { fontSize: 13, lineHeight: 18 },
  form: { gap: spacing.xl, alignItems: 'stretch' },
  languageSelector: { gap: spacing.md, alignSelf: 'stretch' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'flex-start' },
  chip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.base,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.lime },
  chipLabelUnselected: { fontSize: 13, lineHeight: 18 },
  bottomArea: { gap: spacing.lg, paddingTop: spacing.gutter, paddingBottom: spacing.lg },
  sheetActions: { gap: spacing.lg },
});
