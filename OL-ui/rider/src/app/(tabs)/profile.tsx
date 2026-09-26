import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, Avatar, Card, ConfirmationSheet, Divider, ErrorState, Icon, LoadingState, Screen, StatusChip, toast, type IconName } from '@/components/ui';
import { AppHeader } from '@/components/app/AppHeader';
import { useAuthActions, useMe } from '@/hooks';
import { isDevBuild, isLocalDemo } from '@/config/env';
import { DEMO_RIDER_CODE } from '@/demo/constants';
import type { RiderStatus } from '@/types';
import { describePayout, usePayoutMethod } from '@/features/profile/payout';
import { documentPill, DOCUMENT_LABELS, formatPhoneDisplay, kycSummary, RIDER_TYPE_LABELS, sortDocuments, STATUS_LABELS, VEHICLE_CLASS_LABELS, type DocPillTone } from '@/features/profile/documents';

const PILL_COLORS: Record<DocPillTone, { bg: string; fg: string }> = {
  valid: { bg: colors.lime, fg: colors.ink },
  verified: { bg: colors.lime, fg: colors.ink },
  pending: { bg: colors.surfaceWarning, fg: colors.ink },
  rejected: { bg: colors.danger, fg: colors.surface },
  expired: { bg: colors.surfaceDanger, fg: colors.danger },
};

const STATUS_TONE: Record<RiderStatus, 'lime' | 'warning' | 'danger' | 'muted'> = {
  approved: 'lime',
  draft: 'muted',
  submitted: 'warning',
  verification_pending: 'warning',
  rejected: 'danger',
  documents_expired: 'danger',
  suspended: 'danger',
};

const ActionRow = ({ label, icon, iconColor = colors.ink, onPress, trailing }: { label: string; icon: IconName; iconColor?: string; onPress: () => void; trailing?: React.ReactNode }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
    <AppText variant="title" style={styles.actionLabel} numberOfLines={1}>
      {label}
    </AppText>
    <View style={styles.actionTrailing}>
      {trailing}
      <Icon name={icon} size={18} color={iconColor} />
    </View>
  </Pressable>
);

/**
 * Rider Profile (Figma profile): identity card, rider type / vehicle tier, KYC & compliance,
 * payout method, zone & hub and the account action rows. Data from useMe(); sign-out via
 * useAuthActions().signOut().
 */
export default function ProfileScreen() {
  const { data, isLoading, isError, refetch, isRefetching } = useMe();
  const { signOut, busy: signingOut } = useAuthActions();
  const rider = data?.rider ?? null;
  const payout = usePayoutMethod(rider);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  if (isLoading && !data) {
    return (
      <Screen>
        <AppHeader title="Rider Profile" backIcon="chevron-left" />
        <LoadingState label="Loading your profile…" />
      </Screen>
    );
  }
  if (!data || !rider) {
    return (
      <Screen>
        <AppHeader title="Rider Profile" backIcon="chevron-left" />
        <ErrorState title="Could not load your profile" body={isError ? 'Check your connection and try again.' : 'Sign in again to load your profile.'} onRetry={() => void refetch()} retryLabel={isRefetching ? 'Retrying…' : 'Retry'} />
      </Screen>
    );
  }

  const isDemoRider = isLocalDemo && rider.riderCode === DEMO_RIDER_CODE;
  const avatarSource = rider.photoUri ? { uri: rider.photoUri } : isDemoRider ? require('@/assets/figma/avatar-rider-profile.png') : null;
  const docs = sortDocuments(data.documents);
  const expiredKinds = rider.expiredDocuments ?? [];
  const kyc = kycSummary(docs, expiredKinds);
  const kycColor = kyc.tone === 'ok' ? colors.lime : kyc.tone === 'warning' ? colors.warning : colors.danger;
  const vehicle = data.vehicle;
  const payoutInfo = payout ? describePayout(payout) : null;

  const doSignOut = async () => {
    try {
      await signOut();
      setConfirmSignOut(false);
      router.replace('/sign-in' as never);
    } catch {
      toast.error('Could not sign out. Try again.');
    }
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <AppHeader title="Rider Profile" backIcon="chevron-left" onHelp={() => router.push('/support' as never)} />
      <View style={styles.body}>
        <Card radius={48} padding={spacing.xxl} row gap={spacing.xxl} style={styles.identity}>
          <Avatar name={rider.fullName} source={avatarSource} size={64} background={colors.surfaceLime} />
          <View style={styles.identityText}>
            <View style={styles.nameRow}>
              <AppText variant="h4" numberOfLines={1} style={styles.name}>
                {rider.fullName}
              </AppText>
              <View style={styles.tierBadge}>
                <AppText variant="labelXs" style={styles.tierText}>
                  {rider.tier.toUpperCase()}
                </AppText>
              </View>
            </View>
            <AppText variant="bodySm" color="textSecondary" style={styles.phone}>
              {formatPhoneDisplay(rider.phone)}
            </AppText>
            <AppText variant="mono" color="textMuted" style={styles.riderCode}>
              {rider.riderCode}
            </AppText>
          </View>
        </Card>

        <View style={styles.tierRow}>
          <View style={[styles.tierBox, styles.tierBoxLime]}>
            <AppText variant="labelXs" uppercase>
              RIDER TYPE
            </AppText>
            <AppText variant="titleLg" numberOfLines={1}>
              {RIDER_TYPE_LABELS[rider.type]}
            </AppText>
          </View>
          <View style={styles.tierBox}>
            <AppText variant="labelXs" color="textSecondary" uppercase>
              VEHICLE TIER
            </AppText>
            <AppText variant="titleLg" numberOfLines={1}>
              {vehicle ? (vehicle.model ?? VEHICLE_CLASS_LABELS[vehicle.class]) : 'Not added'}
            </AppText>
            {vehicle ? (
              <AppText variant="bodySm" color="textSecondary" numberOfLines={1}>
                {vehicle.registrationNo}
              </AppText>
            ) : null}
          </View>
        </View>

        <Card radius={32} padding={spacing.xxl} gap={spacing.lg}>
          <View style={styles.spaceBetween}>
            <AppText variant="titleSm">KYC & COMPLIANCE</AppText>
            <AppText variant="labelXs" color={kycColor} uppercase style={styles.kycStatus}>
              {kyc.label}
            </AppText>
          </View>
          <Divider color={colors.borderSubtle} />
          {docs.length ? (
            <View style={styles.docList}>
              {docs.map((doc) => {
                const pill = documentPill(doc, expiredKinds);
                const c = PILL_COLORS[pill.tone];
                return (
                  <View key={doc.id} style={styles.spaceBetween}>
                    <AppText variant="body" style={styles.docLabel}>
                      {DOCUMENT_LABELS[doc.kind]}
                    </AppText>
                    <View style={[styles.docPill, { backgroundColor: c.bg }]} accessibilityLabel={`${DOCUMENT_LABELS[doc.kind]} ${pill.label.toLowerCase()}`}>
                      <AppText variant="labelXs" color={c.fg}>
                        {pill.label}
                      </AppText>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <AppText variant="bodySm" color="textSecondary">
              No documents submitted yet. Open Documents below to upload them.
            </AppText>
          )}
        </Card>

        <Card radius={46.5} padding={spacing.xxl} gap={spacing.md} onPress={() => router.push((payout ? `/onboarding/payout/${payout.method}` : '/onboarding/payout/upi') as never)} accessibilityLabel={payoutInfo ? `Payout method: ${payoutInfo.title}` : 'Add a payout method'}>
          <AppText variant="titleSm">BANK PAYOUT METHOD</AppText>
          <View style={styles.payoutRow}>
            <Icon name={payoutInfo?.method === 'bank' ? 'landmark' : 'credit-card'} size={24} />
            <View style={styles.payoutText}>
              <AppText variant="title" numberOfLines={1}>
                {payoutInfo ? payoutInfo.title : 'No payout method yet'}
              </AppText>
              <AppText variant="bodySm" color="textSecondary" numberOfLines={1}>
                {payoutInfo ? payoutInfo.subtitle : 'Add UPI or a bank account to receive weekly payouts'}
              </AppText>
            </View>
            {payoutInfo && payoutInfo.status !== 'verified' ? <StatusChip label={payoutInfo.status} tone={payoutInfo.status === 'failed' ? 'danger' : 'warning'} size="sm" /> : <Icon name="chevron-right" size={18} color="textMuted" />}
          </View>
        </Card>

        <Card radius={32} padding={spacing.xxl} gap={spacing.md} onPress={data.hub ? undefined : () => router.push('/onboarding/hub' as never)} accessibilityLabel="Zone and hub">
          <AppText variant="titleSm">ZONE & HUB</AppText>
          <View style={styles.payoutRow}>
            <Icon name="map-pin" size={24} />
            <View style={styles.payoutText}>
              <AppText variant="title" numberOfLines={1}>
                {data.zone?.name ?? 'Zone not set'}
              </AppText>
              <AppText variant="bodySm" color="textSecondary" numberOfLines={2}>
                {data.hub ? `${data.hub.name} · ${data.hub.address}` : 'Set your hub to receive nearby offers'}
              </AppText>
            </View>
          </View>
        </Card>

        <View style={styles.actions}>
          <ActionRow label="Emergency SOS Protocol" icon="shield-alert" iconColor={colors.danger} onPress={() => router.push('/sos' as never)} />
          <ActionRow label="Help & Support Ticket Center" icon="help-circle" onPress={() => router.push('/support' as never)} />
          <ActionRow label="Documents" icon="file-text" onPress={() => router.push('/onboarding/kyc' as never)} />
          <ActionRow label="Account status" icon="chevron-right" iconColor={colors.textMuted} onPress={() => router.push('/status' as never)} trailing={<StatusChip label={STATUS_LABELS[rider.status]} tone={STATUS_TONE[rider.status]} size="sm" />} />
          {isDevBuild ? <ActionRow label="Developer scenarios" icon="settings" onPress={() => router.push('/dev/scenarios' as never)} /> : null}
          <ActionRow label="Sign out" icon="log-out" iconColor={colors.danger} onPress={() => setConfirmSignOut(true)} />
        </View>
      </View>

      <ConfirmationSheet
        visible={confirmSignOut}
        onClose={() => (signingOut ? undefined : setConfirmSignOut(false))}
        title="Sign out?"
        body="You will go offline and need your phone number and OTP to sign back in."
        icon="log-out"
        tone="danger"
        confirmLabel="SIGN OUT"
        cancelLabel="STAY SIGNED IN"
        loading={signingOut}
        onConfirm={doSignOut}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.x3l },
  body: { gap: spacing.xxl, paddingTop: spacing.lg },
  identity: { alignItems: 'center' },
  identityText: { flex: 1, gap: spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1 },
  tierBadge: { backgroundColor: colors.lime, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  tierText: { fontSize: 9, lineHeight: 12 },
  phone: { fontSize: 13, lineHeight: 18 },
  riderCode: { fontSize: 12, lineHeight: 16 },
  tierRow: { flexDirection: 'row', gap: spacing.base },
  tierBox: { flex: 1, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 32, padding: spacing.lg, gap: spacing.xs },
  tierBoxLime: { backgroundColor: colors.lime },
  spaceBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  kycStatus: { fontSize: 11, lineHeight: 15 },
  docList: { gap: spacing.md },
  docLabel: { fontSize: 13, lineHeight: 18, flex: 1 },
  docPill: { borderRadius: 9, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  payoutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  payoutText: { flex: 1 },
  actions: { gap: spacing.md },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 23.5, padding: spacing.xl, minHeight: 52 },
  actionLabel: { flex: 1 },
  actionTrailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pressed: { opacity: 0.9 },
});
