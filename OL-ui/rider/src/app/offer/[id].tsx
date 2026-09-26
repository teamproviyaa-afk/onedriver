import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { AppText, Badge, Card, ConfirmationSheet, Divider, Dot, EmptyState, ErrorState, Icon, LoadingState, PrimaryButton, Screen, SecondaryButton, SelectableRow, toast, type IconName } from '@/components/ui';
import { useCountdown, useOfferActions } from '@/hooks';
import { getDataProvider } from '@/providers';
import { useDeliveryStore, selectJob, selectOffer } from '@/stores/useDeliveryStore';
import { isTerminal, routeForJob } from '@/state-machine/deliveryStateMachine';
import { DISPATCH } from '@/domain/dispatch';
import { CATEGORY_ICON, CATEGORY_LABEL } from '@/features/job/categories';
import { colors, fontFamily, radius, spacing } from '@/theme';
import type { DeclineReason, Offer } from '@/types';
import { formatINR } from '@/utils/format';

/** Delay before an auto-accepted offer is acknowledged and the rider lands on the job (Figma "3s" toast). */
const AUTO_ACCEPT_MS = 1500;

const DECLINE_REASONS: { value: DeclineReason; label: string; subtitle: string }[] = [
  { value: 'too_far', label: 'Too far away', subtitle: 'Pickup or drop is outside my range' },
  { value: 'low_payout', label: 'Payout too low', subtitle: 'Not worth the distance or time' },
  { value: 'break', label: 'Taking a break', subtitle: 'I will be back online soon' },
  { value: 'other', label: 'Other reason', subtitle: 'Something else' },
];

type ResultKind = 'expired' | 'taken' | 'error';

const matchesRoute = (offer: Offer, id: string) => offer.jobId === id || offer.id === id;

const km = (n: number) => n.toFixed(1);

/** Offer window in seconds (offeredAt → expiresAt), falling back to the dispatch default. */
const windowSeconds = (offer: Offer): number => {
  const ms = new Date(offer.expiresAt).getTime() - new Date(offer.offeredAt).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.round(ms / 1000)) : DISPATCH.offerWindowSeconds;
};

const haptic = async () => {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // haptics are best-effort
  }
};

const RESULT_COPY: Record<ResultKind, { icon: IconName; title: string; body: string }> = {
  expired: { icon: 'timer', title: 'Offer expired', body: 'The acceptance window closed. Stay online — the next offer is on its way.' },
  taken: { icon: 'users', title: 'Already taken by another rider', body: 'Another rider accepted this job first. Stay online for the next one.' },
  error: { icon: 'wifi-off', title: 'Could not connect', body: 'We could not reach dispatch to confirm this job. Check your connection and try again.' },
};

/** Inline outcome card (offer expired / already taken / could not connect). */
const ResultCard = ({ kind, detail }: { kind: ResultKind; detail?: string }) => {
  const copy = RESULT_COPY[kind];
  return (
    <Card radius={32} padding={spacing.gutter} gap={spacing.md} style={styles.resultCard} accessibilityLabel={copy.title}>
      <View style={[styles.resultIcon, kind === 'error' && styles.resultIconDanger]}>
        <Icon name={copy.icon} size={26} color={kind === 'error' ? 'danger' : 'ink'} />
      </View>
      <AppText variant="h3" align="center">
        {copy.title}
      </AppText>
      <AppText variant="body" color="textSecondary" align="center">
        {detail || copy.body}
      </AppText>
    </Card>
  );
};

/**
 * Job offer (Figma job-offer-manual + job-auto-accepted).
 *
 * Manual mode: countdown bar + timer pill, category / surge badges, payout showcase, route card,
 * drop note and the DECLINE / ACCEPT JOB row. Accept and decline go through useOfferActions();
 * the next screen always comes from routeForJob(job).
 * Auto mode (offer.mode === 'auto' or an already-accepted outcome): the map toast, then the
 * (idempotent) accept acknowledgement after ~1.5 s and a jump to the job.
 */
export default function OfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const storeOffer = useDeliveryStore(selectOffer);
  const job = useDeliveryStore(selectJob);
  const { accept, decline, busy } = useOfferActions();

  // Snapshot of the offer for this screen: the store copy when present, otherwise fetched once.
  // The snapshot outlives the store copy (cleared on accept / decline / timeout) so the outcome
  // cards can still render.
  const query = useQuery({
    queryKey: ['offer', 'screen', id ?? ''],
    queryFn: async (): Promise<Offer | null> => {
      const local = useDeliveryStore.getState().offer;
      if (local && id && matchesRoute(local, id)) return local;
      return (await getDataProvider().getCurrentOffer()) ?? null;
    },
    enabled: !!id,
    staleTime: Infinity,
    gcTime: 0,
  });

  const live = storeOffer && id && matchesRoute(storeOffer, id) ? storeOffer : null;
  const snapshot = query.data && id && matchesRoute(query.data, id) ? query.data : null;
  const offer = live ?? snapshot;
  const offerId = offer?.id ?? null;
  const auto = !!offer && (offer.mode === 'auto' || offer.outcome === 'accepted');

  const [result, setResult] = useState<{ offerId: string; kind: ResultKind; detail?: string } | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState<DeclineReason>('too_far');
  const [autoLeft, setAutoLeft] = useState(AUTO_ACCEPT_MS);
  const [fill] = useState(() => new Animated.Value(1));

  const navigated = useRef(false);
  const acceptedFor = useRef<string | null>(null);
  const offerRef = useRef<Offer | null>(null);
  useEffect(() => {
    offerRef.current = offer;
  });

  const seconds = useCountdown(offer && !auto ? offer.expiresAt : null);
  const expired = !!offer && !auto && seconds <= 0;
  const windowS = offer ? windowSeconds(offer) : DISPATCH.offerWindowSeconds;
  /** Server already closed this offer without an acceptance (timed out / withdrawn / declined elsewhere). */
  const gone = !!offer && !!offer.outcome && offer.outcome !== 'accepted';

  // Guard: a different active job, or this job already past the offer, owns the screen.
  const offerJobId = offer?.jobId ?? null;
  useEffect(() => {
    if (!job || isTerminal(job.state) || navigated.current) return;
    if (job.id !== id && job.id !== offerJobId) {
      navigated.current = true;
      router.replace(routeForJob(job) as never);
      return;
    }
    if (job.state !== 'offered' && !(auto && job.state === 'accepted')) {
      navigated.current = true;
      router.replace(routeForJob(job) as never);
    }
  }, [job, id, offerJobId, auto]);

  // An old deep link: the live offer is for another job → open that one instead.
  const fetched = query.data ?? null;
  useEffect(() => {
    const current = storeOffer ?? fetched;
    if (!current || !id || matchesRoute(current, id) || navigated.current) return;
    if (current.outcome && current.outcome !== 'accepted') return;
    navigated.current = true;
    router.replace(`/offer/${current.jobId}` as never);
  }, [storeOffer, fetched, id]);

  // Haptic on arrival of each offer.
  useEffect(() => {
    if (offerId) void haptic();
  }, [offerId]);

  // Countdown bar: tween the fill to the next second so it shrinks continuously.
  useEffect(() => {
    if (auto) return;
    const target = Math.max(0, Math.min(1, seconds / windowS));
    const anim = Animated.timing(fill, { toValue: target, duration: 950, easing: Easing.linear, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [auto, fill, seconds, windowS]);

  const runAccept = useCallback(
    async (o: Offer, mode: 'manual' | 'auto') => {
      const res = await accept(o);
      if (res.ok) {
        if (!navigated.current) {
          navigated.current = true;
          router.replace(routeForJob(res.job) as never);
        }
        return;
      }
      if (res.code === 'offer_expired') setResult({ offerId: o.id, kind: 'expired' });
      else if (res.code === 'already_taken') setResult({ offerId: o.id, kind: 'taken' });
      else {
        toast.error(res.detail);
        if (mode === 'auto') setResult({ offerId: o.id, kind: 'error', detail: res.detail });
      }
    },
    [accept],
  );

  // Auto mode: show the toast, then acknowledge the acceptance once and move to the job.
  useEffect(() => {
    if (!auto || !offerId) return;
    const started = Date.now();
    const tick = setInterval(() => setAutoLeft(Math.max(0, AUTO_ACCEPT_MS - (Date.now() - started))), 100);
    const timer = setTimeout(() => {
      clearInterval(tick);
      setAutoLeft(0);
      const o = offerRef.current;
      if (!o || o.id !== offerId || acceptedFor.current === o.id) return;
      acceptedFor.current = o.id;
      void runAccept(o, 'auto');
    }, AUTO_ACCEPT_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [auto, offerId, runAccept]);

  const goHome = () => {
    navigated.current = true;
    router.replace('/home' as never);
  };

  const onAccept = () => {
    if (!offer || busy) return;
    void runAccept(offer, 'manual');
  };

  const onDecline = async () => {
    if (!offer) return;
    await decline(offer, reason);
    setDeclineOpen(false);
    goHome();
  };

  const retryAuto = () => {
    const o = offerRef.current;
    if (!o) return;
    acceptedFor.current = o.id;
    setResult(null);
    void runAccept(o, 'auto');
  };

  if (!id) {
    return (
      <Screen>
        <ErrorState title="Offer not found" body="This link does not point to a job offer." onRetry={goHome} retryLabel="Back to home" />
      </Screen>
    );
  }

  if (!offer) {
    if (query.isPending && query.fetchStatus === 'fetching') {
      return (
        <Screen>
          <LoadingState label="Loading offer…" />
        </Screen>
      );
    }
    if (query.error) {
      return (
        <Screen>
          <ErrorState title="Could not load the offer" body={query.error instanceof Error ? query.error.message : 'Check your connection and try again.'} onRetry={() => void query.refetch()} />
        </Screen>
      );
    }
    return (
      <Screen>
        <EmptyState icon="package-x" title="Offer no longer available" body="It was withdrawn, timed out or taken by another rider. Stay online for the next one." actionLabel="Back to home" onAction={goHome} />
      </Screen>
    );
  }

  if (gone && offer.outcome !== 'timed_out') {
    return (
      <Screen>
        <EmptyState icon="package-x" title="Offer no longer available" body="It was withdrawn or taken by another rider. Stay online for the next one." actionLabel="Back to home" onAction={goHome} />
      </Screen>
    );
  }

  const outcome = result && result.offerId === offer.id ? result : expired || gone ? { offerId: offer.id, kind: 'expired' as const } : null;

  if (outcome) {
    return (
      <Screen
        background={colors.surface}
        footer={
          <View style={styles.footerCol}>
            {outcome.kind === 'error' ? <SecondaryButton label="TRY AGAIN" onPress={retryAuto} loading={busy === 'accept'} /> : null}
            <PrimaryButton label="BACK TO HOME" onPress={goHome} disabled={busy === 'accept'} />
          </View>
        }>
        <View style={styles.resultWrap}>
          <ResultCard kind={outcome.kind} detail={outcome.detail} />
        </View>
      </Screen>
    );
  }

  const offerJob = offer.job;
  const category = offerJob.category;

  if (auto) {
    const items = offerJob.itemsCount || offerJob.items.length;
    const progress = Math.round((1 - autoLeft / AUTO_ACCEPT_MS) * 100);
    return (
      <View style={styles.autoRoot}>
        <StatusBar style="dark" />
        <Image source={require('@/assets/figma/map-drawing.png')} style={styles.autoMap} resizeMode="cover" accessibilityIgnoresInvertColors />
        <View style={styles.scrim} pointerEvents="none" />
        <View style={[styles.toast, { bottom: 40 + insets.bottom }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <View style={styles.toastHeader}>
            <View style={styles.autoBadge}>
              <AppText variant="label" uppercase>
                AUTO-ACCEPTED
              </AppText>
            </View>
            <Dot color={colors.lime} size={10} />
          </View>
          <View style={styles.toastBody}>
            <AppText variant="h2">Job auto-accepted!</AppText>
            <AppText variant="body" color="textSecondary">
              Connecting to merchant dispatch...
            </AppText>
          </View>
          <View style={styles.merchantPreview}>
            <Icon name={CATEGORY_ICON[category]} size={20} />
            <View style={styles.merchantPreviewText}>
              <AppText variant="title" numberOfLines={1}>
                {`${offer.pickup.name} Order ${offerJob.orderRef}`}
              </AppText>
              <AppText variant="bodySm" color="textSecondary" numberOfLines={1}>
                {`${items} item${items === 1 ? '' : 's'} • Pick up in ${offerJob.eta.toPickupMin} mins`}
              </AppText>
            </View>
          </View>
          <View style={styles.autoTimerRow} accessibilityRole="progressbar" accessibilityLabel="Connecting to merchant dispatch">
            <View style={styles.autoTrack}>
              <View style={[styles.autoFill, { width: `${progress}%` }]} />
            </View>
            <AppText style={styles.label11} color="textSecondary">
              {`${Math.ceil(autoLeft / 1000)}s`}
            </AppText>
          </View>
        </View>
      </View>
    );
  }

  const surge = offer.surgeMultiplier > 1 ? offer.surgeMultiplier : null;
  const surgeBonus = surge ? Math.round(offer.payoutEstimate - offer.payoutEstimate / surge) : 0;
  const note = offer.note ?? offerJob.drop.instructions;
  const pickupArea = offer.pickup.area || offerJob.pickup.address;
  const totalKm = offer.pickup.distanceKm + offer.drop.distanceKm;

  return (
    <Screen
      padded={false}
      edges={['top']}
      background={colors.surface}
      footer={
        <View style={styles.actionRow}>
          <SecondaryButton label="DECLINE" onPress={() => setDeclineOpen(true)} disabled={!!busy} fullWidth={false} style={styles.flex1} />
          <PrimaryButton label="ACCEPT JOB" onPress={onAccept} loading={busy === 'accept'} disabled={busy === 'decline'} fullWidth={false} style={styles.flex1} />
        </View>
      }>
      <View style={styles.countdownTrack} accessibilityRole="progressbar" accessibilityLabel={`${seconds} seconds left to accept`}>
        <Animated.View style={[styles.countdownFill, { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>

      <ScrollView style={styles.flex1} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.offerHeader}>
          <View style={styles.badgeGroup}>
            <Badge label={CATEGORY_LABEL[category]} tone="dark" />
            {surge ? <Badge label={`${surge}X PAY`} tone="lime" /> : null}
          </View>
          <View style={styles.timerPill} accessibilityLiveRegion="polite">
            <AppText variant="title">{`${seconds}s`}</AppText>
          </View>
        </View>

        <Card radius={32} padding={spacing.x3l} background={colors.surfaceLime} gap={spacing.xs} style={styles.payout}>
          <AppText variant="chip" color="textSecondary">
            ESTIMATED PAYOUT
          </AppText>
          <AppText style={styles.amount40} accessibilityLabel={`Estimated payout ${formatINR(offer.payoutEstimate, { decimals: 2 })}`}>
            {formatINR(offer.payoutEstimate, { decimals: 2 })}
          </AppText>
          {surge ? (
            <AppText style={styles.body13} color="textSecondary">
              {`Includes ${formatINR(surgeBonus)} surge bonus`}
            </AppText>
          ) : null}
        </Card>

        <Card radius={32} padding={spacing.xxl} gap={spacing.xxl}>
          <View style={styles.merchantRow}>
            <View style={styles.merchantIcon}>
              <Icon name={CATEGORY_ICON[category]} size={20} />
            </View>
            <View style={styles.merchantText}>
              <AppText variant="titleLg" numberOfLines={1}>
                {offer.pickup.name}
              </AppText>
              <AppText variant="bodySm" color="textSecondary" numberOfLines={1}>
                {pickupArea}
              </AppText>
            </View>
          </View>
          <Divider />
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <AppText style={styles.label11} color="textSecondary">
                PICKUP
              </AppText>
              <AppText variant="title">{`${km(offer.pickup.distanceKm)} km away`}</AppText>
            </View>
            <View style={styles.metric}>
              <AppText style={styles.label11} color="textSecondary">
                DROP
              </AppText>
              <AppText variant="title">{`${km(offer.drop.distanceKm)} km (Total ${km(totalKm)})`}</AppText>
            </View>
            <View style={styles.metric}>
              <AppText style={styles.label11} color="textSecondary">
                EST. TIME
              </AppText>
              <AppText variant="title">{`${offer.etaMin} mins`}</AppText>
            </View>
          </View>
        </Card>

        {note ? (
          <Card radius={21} padding={spacing.lg} row gap={spacing.base} style={styles.noteCard}>
            <Icon name="message-square" size={18} color="textSecondary" />
            <AppText style={[styles.body13, styles.flex1]} color="textSecondary">
              {`Note: "${note}"`}
            </AppText>
          </Card>
        ) : null}
      </ScrollView>

      <ConfirmationSheet
        visible={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title="Decline this offer?"
        body="Tell dispatch why, so your next offers fit better."
        confirmLabel="DECLINE OFFER"
        cancelLabel="Keep looking"
        loading={busy === 'decline'}
        onConfirm={onDecline}>
        <View style={styles.reasons}>
          {DECLINE_REASONS.map((r) => (
            <SelectableRow key={r.value} title={r.label} subtitle={r.subtitle} selected={reason === r.value} onPress={() => setReason(r.value)} radius={16} style={styles.reason} />
          ))}
        </View>
      </ConfirmationSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { paddingTop: spacing.xxl, paddingHorizontal: spacing.gutter, paddingBottom: spacing.gutter, gap: spacing.xxl },
  countdownTrack: { height: 6, backgroundColor: '#F0F0EE', alignSelf: 'stretch' },
  countdownFill: { height: 6, backgroundColor: '#FFB800' },
  offerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  badgeGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  timerPill: { minWidth: 36, height: 32, paddingHorizontal: spacing.sm, borderRadius: radius.circle, backgroundColor: '#F0F0EE', borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  payout: { alignItems: 'center' },
  amount40: { fontFamily: fontFamily.manropeExtraBold, fontSize: 40, lineHeight: 48 },
  body13: { fontFamily: fontFamily.manropeMedium, fontSize: 13, lineHeight: 18 },
  label11: { fontFamily: fontFamily.manropeExtraBold, fontSize: 11, lineHeight: 15 },
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  merchantIcon: { padding: spacing.md, borderRadius: 18, backgroundColor: '#F0F0EE' },
  merchantText: { flex: 1, gap: spacing.xxs },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  metric: { gap: spacing.xxs },
  noteCard: { alignItems: 'center' },
  actionRow: { flexDirection: 'row', gap: spacing.lg, alignSelf: 'stretch' },
  footerCol: { gap: spacing.lg },
  resultWrap: { flex: 1, justifyContent: 'center' },
  resultCard: { alignItems: 'center' },
  resultIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  resultIconDanger: { backgroundColor: colors.surfaceDanger },
  reasons: { gap: spacing.md, alignSelf: 'stretch', paddingTop: spacing.md },
  reason: { paddingVertical: spacing.lg },
  // Auto-accepted toast over the decorative map.
  autoRoot: { flex: 1, backgroundColor: '#EBF2F0' },
  autoMap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(18, 18, 18, 0.2)' },
  toast: { position: 'absolute', left: spacing.gutter, right: spacing.gutter, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 32, padding: spacing.x3l, gap: spacing.xxl },
  toastHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  autoBadge: { backgroundColor: colors.lime, borderRadius: 12, paddingHorizontal: spacing.base, paddingVertical: spacing.xs },
  toastBody: { gap: spacing.xs },
  merchantPreview: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, backgroundColor: colors.surfaceLime, borderWidth: 1, borderColor: colors.border, borderRadius: 30.5, padding: spacing.lg, alignSelf: 'stretch' },
  merchantPreviewText: { flex: 1, gap: spacing.xxs },
  autoTimerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: 100 },
  autoTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#F0F0EE', overflow: 'hidden' },
  autoFill: { height: 4, borderRadius: 2, backgroundColor: colors.lime },
});
