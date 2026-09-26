import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, shadows, spacing } from '@/theme';
import { AppText, LoadingState, PrimaryButton, Screen, TextField, toast } from '@/components/ui';
import { AppHeader, QRCodeScanner, SegmentedControl } from '@/components/app';
import { useJobActions } from '@/hooks';
import { useDeliveryStore } from '@/stores';
import { ApiError, type PickupVerifyMethod, type PickupVerifyResult } from '@/types';
import { routeForJob } from '@/state-machine/deliveryStateMachine';
import { getDemoProvider } from '@/providers';
import { isLocalDemo } from '@/config/env';
import { useJobScreen } from '@/features/delivery/useJobScreen';
import { errorMessage } from '@/features/delivery/errors';
import { JobScreenFallback, figmaText } from '@/features/delivery/components';
import { itemsForVerify, usePickupChecklistStore } from '@/features/pickup/pickupChecklistStore';

const MODES: { value: PickupVerifyMethod; label: string }[] = [
  { value: 'scan', label: 'SCAN QR' },
  { value: 'code', label: 'ENTER CODE' },
  { value: 'bypass', label: 'BYPASS' },
];

/**
 * Order Verification (Figma pickup-verification): scan the merchant receipt / box barcode,
 * type the code manually, or bypass with a reason. Every path calls `verifyPickup` with the
 * at-pickup checklist; the result decides the next screen (done / mismatch / incomplete).
 */
export default function PickupVerificationScreen() {
  const { id, bypass } = useLocalSearchParams<{ id: string; bypass?: string }>();
  const { job, isLoading, error, refetch, lockRedirect, unlockRedirect } = useJobScreen(id, ['at_pickup']);
  const { verifyPickup } = useJobActions();
  const checkedIds = usePickupChecklistStore((s) => (id ? s.byJob[id] : undefined));
  const clearChecklist = usePickupChecklistStore((s) => s.clear);
  const [mode, setMode] = useState<PickupVerifyMethod>(() => (bypass === '1' ? 'bypass' : 'scan'));
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  /** Bumped after a failed scan attempt so the scanner remounts and can scan again. */
  const [scanEpoch, setScanEpoch] = useState(0);
  const [demoCode, setDemoCode] = useState<string | undefined>();

  useEffect(() => {
    if (!isLocalDemo || !id) return;
    let cancelled = false;
    void getDemoProvider()
      ?.getDemoPickupCode(id)
      .then((v) => !cancelled && setDemoCode(v))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!job) return <JobScreenFallback error={isLoading ? null : error} onRetry={refetch} label="Loading order…" />;

  const items = itemsForVerify(job, checkedIds);
  const base = `/job/${job.id}/pickup`;

  const finish = (res: PickupVerifyResult) => {
    if (res.result === 'verified') {
      clearChecklist(job.id);
      router.replace(`${base}/done` as never);
    } else if (res.result === 'mismatch') {
      router.replace(`${base}/mismatch?expected=${encodeURIComponent(res.expectedSku)}&scanned=${encodeURIComponent(res.scanned)}` as never);
    } else {
      router.replace(`${base}/incomplete?missing=${encodeURIComponent(JSON.stringify(res.missing))}` as never);
    }
  };

  const submit = async (input: { method: PickupVerifyMethod; code?: string; reason?: string }) => {
    if (busy) return;
    setBusy(true);
    lockRedirect();
    try {
      const res = await verifyPickup(job, { ...input, items });
      finish(res);
    } catch (e) {
      unlockRedirect();
      if (input.method === 'scan') setScanEpoch((n) => n + 1);
      if (ApiError.is(e)) {
        toast.error(e.detail || errorMessage(e));
        if (e.code === 'version_conflict') {
          // The action already refreshed the job from the server; follow whatever state it is in now.
          const latest = useDeliveryStore.getState().job;
          if (latest && latest.id === job.id) router.replace(routeForJob(latest) as never);
        }
      } else {
        toast.error(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(base as never));
  const codeReady = code.trim().length > 0;
  const reasonReady = reason.trim().length >= 3;
  const demoHint =
    isLocalDemo && demoCode && mode !== 'bypass' ? (
      <AppText variant="bodySm" color="textMuted" align="center">
        Demo code: {demoCode}
      </AppText>
    ) : null;

  return (
    <Screen scroll keyboard>
      <AppHeader title="Order Verification" onBack={goBack} onHelp={() => router.push('/support' as never)} />
      <View style={styles.body}>
        <AppText variant="body" color="textSecondary">
          Verify pickup details for Order {job.orderRef}
        </AppText>

        <SegmentedControl options={MODES} value={mode} onChange={setMode} />

        {mode === 'scan' ? (
          <>
            <QRCodeScanner key={scanEpoch} onScanned={(scanned) => void submit({ method: 'scan', code: scanned })} active={!busy} />
            {busy ? <LoadingState compact label="Verifying pickup…" /> : null}
            <View style={styles.fallback}>
              <AppText style={figmaText.body13} color="textSecondary" align="center">
                Having trouble scanning?
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Enter digits manually" disabled={busy} onPress={() => setMode('code')} style={({ pressed }) => [styles.manualButton, pressed && styles.pressed]}>
                <AppText variant="title">ENTER DIGITS MANUALLY</AppText>
              </Pressable>
            </View>
            {demoHint}
          </>
        ) : null}

        {mode === 'code' ? (
          <View style={styles.form}>
            <TextField
              label="Pickup code"
              placeholder="e.g. OL-9830"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => codeReady && void submit({ method: 'code', code: code.trim() })}
              editable={!busy}
              helper="The code is printed on the store receipt or the box label."
            />
            {demoHint}
            <PrimaryButton label="VERIFY CODE" onPress={() => void submit({ method: 'code', code: code.trim() })} disabled={!codeReady} loading={busy} />
          </View>
        ) : null}

        {mode === 'bypass' ? (
          <View style={styles.form}>
            <TextField
              label="Reason for bypass"
              placeholder="e.g. Receipt barcode is damaged"
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
              height={96}
              maxLength={240}
              editable={!busy}
              style={styles.multiline}
              helper="Bypass skips the barcode check. Operations review every bypass reason."
            />
            <PrimaryButton label="BYPASS WITH REASON" onPress={() => void submit({ method: 'bypass', reason: reason.trim() })} disabled={!reasonReady} loading={busy} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.xxl, paddingTop: spacing.lg },
  fallback: { gap: spacing.md, alignSelf: 'stretch' },
  manualButton: {
    backgroundColor: colors.surface,
    borderRadius: 21.5,
    minHeight: 44,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    ...shadows.soft,
  },
  pressed: { opacity: 0.85 },
  form: { gap: spacing.xxl, alignSelf: 'stretch' },
  multiline: { textAlignVertical: 'top', paddingVertical: spacing.lg },
});
