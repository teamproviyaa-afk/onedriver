import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppText, Card, ErrorState, Icon, LoadingState, PrimaryButton, Screen, type IconName } from '@/components/ui';
import { AppHeader } from '@/components/app';
import { useJobDetail } from '@/hooks';
import { isTerminal, routeForJob, STATE_LABELS } from '@/state-machine/deliveryStateMachine';
import { canSeeDropAddress } from '@/domain/privacy';
import { GEOFENCE } from '@/domain/geofence';
import { colors, fontFamily, radius, spacing } from '@/theme';
import { formatClock, formatDateShort, formatINR, formatKm, formatMeters } from '@/utils/format';
import { isSameLocalDay } from '@/utils/time';
import type { DeliveryEvent, JobState, RiderFlowState } from '@/types';

const inr = (n: number) => formatINR(n, { decimals: 2 });

/** Figma uses near-black (#000) values on the #121212 card — rendered white/lime here for legibility. */
const DARK_LABEL = '#E5E5E0';
const DARK_DIVIDER = 'rgba(255, 255, 255, 0.16)';

interface Outcome {
  verb: string;
  banner: string;
  icon: IconName;
  bg: string;
  fg: string;
}

/** Terminal outcomes → header verb + banner pill (Figma: dark-green pill with lime "DELIVERED SUCCESSFULLY"). */
const OUTCOME: Partial<Record<JobState, Outcome>> = {
  delivered: { verb: 'COMPLETED', banner: 'DELIVERED SUCCESSFULLY', icon: 'circle-check', bg: colors.darkAction, fg: colors.limeBright },
  failed: { verb: 'FAILED', banner: 'DELIVERY FAILED', icon: 'x', bg: colors.danger, fg: colors.surface },
  returned: { verb: 'RETURNED', banner: 'RETURNED TO STORE', icon: 'rotate-ccw', bg: colors.surfaceWarning, fg: colors.ink },
  cancelled: { verb: 'CANCELLED', banner: 'ORDER CANCELLED', icon: 'ban', bg: colors.surfaceMuted, fg: colors.ink },
};

const PROOF_METHOD: Record<string, string> = { otp: 'OTP', photo: 'PHOTO', signature: 'SIGNATURE' };

const labelFor = (state: JobState) => STATE_LABELS[state as RiderFlowState];

const dayWord = (iso: string, now: Date): string => {
  if (isSameLocalDay(iso, now)) return 'TODAY';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameLocalDay(iso, yesterday)) return 'YESTERDAY';
  return `ON ${formatDateShort(iso).toUpperCase()}`;
};

const eventTime = (events: DeliveryEvent[], ...states: JobState[]): string | undefined => {
  for (const state of states) {
    const e = events.find((ev) => ev.toState === state);
    if (e) return formatClock(e.createdAt);
  }
  return undefined;
};

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Figma delivery-detail "Task #… Detail": outcome banner, route timeline, delivery verification, earnings breakdown. */
export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useJobDetail(id);

  if (isLoading && !data) {
    return (
      <Screen>
        <AppHeader title="Task Detail" backIcon="chevron-left" onHelp={() => router.push('/support' as never)} />
        <LoadingState label="Loading task…" />
      </Screen>
    );
  }
  if (error || !data) {
    return (
      <Screen>
        <AppHeader title="Task Detail" backIcon="chevron-left" onHelp={() => router.push('/support' as never)} />
        <ErrorState title="Couldn't load this task" body={error instanceof Error ? error.message : 'Check your connection and try again.'} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const { job, events, proof, earnings } = data;
  const terminal = isTerminal(job.state);
  const now = new Date();
  const endedAt = job.deliveredAt ?? job.updatedAt;
  const outcome = OUTCOME[job.state];
  const stateTitle = labelFor(job.state)?.title ?? job.state.replace(/_/g, ' ').toUpperCase();
  const subtitle = terminal && outcome ? `${outcome.verb} ${dayWord(endedAt, now)} AT ${formatClock(endedAt)}` : `${stateTitle} · IN PROGRESS`;
  const banner: Pick<Outcome, 'banner' | 'icon' | 'bg' | 'fg'> = terminal && outcome ? outcome : { banner: `IN PROGRESS · ${stateTitle}`, icon: 'navigation', bg: colors.ink, fg: colors.limeBright };
  const orderRef = job.orderRef.startsWith('#') ? job.orderRef : `#${job.orderRef}`;

  // Route timeline (Figma "P" / "D" rows): pickup "Arrived • Picked Up", drop "place • Delivered".
  const arrivedAt = eventTime(events, 'at_pickup');
  const pickedAt = eventTime(events, 'picked_up', 'pickup_verified');
  const deliveredAt = job.deliveredAt ? formatClock(job.deliveredAt) : eventTime(events, 'delivered');
  const pickupTimes = [arrivedAt ? `Arrived: ${arrivedAt}` : null, pickedAt ? `Picked Up: ${pickedAt}` : null].filter(Boolean).join(' • ');
  const pickupSub = pickupTimes || job.pickup.area || 'Not yet arrived';
  const dropPlace = canSeeDropAddress(job.state) && job.drop.address ? job.drop.address : job.drop.area;
  const dropOutcome = deliveredAt ? `Delivered: ${deliveredAt}` : terminal && outcome ? `${titleCase(outcome.verb)}${job.failureReason ? `: ${job.failureReason}` : ''}` : `${formatKm(job.distanceKm)} trip`;

  // Delivery verification pill: "OTP VERIFIED" once proof exists; flagged when far from the drop pin.
  const far = proof?.distanceFromDropM != null && proof.distanceFromDropM > GEOFENCE.proofFlagM;
  const verification = proof
    ? { label: `${PROOF_METHOD[proof.method] ?? proof.method.toUpperCase()} VERIFIED`, lime: true }
    : job.state === 'delivered'
      ? { label: 'VERIFIED', lime: true }
      : { label: terminal ? 'NOT VERIFIED' : 'PENDING', lime: false };

  const earningLines = earnings
    ? [
        { label: 'Base Delivery Pay', value: earnings.base },
        { label: `Distance (${(earnings.distanceKm || job.distanceKm).toFixed(1)} km)`, value: earnings.distance },
        { label: 'Surge / Weather Peak', value: earnings.peak },
        { label: 'Wait Compensation', value: earnings.wait },
        { label: 'Customer Tip (100% to you)', value: earnings.tip },
        { label: 'Daily Completion Incentive', value: earnings.bonus },
      ].filter((l) => l.value > 0 || l.label === 'Base Delivery Pay')
    : [];

  return (
    <Screen scroll footer={!terminal ? <PrimaryButton label="RESUME JOB" onPress={() => router.push(routeForJob(job) as never)} /> : undefined}>
      <AppHeader title={`Task ${orderRef} Detail`} backIcon="chevron-left" onHelp={() => router.push('/support' as never)} />
      <AppText color="textSecondary" style={styles.subtitle} align="center">
        {subtitle}
      </AppText>

      <View style={styles.body}>
        <View style={[styles.banner, { backgroundColor: banner.bg }]} accessibilityRole="text" accessibilityLabel={banner.banner}>
          <Icon name={banner.icon} size={18} color={banner.fg} strokeWidth={2.5} />
          <AppText variant="buttonPrimary" color={banner.fg}>
            {banner.banner}
          </AppText>
        </View>

        <Card radius={32} padding={spacing.xl} borderWidth={2} borderColor={colors.border} gap={spacing.lg}>
          <AppText variant="label" color="textSecondary">
            ROUTE TIMELINE
          </AppText>
          <View style={styles.stop}>
            <View style={[styles.badge, styles.badgePickup]}>
              <AppText variant="label">P</AppText>
            </View>
            <View style={styles.stopTexts}>
              <AppText variant="title" numberOfLines={1}>
                {job.pickup.name}
              </AppText>
              <AppText color="textSecondary" style={styles.stopSub}>
                {pickupSub}
              </AppText>
            </View>
          </View>
          <View style={styles.solidDivider} />
          <View style={styles.stop}>
            <View style={[styles.badge, styles.badgeDrop]}>
              <AppText variant="label" color="surface">
                D
              </AppText>
            </View>
            <View style={styles.stopTexts}>
              <AppText variant="title" numberOfLines={1}>
                {job.drop.customerFirstName}
              </AppText>
              <AppText color="textSecondary" style={styles.stopSub}>
                {dropPlace} • {dropOutcome}
              </AppText>
            </View>
          </View>
        </Card>

        <View style={styles.verifyRow} accessibilityRole="text" accessibilityLabel={`Delivery verification: ${verification.label}${far ? ', flagged for review' : ''}`}>
          <View style={styles.verifyTitle}>
            <Icon name="shield" size={20} />
            <AppText variant="title" numberOfLines={1} style={styles.verifyText}>
              Delivery Verification
            </AppText>
          </View>
          <View style={styles.verifyChips}>
            {far ? (
              <View style={[styles.verifyChip, styles.verifyChipDanger]}>
                <AppText color="danger" style={styles.verifyChipText}>
                  {`${formatMeters(proof!.distanceFromDropM!)} FROM PIN`}
                </AppText>
              </View>
            ) : null}
            <View style={[styles.verifyChip, verification.lime ? styles.verifyChipLime : styles.verifyChipMuted]}>
              <AppText color={verification.lime ? 'ink' : 'textSecondary'} style={styles.verifyChipText}>
                {verification.label}
              </AppText>
            </View>
          </View>
        </View>

        <Pressable
          accessibilityRole={earnings ? 'button' : 'text'}
          accessibilityLabel={earnings ? `Earnings breakdown, total earned ${inr(earnings.total)}. Open payout calculation` : 'No earnings recorded for this job'}
          onPress={earnings ? () => router.push(`/earnings/job/${job.id}` as never) : undefined}
          disabled={!earnings}
          style={({ pressed }) => [styles.dark, pressed && styles.darkPressed]}>
          <AppText variant="label" color="lime">
            EARNINGS BREAKDOWN
          </AppText>
          {earnings ? (
            <>
              <View style={styles.darkLines}>
                {earningLines.map((row) => (
                  <View key={row.label} style={styles.line}>
                    <AppText variant="body" color={DARK_LABEL} style={styles.lineLabel}>
                      {row.label}
                    </AppText>
                    <AppText variant="bodyBold" color="surface">
                      {inr(row.value)}
                    </AppText>
                  </View>
                ))}
              </View>
              <View style={styles.darkDivider} />
              <View style={styles.line}>
                <AppText variant="titleLg" color="surface">
                  TOTAL EARNED
                </AppText>
                <AppText variant="h2" color="lime">
                  {inr(earnings.total)}
                </AppText>
              </View>
              <View style={styles.darkLink}>
                <AppText variant="bodyBoldSm" color="lime">
                  View payout calculation
                </AppText>
                <Icon name="chevron-right" size={14} color="lime" strokeWidth={2.5} />
              </View>
            </>
          ) : (
            <AppText variant="body" color={DARK_LABEL}>
              {terminal ? 'No earnings recorded for this job.' : 'Earnings are recorded once the delivery is completed.'}
            </AppText>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontFamily: fontFamily.manropeSemiBold, fontSize: 12, lineHeight: 16, marginTop: -spacing.xs },
  body: { gap: spacing.xxl, paddingTop: spacing.xxl },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, borderRadius: radius.pill, paddingHorizontal: spacing.gutter, paddingVertical: spacing.md, alignSelf: 'stretch' },
  stop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  stopTexts: { flex: 1, minWidth: 0 },
  stopSub: { fontFamily: fontFamily.manropeMedium, fontSize: 12, lineHeight: 16 },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgePickup: { backgroundColor: colors.lime },
  badgeDrop: { backgroundColor: colors.ink },
  solidDivider: { height: 1, backgroundColor: colors.borderSubtle, alignSelf: 'stretch' },
  verifyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 25.5, padding: spacing.xl, alignSelf: 'stretch' },
  verifyTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  verifyText: { flexShrink: 1 },
  verifyChips: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 0 },
  verifyChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 11.5 },
  verifyChipLime: { backgroundColor: colors.lime },
  verifyChipMuted: { backgroundColor: colors.surfaceMuted },
  verifyChipDanger: { backgroundColor: colors.surfaceDanger },
  verifyChipText: { fontFamily: fontFamily.manropeExtraBold, fontSize: 11, lineHeight: 15 },
  dark: { backgroundColor: colors.ink, borderRadius: 32, padding: spacing.xxl, gap: spacing.lg, alignSelf: 'stretch' },
  darkPressed: { opacity: 0.92 },
  darkLines: { gap: spacing.md },
  darkDivider: { height: 1, backgroundColor: DARK_DIVIDER, alignSelf: 'stretch' },
  darkLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xxs },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  lineLabel: { flexShrink: 1 },
});
