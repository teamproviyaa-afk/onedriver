import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, GhostButton, Icon, PrimaryButton } from '@/components/ui';
import { colors, spacing } from '@/theme';
import type { DocumentKind, RiderDocument, RiderType, StatusInfo } from '@/types';
import { DOCUMENT_LABELS } from './labels';
import { BulletCard, DangerCta, StatusShell, type BulletRow } from './StatusShell';

interface CommonProps {
  onSignOut: () => void;
  signingOut?: boolean;
}

const STORE_REVIEW_COPY = 'We are verifying your Aadhaar, PAN, and RC documents. Verification typically takes less than 2 hours.';
const SOLO_REVIEW_COPY = 'Our verification agents are reviewing your profile, background check, and uploaded vehicle certificate.';
const ETA_FALLBACK = 'Usually under 24 hours';

const DEFAULT_CHECKS: NonNullable<StatusInfo['checks']> = [
  { label: 'Rider profile completed', done: true },
  { label: 'Documents uploaded successfully', done: true },
];

const WAITING_ROWS = (info: StatusInfo): BulletRow[] => [
  { icon: 'clock', text: info.etaText ?? 'Usually takes less than 24 hours', variant: 'bodySemi' },
  { icon: 'bell', text: "We'll notify you via SMS instantly", variant: 'bodySemi' },
];

/** approval-pending-store detail block: "RIDER ID: …" (Medium 13) + "Estimated dispatch time: …" (ExtraBold 14). */
const DispatchInfo = ({ riderCode, etaText, copy }: { riderCode?: string; etaText?: string; copy?: string }) => (
  <View style={styles.statusInfo}>
    {riderCode ? (
      <AppText variant="body" color="textSecondary" align="center" style={styles.riderId}>
        {`RIDER ID: ${riderCode}`}
      </AppText>
    ) : null}
    {copy ? (
      <AppText variant="body" color="textSecondary" align="center" style={styles.reviewCopy}>
        {copy}
      </AppText>
    ) : null}
    <AppText variant="title" align="center">
      {`Estimated dispatch time: ${etaText ?? ETA_FALLBACK}`}
    </AppText>
  </View>
);

/** application-submitted: "Application Filed" + SUBMITTED, the checks timeline, View Profile Details (+ Refresh Status). */
export const SubmittedVariant = ({ info, riderType, riderCode, onViewDetails, onRefresh, refreshing, onSignOut, signingOut }: CommonProps & { info: StatusInfo; riderType?: RiderType; riderCode?: string; onViewDetails: () => void; onRefresh: () => void; refreshing: boolean }) => {
  const checks = info.checks?.length ? info.checks : DEFAULT_CHECKS;
  return (
    <StatusShell
      title="Application Filed"
      subtitle="Your official onboarding registration packet has been secured."
      tone="green"
      icon="check"
      badge="SUBMITTED"
      onSignOut={onSignOut}
      signingOut={signingOut}
      footer={<PrimaryButton label="View Profile Details" onPress={onViewDetails} />}
      secondary={<GhostButton label={refreshing ? 'Refreshing…' : 'Refresh Status'} icon="refresh-cw" iconPosition="left" color={colors.textSecondary} onPress={onRefresh} disabled={refreshing} />}>
      <BulletCard radius={42} gap={spacing.xxl} rows={checks.map((c) => ({ icon: c.done ? 'check' : 'clock', text: c.label, muted: !c.done }))} />
      <DispatchInfo riderCode={riderCode} etaText={info.etaText} copy={riderType === 'store' ? STORE_REVIEW_COPY : SOLO_REVIEW_COPY} />
    </StatusShell>
  );
};

/** verification-pending (+ approval-pending-store/solo content): "Approval Pending" with the IN REVIEW badge. */
export const VerificationPendingVariant = ({ info, riderType, riderCode, onRefresh, refreshing, onSignOut, signingOut }: CommonProps & { info: StatusInfo; riderType?: RiderType; riderCode?: string; onRefresh: () => void; refreshing: boolean }) => {
  const isStore = riderType === 'store';
  const rows: BulletRow[] = info.checks?.length ? info.checks.map((c) => ({ icon: c.done ? 'check' : 'clock', text: c.label, muted: !c.done, variant: isStore ? 'label' : 'bodySemi', size: isStore ? 12 : 13 })) : WAITING_ROWS(info);
  return (
    <StatusShell
      title="Approval Pending"
      subtitle={isStore ? STORE_REVIEW_COPY : SOLO_REVIEW_COPY}
      tone="green"
      icon="clock"
      badge="IN REVIEW"
      onSignOut={onSignOut}
      signingOut={signingOut}
      footer={<PrimaryButton label={isStore ? 'Refresh Status' : 'Check Status Updates'} onPress={onRefresh} loading={refreshing} />}>
      {isStore ? <DispatchInfo riderCode={riderCode} etaText={info.etaText} /> : null}
      <BulletCard radius={isStore ? 38 : 40} rows={rows} />
    </StatusShell>
  );
};

/** approved: tinted illustration, READY TO RIDE, first-ride bonus card, Go Online Now. */
export const ApprovedVariant = ({ onGoOnline, busy, onSignOut, signingOut }: CommonProps & { onGoOnline: () => void; busy: boolean }) => (
  <StatusShell
    title="You're Approved!"
    subtitle="Welcome to the OneLocal Rider fleet. Your account is active and primed for dispatch."
    tone="green"
    icon="check"
    badge="READY TO RIDE"
    cardBackground={colors.surfaceLime}
    onSignOut={onSignOut}
    signingOut={signingOut}
    footer={<PrimaryButton label="Go Online Now" onPress={onGoOnline} loading={busy} />}>
    <View style={styles.welcomeCard} accessibilityRole="summary">
      <AppText variant="titleLg" style={styles.welcomeTitle}>
        First Ride Bonus Enabled
      </AppText>
      <AppText variant="bodySm" color="textSecondary" style={styles.body13}>
        Complete 3 trips today to earn an additional ₹500 directly in your wallet.
      </AppText>
    </View>
  </StatusShell>
);

const FALLBACK_REJECT_REASON = 'One or more uploaded documents were blurry, cropped or did not match your profile. Please ensure all 4 corners and the expiry date are fully visible.';

/** rejected: red palette, rejection reason card, red Re-upload Documents CTA. */
export const RejectedVariant = ({ info, onReupload, onSignOut, signingOut }: CommonProps & { info: StatusInfo; onReupload: () => void }) => (
  <StatusShell
    title="Application Rejected"
    subtitle={info.reason ? 'We found discrepancies in the details provided. Review the reason below and re-upload.' : 'We found discrepancies in the documents provided.'}
    tone="red"
    icon="alert-triangle"
    badge="ACTION REQUIRED"
    badgeTone="danger"
    cardBackground={colors.surfaceDanger}
    cardBorder={colors.danger}
    onSignOut={onSignOut}
    signingOut={signingOut}
    footer={<DangerCta label="Re-upload Documents" onPress={onReupload} />}>
    <View style={styles.reasonCard} accessibilityLiveRegion="polite">
      <AppText variant="title" color="danger">
        Rejection Reason:
      </AppText>
      <AppText variant="bodySm" color="textSecondary" style={styles.body13}>
        {info.reason ?? FALLBACK_REJECT_REASON}
      </AppText>
    </View>
  </StatusShell>
);

const formatExpiry = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/** documents-expired: the named expired document(s) — each row and the CTA open the KYC upload flow. */
export const DocumentsExpiredVariant = ({ info, documents, onUpload, onSignOut, signingOut }: CommonProps & { info: StatusInfo; documents: RiderDocument[]; onUpload: () => void }) => {
  const kinds: DocumentKind[] = info.expiredDocuments.length ? info.expiredDocuments : documents.filter((d) => d.status === 'expired').map((d) => d.kind);
  const first = kinds[0];
  const firstDoc = documents.find((d) => d.kind === first);
  const expiredOn = formatExpiry(firstDoc?.expiresOn);
  const name = first ? DOCUMENT_LABELS[first] : 'document';
  const subtitle = first
    ? `Your ${name.toLowerCase()}${expiredOn ? ` expired on ${expiredOn}` : ' has expired'}. Please update to resume receiving jobs.`
    : 'One of your documents has expired. Please update it to resume receiving jobs.';
  const listed: DocumentKind[] = kinds.length ? kinds : ['fitness'];
  return (
    <StatusShell
      title="Documents Expired"
      subtitle={subtitle}
      tone="red"
      icon="alert-triangle"
      badge="EXPIRED"
      cardBackground={colors.surfaceDanger}
      onSignOut={onSignOut}
      signingOut={signingOut}
      footer={<PrimaryButton label={first === 'fitness' ? 'Upload Valid Certificate' : 'Upload Valid Document'} onPress={onUpload} />}>
      <View style={styles.docList}>
        {listed.map((k) => (
          <Pressable key={k} accessibilityRole="button" accessibilityLabel={`${DOCUMENT_LABELS[k]}, expired. Upload a new copy`} onPress={onUpload} style={({ pressed }) => [styles.docRow, pressed && styles.pressed]}>
            <Icon name="file" size={20} strokeWidth={2.25} />
            <AppText variant="bodyBold" style={styles.docName} numberOfLines={1}>
              {DOCUMENT_LABELS[k]}
            </AppText>
            <AppText variant="label" color="danger" uppercase>
              EXPIRED
            </AppText>
          </Pressable>
        ))}
      </View>
    </StatusShell>
  );
};

/** account-suspended: no back button, red palette, Contact Support Hotline. */
export const SuspendedVariant = ({ info, onContactSupport, onSignOut, signingOut }: CommonProps & { info: StatusInfo; onContactSupport: () => void }) => (
  <StatusShell
    title="Account Suspended"
    subtitle={info.reason ? `Your access has been temporarily restricted: ${info.reason}.` : 'Your access has been temporarily restricted due to policy violations.'}
    tone="red"
    icon="alert-octagon"
    badge="RESTRICTED"
    badgeTone="danger"
    cardBackground={colors.surfaceDanger}
    cardBorder={colors.danger}
    showBack={false}
    onSignOut={onSignOut}
    signingOut={signingOut}
    footer={<DangerCta label="Contact Support Hotline" onPress={onContactSupport} />}>
    <View style={styles.infoCard}>
      <AppText variant="title">What does this mean?</AppText>
      <AppText variant="bodySm" color="textSecondary" style={styles.body13}>
        You cannot go online, accept customer offers, or cash out your current wallet earnings. To dispute this claim, contact support.
      </AppText>
    </View>
  </StatusShell>
);

/** draft: the application was never submitted (e.g. reinstalled app) — send the rider back into onboarding. */
export const DraftVariant = ({ onContinue, onSignOut, signingOut }: CommonProps & { onContinue: () => void }) => (
  <StatusShell
    title="Finish your application"
    subtitle="A few onboarding steps are still pending before we can review your profile."
    tone="green"
    icon="clipboard-check"
    badge="IN PROGRESS"
    onSignOut={onSignOut}
    signingOut={signingOut}
    footer={<PrimaryButton label="Continue Onboarding" onPress={onContinue} />}
  />
);

const styles = StyleSheet.create({
  statusInfo: { gap: spacing.lg, alignSelf: 'stretch' },
  riderId: { fontSize: 13, lineHeight: 18 },
  reviewCopy: { lineHeight: 21 },
  welcomeCard: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 48, padding: spacing.xxl, gap: spacing.md, alignSelf: 'stretch' },
  welcomeTitle: { fontSize: 15, lineHeight: 20 },
  body13: { fontSize: 13, lineHeight: 18 },
  reasonCard: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.danger, borderRadius: 32, padding: spacing.xxl, gap: spacing.md, alignSelf: 'stretch' },
  docList: { gap: spacing.md, alignSelf: 'stretch' },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, padding: spacing.lg, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, minHeight: 48 },
  pressed: { opacity: 0.85 },
  docName: { flex: 1 },
  infoCard: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 32, padding: spacing.xxl, gap: spacing.base, alignSelf: 'stretch' },
});
