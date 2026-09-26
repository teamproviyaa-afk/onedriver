import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';

import { colors, dimensions, radius, spacing } from '@/theme';
import { AppText, Avatar, BottomSheet, Card, ConfirmationSheet, Dot, ErrorState, Icon, LoadingState, PrimaryButton, Screen, SecondaryButton, StatTile, toast } from '@/components/ui';
import { useAvailability, useCurrentJob, useCurrentOffer, useMe } from '@/hooks';
import { useDeliveryStore, selectJob, selectOffer } from '@/stores/useDeliveryStore';
import { routeForJob, STATE_LABELS } from '@/state-machine/deliveryStateMachine';
import { formatINR } from '@/utils/format';
import { isLocalDemo } from '@/config/env';
import { DEMO_RIDER_CODE } from '@/demo/constants';
import type { Job, RiderFlowState, RiderMe, StoreLink } from '@/types';

const greeting = (d: Date = new Date()): string => {
  const h = d.getHours();
  if (h < 12) return 'Good morning!';
  if (h < 17) return 'Good afternoon!';
  return 'Good evening!';
};

/**
 * Home tab (Figma home-offline / home-online): greeting + offline card + yesterday stats
 * with GO ONLINE, or the lime "YOU'RE ONLINE" banner, linked store, today's earnings and the
 * job radar with GO OFFLINE. Availability blocks from the server surface as sheets.
 */
export default function HomeScreen() {
  const me = useMe();
  const { online, busy, block, clearBlock, goOnline, goOffline } = useAvailability();
  const job = useDeliveryStore(selectJob);
  const offer = useDeliveryStore(selectOffer);
  const pathname = usePathname();
  const pushedOfferRef = useRef<string | null>(null);
  const [confirmOffline, setConfirmOffline] = useState(false);

  // Keep the active job in sync with the server so "Resume current job" is always right.
  useCurrentJob(!!me.data);
  useCurrentOffer(online && !job);

  // A new offer opens the offer screen. The services layer does the same on demo events, so
  // guard with the offer id and the current path to never push it twice.
  useEffect(() => {
    if (!offer) return;
    if (offer.outcome && offer.outcome !== 'accepted') return;
    // A pending offer that already expired, or an accepted one whose job has moved on, is stale.
    if (!offer.outcome && new Date(offer.expiresAt).getTime() <= Date.now()) return;
    if (offer.outcome === 'accepted' && job && (job.id !== offer.jobId || job.state !== 'accepted')) return;
    if (pushedOfferRef.current === offer.id) return;
    pushedOfferRef.current = offer.id;
    if (pathname.startsWith('/offer/')) return;
    router.push(`/offer/${offer.jobId}` as never);
  }, [offer, job, pathname]);

  // Blocks that are not sheets: suspended → status screen; network / unknown → toast.
  useEffect(() => {
    if (!block) return;
    if (block.code === 'suspended') {
      clearBlock();
      router.replace('/status' as never);
    } else if (block.code === 'network' || block.code === 'unknown' || block.code === 'not_enrolled') {
      toast.error(block.detail);
      clearBlock();
    }
  }, [block, clearBlock]);

  if (!me.data) {
    return (
      <Screen>
        {me.isLoading || me.isFetching ? (
          <LoadingState label="Loading your day…" />
        ) : (
          <ErrorState body={me.error instanceof Error ? me.error.message : 'Could not load your profile.'} onRetry={() => void me.refetch()} />
        )}
      </Screen>
    );
  }

  const data = me.data;
  const store = data.storeLinks.find((s) => s.status === 'active') ?? data.storeLinks[0];
  const cashInHand = typeof block?.meta?.cashInHand === 'number' ? block.meta.cashInHand : data.cashInHand;
  const cashLimit = typeof block?.meta?.cashLimit === 'number' ? block.meta.cashLimit : data.cashLimit;

  const footer = job ? (
    <PrimaryButton label="RESUME CURRENT JOB" icon="navigation" iconPosition="left" onPress={() => router.push(routeForJob(job) as never)} />
  ) : online ? (
    <SecondaryButton label="GO OFFLINE" onPress={() => setConfirmOffline(true)} loading={busy} />
  ) : (
    <PrimaryButton label="GO ONLINE" onPress={() => void goOnline()} loading={busy} />
  );

  return (
    <Screen scroll padded={false} footer={footer} footerStyle={styles.footer}>
      {online || job ? <OnlineBody data={data} store={store} job={job} /> : <OfflineBody data={data} />}

      <ConfirmationSheet
        visible={confirmOffline}
        onClose={() => setConfirmOffline(false)}
        title="Go offline?"
        body="You will stop receiving job offers until you go online again."
        icon="wifi-off"
        confirmLabel="GO OFFLINE"
        cancelLabel="Stay online"
        loading={busy}
        onConfirm={async () => {
          const ok = await goOffline();
          setConfirmOffline(false);
          if (ok) toast.show('You are offline', 'info');
        }}
      />

      <BottomSheet visible={block?.code === 'cash_limit'} onClose={clearBlock} title="Cash in hand above limit">
        <AppText variant="body" color="textSecondary">
          {block?.detail ?? 'Deposit cash to go online again.'}
        </AppText>
        <View style={styles.amountRow}>
          <StatTile label="CASH IN HAND" value={formatINR(cashInHand)} radius={24} valueColor={colors.danger} />
          <StatTile label="LIMIT" value={formatINR(cashLimit)} radius={24} />
        </View>
        <PrimaryButton
          label="VIEW CASH & DEPOSIT"
          onPress={() => {
            clearBlock();
            router.push('/cash' as never);
          }}
        />
        <SecondaryButton label="Not now" onPress={clearBlock} />
      </BottomSheet>

      <BottomSheet visible={block?.code === 'out_of_zone'} onClose={clearBlock} title={"You're outside your zone"}>
        <AppText variant="body" color="textSecondary">
          {block?.detail ?? "You're outside your operating zone. Move closer to your hub to go online."}
        </AppText>
        <AppText variant="bodySm" color="textSecondary">
          Moved to a new area? Update your hub so dispatch can find jobs near you.
        </AppText>
        <PrimaryButton
          label="UPDATE HUB"
          onPress={() => {
            clearBlock();
            router.push('/onboarding/hub' as never);
          }}
        />
        <SecondaryButton label="Not now" onPress={clearBlock} />
      </BottomSheet>
    </Screen>
  );
}

const OfflineBody = ({ data }: { data: RiderMe }) => {
  const rider = data.rider;
  const avatarSource = rider.photoUri ? { uri: rider.photoUri } : isLocalDemo && rider.riderCode === DEMO_RIDER_CODE ? require('@/assets/figma/avatar-rider.png') : null;
  return (
    <View style={styles.body}>
      <View style={styles.headerWelcome}>
        <View style={styles.welcomeText}>
          <AppText variant="display">{greeting()}</AppText>
          <AppText variant="body" color="textSecondary">
            Ready to start your shift?
          </AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.push('/profile' as never)} hitSlop={6}>
          <Avatar name={rider.fullName} source={avatarSource} size={48} />
        </Pressable>
      </View>

      <Card radius={radius.card} padding={spacing.x3l} gap={spacing.xxl}>
        <View style={styles.statusRow}>
          <Dot color={colors.danger} size={16} />
          <AppText variant="h4">You are offline</AppText>
        </View>
        <AppText variant="body" color="textSecondary">
          Go online to receive high-priority delivery jobs near you and start earning.
        </AppText>
      </Card>

      <View style={styles.quickStats}>
        <StatTile label="YESTERDAY" value={formatINR(data.yesterday.earnings)} />
        <StatTile label="COMPLETED" value={`${data.yesterday.jobs} ${data.yesterday.jobs === 1 ? 'Job' : 'Jobs'}`} />
      </View>
    </View>
  );
};

const OnlineBody = ({ data, store, job }: { data: RiderMe; store?: StoreLink; job: Job | null }) => (
  <View style={styles.onlineWrap}>
    <View style={styles.onlineBanner} accessibilityRole="text" accessibilityLiveRegion="polite">
      <AppText variant="titleLg">{"✓ YOU'RE ONLINE"}</AppText>
    </View>
    <View style={styles.onlineBody}>
      {store ? (
        <View style={styles.storeCard}>
          <Icon name="store" size={24} />
          <View style={styles.storeInfo}>
            <AppText variant="title">{store.storeName} Linked</AppText>
            <AppText variant="bodySm" color="textSecondary">
              High priority dispatch enabled • {store.payoutMultiplier ?? 1}x payout
            </AppText>
          </View>
        </View>
      ) : null}

      <Card radius={radius.card} padding={spacing.x3l} gap={spacing.xxl}>
        <AppText variant="title" color="textSecondary">
          {"TODAY'S EARNINGS"}
        </AppText>
        <View style={styles.earningsRow}>
          <AppText variant="hero">{formatINR(data.today.earnings)}</AppText>
          <AppText variant="title">
            {data.today.jobs} {data.today.jobs === 1 ? 'Job' : 'Jobs'} Done
          </AppText>
        </View>
      </Card>

      {job ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Open current job" onPress={() => router.push(routeForJob(job) as never)} style={({ pressed }) => [styles.jobCard, pressed && styles.pressed]}>
          <Icon name="navigation" size={24} />
          <View style={styles.storeInfo}>
            <AppText variant="title">Job in progress · Order {job.orderRef.startsWith('#') ? job.orderRef : `#${job.orderRef}`}</AppText>
            <AppText variant="bodySm" color="textSecondary">
              {STATE_LABELS[job.state as RiderFlowState]?.subtitle ?? 'Tap to resume the delivery'}
            </AppText>
          </View>
          <Icon name="chevron-right" size={18} color="textMuted" />
        </Pressable>
      ) : (
        <View style={styles.pulseContainer}>
          <RadarPulse />
          <AppText variant="statusTime" align="center">
            Waiting for job assignments...
          </AppText>
        </View>
      )}
    </View>
  </View>
);

/** Figma radar-rings drawn with Views: 100px translucent lime ring (pulsing) · 64px pale ring · 24px lime dot with ink border. */
const RadarPulse = () => {
  const [scale] = useState(() => new Animated.Value(1));
  const [opacity] = useState(() => new Animated.Value(0.7));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.35, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 1500, easing: Easing.linear, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.7, duration: 400, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);
  return (
    <View style={styles.radarWrap} accessibilityLabel="Searching for jobs">
      <Animated.View style={[styles.radarHalo, { transform: [{ scale }], opacity }]} />
      <View style={styles.radarRings}>
        <View style={styles.radarInner}>
          <View style={styles.radarDot} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  footer: { paddingBottom: spacing.lg },
  body: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, gap: spacing.gutter },
  headerWelcome: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.lg },
  welcomeText: { gap: spacing.xs, flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  quickStats: { flexDirection: 'row', gap: spacing.xxl },
  amountRow: { flexDirection: 'row', gap: spacing.lg },

  onlineWrap: { gap: 0 },
  onlineBanner: {
    backgroundColor: colors.lime,
    borderBottomWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.banner,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  onlineBody: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xxl, gap: spacing.x3l },
  storeCard: {
    backgroundColor: colors.surfaceLime,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 32.5,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  storeInfo: { flex: 1, gap: spacing.xxs },
  jobCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 32.5,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  pressed: { opacity: 0.9 },
  earningsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.lg },
  pulseContainer: { alignItems: 'center', gap: spacing.xxl, paddingVertical: spacing.x5l },
  radarWrap: { width: dimensions.radarOuter, height: dimensions.radarOuter, alignItems: 'center', justifyContent: 'center' },
  radarHalo: { position: 'absolute', width: dimensions.radarOuter, height: dimensions.radarOuter, borderRadius: dimensions.radarOuter / 2, backgroundColor: colors.limeTint },
  radarRings: { width: dimensions.radarOuter, height: dimensions.radarOuter, borderRadius: dimensions.radarOuter / 2, backgroundColor: colors.limeTint, alignItems: 'center', justifyContent: 'center' },
  radarInner: { width: dimensions.radarInner, height: dimensions.radarInner, borderRadius: dimensions.radarInner / 2, backgroundColor: colors.surfaceLime, alignItems: 'center', justifyContent: 'center' },
  radarDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.lime, borderWidth: 2, borderColor: colors.ink },
});
