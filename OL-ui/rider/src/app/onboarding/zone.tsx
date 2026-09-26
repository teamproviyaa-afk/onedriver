import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, ErrorState, Icon, InfoBanner, LoadingState, PrimaryButton, Screen } from '@/components/ui';
import { RiderMap, nativeMapAvailable } from '@/components/app';
import { getDataProvider } from '@/providers';
import { useDeliveryStore } from '@/stores/useDeliveryStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { getCurrentPosition } from '@/location/locationService';
import type { GeoZone, LatLng, ZoneLookup } from '@/types';
import { OnboardingHeader, ZoneOption, titleCaseId } from '@/features/onboarding/components';

/** City used for the zone list when the rider is outside every zone (V1 launches in Latur). */
const FALLBACK_CITY_ID = 'latur';

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; lookup: ZoneLookup | null; zones: GeoZone[]; cityId: string; cityName: string; stateName?: string };

/**
 * location-selection ("Your Location"): detects the rider's zone from GPS, shows it on the map card
 * and lets them confirm (or pick another zone of the same city). Out of zone → warning + Latur list.
 */
export default function ZoneScreen() {
  const draftZoneId = useOnboardingStore((s) => s.zoneId);
  const patch = useOnboardingStore((s) => s.patch);
  const complete = useOnboardingStore((s) => s.complete);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string | undefined>(draftZoneId);
  const [here, setHere] = useState<LatLng | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPhase({ kind: 'loading' });
      try {
        const provider = getDataProvider();
        // Read the position once (no subscription): the last fix from the location engine, else a fresh one.
        const pos = useDeliveryStore.getState().position ?? (await getCurrentPosition());
        if (cancelled) return;
        if (pos) setHere({ lat: pos.lat, lng: pos.lng });
        const lookup = pos ? await provider.lookupZone(pos.lat, pos.lng) : null;
        const inZone = lookup?.status === 'in_zone' ? lookup : null;
        const nearest = lookup?.status === 'out_of_zone' ? lookup.nearestCity : undefined;
        const cityId = inZone?.city.id ?? nearest?.id ?? FALLBACK_CITY_ID;
        const cityName = inZone?.city.name ?? nearest?.name ?? titleCaseId(FALLBACK_CITY_ID);
        const zones = await provider.listZones(cityId);
        if (cancelled) return;
        setPhase({ kind: 'ready', lookup, zones, cityId, cityName, stateName: inZone?.state.name });
        setSelectedId((current) => (current && zones.some((z) => z.id === current) ? current : (inZone?.zone.id ?? undefined)));
      } catch (e) {
        if (!cancelled) setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Could not detect your zone' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const selected = useMemo(() => (phase.kind === 'ready' ? phase.zones.find((z) => z.id === selectedId) : undefined), [phase, selectedId]);
  const inZone = phase.kind === 'ready' && phase.lookup?.status === 'in_zone';
  const noLocation = phase.kind === 'ready' && phase.lookup === null;

  const onContinue = () => {
    if (phase.kind !== 'ready' || !selected) return;
    patch({ cityId: phase.cityId, zoneId: selected.id, zoneName: selected.name });
    complete('zone');
    router.push('/onboarding/hub' as never);
  };

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      footer={<PrimaryButton label={selected ? `Confirm ${selected.name}` : 'Select a zone'} onPress={onContinue} disabled={!selected} />}>
      <OnboardingHeader title="Your Location" subtitle="Select your operational region inside Maharashtra to fetch localized high-pay tasks." />

      {phase.kind === 'loading' ? (
        <LoadingState label="Detecting your zone…" compact />
      ) : phase.kind === 'error' ? (
        <ErrorState title="Couldn't detect your zone" body={phase.message} onRetry={() => setAttempt((a) => a + 1)} compact />
      ) : (
        <>
          <View style={styles.mapCard}>
            {inZone && !nativeMapAvailable ? (
              // The Figma illustration already carries the "DETECTED ZONE" pill, so it is not drawn twice.
              <Image source={require('@/assets/figma/zone-city-map.png')} style={styles.mapImage} resizeMode="cover" accessibilityLabel={`Map of ${phase.cityName}`} />
            ) : (
              <RiderMap rider={here} zoneBoundary={selected?.boundary} focus="rider" height={220} interactive={false} />
            )}
            {nativeMapAvailable || !inZone ? (
              <View style={[styles.pill, !inZone && styles.pillWarning]}>
                <AppText variant="label" color={inZone ? 'lime' : 'warning'} uppercase>
                  {inZone ? 'DETECTED ZONE' : noLocation ? 'LOCATION UNAVAILABLE' : 'OUTSIDE SERVICE AREA'}
                </AppText>
              </View>
            ) : null}
            {nativeMapAvailable && selected ? (
              <View style={styles.zoneBadge}>
                <Icon name="map-pin" size={16} />
                <AppText variant="bodyBoldSm" numberOfLines={1}>
                  {selected.name}
                </AppText>
              </View>
            ) : null}
          </View>

          {!inZone ? (
            <InfoBanner
              tone="warning"
              icon="map-pin"
              bold={false}
              text={
                noLocation
                  ? `We couldn't read your location. Pick the ${phase.cityName} zone you'll ride in — you can go online once you're inside it.`
                  : `You're outside our service area right now. Pick the ${phase.cityName} zone you'll ride in — you can go online once you're inside it.`
              }
            />
          ) : null}

          <View style={styles.list} accessibilityRole="radiogroup">
            {phase.zones.length === 0 ? (
              <ErrorState title="No zones available" body={`${phase.cityName} has no active zones yet.`} onRetry={() => setAttempt((a) => a + 1)} compact />
            ) : (
              phase.zones.map((z) => (
                <ZoneOption
                  key={z.id}
                  title={z.name}
                  subtitle={`${phase.cityName}${phase.stateName ? `, ${phase.stateName}` : ''}${z.active ? '' : ' · Inactive'}`}
                  selected={z.id === selectedId}
                  disabled={!z.active}
                  onPress={() => setSelectedId(z.id)}
                />
              ))
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.gutter },
  mapCard: { height: 220, borderRadius: 32, borderWidth: 2, borderColor: colors.border, overflow: 'hidden', backgroundColor: '#EBF2F0', alignSelf: 'stretch' },
  mapImage: { width: '100%', height: '100%' },
  pill: { position: 'absolute', left: 14, top: 14, backgroundColor: colors.ink, borderRadius: 30, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md },
  pillWarning: { backgroundColor: colors.ink },
  zoneBadge: { position: 'absolute', left: 14, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: 21, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, maxWidth: '80%' },
  list: { gap: spacing.lg },
});
