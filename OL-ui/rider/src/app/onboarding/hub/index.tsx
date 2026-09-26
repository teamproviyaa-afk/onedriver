import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing } from '@/theme';
import { AppText, GhostButton, Icon, LoadingState, PrimaryButton, Screen, toast } from '@/components/ui';
import { MapFallback, RiderMap, nativeMapAvailable } from '@/components/app';
import { useZones } from '@/hooks';
import { useDeliveryStore } from '@/stores/useDeliveryStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { getCurrentPosition } from '@/location/locationService';
import type { LatLng } from '@/types';
import { FormField, OnboardingHeader, centroid, titleCaseId } from '@/features/onboarding/components';

/**
 * address-setup ("Primary Start Hub"): city/region from the draft, starting address + landmark,
 * and a draggable pin (defaults to the rider's position, else the zone centre).
 */
export default function HubScreen() {
  const cityId = useOnboardingStore((s) => s.cityId);
  const zoneId = useOnboardingStore((s) => s.zoneId);
  const zoneName = useOnboardingStore((s) => s.zoneName);
  const draftHub = useOnboardingStore((s) => s.hub);
  const patch = useOnboardingStore((s) => s.patch);
  const complete = useOnboardingStore((s) => s.complete);
  const zones = useZones(cityId);
  const zone = zones.data?.find((z) => z.id === zoneId);

  const [address, setAddress] = useState(draftHub?.address ?? '');
  const [landmark, setLandmark] = useState(draftHub?.landmark ?? '');
  const [addressError, setAddressError] = useState<string | null>(null);
  // Default pin: draft hub → last known position → fresh GPS fix (effect) → zone centre (derived).
  const [pin, setPin] = useState<LatLng | null>(() => {
    if (draftHub) return { lat: draftHub.lat, lng: draftHub.lng };
    const known = useDeliveryStore.getState().position;
    return known ? { lat: known.lat, lng: known.lng } : null;
  });
  const [locating, setLocating] = useState(() => pin === null);

  useEffect(() => {
    if (!locating) return;
    let cancelled = false;
    void getCurrentPosition().then((p) => {
      if (cancelled) return;
      setLocating(false);
      if (p) setPin({ lat: p.lat, lng: p.lng });
    });
    return () => {
      cancelled = true;
    };
    // Runs once for the initial fix; "Use my location" re-requests explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoneCentre = zone ? centroid(zone.boundary) : null;
  const effectivePin = pin ?? (locating ? null : zoneCentre);

  const locateMe = async () => {
    setLocating(true);
    const p = await getCurrentPosition();
    setLocating(false);
    if (p) setPin({ lat: p.lat, lng: p.lng });
    else toast.show('Location is unavailable. Allow location access in Settings.', 'warning');
  };

  const onContinue = () => {
    const trimmed = address.trim();
    if (trimmed.length < 3) {
      setAddressError('Enter the address or landmark where you start your day.');
      return;
    }
    if (!effectivePin) {
      toast.show('Waiting for your location — drop the pin first.', 'warning');
      return;
    }
    setAddressError(null);
    patch({ hub: { lat: effectivePin.lat, lng: effectivePin.lng, address: trimmed, landmark: landmark.trim() || undefined }, hubConfirmed: false });
    complete('hub');
    router.push('/onboarding/hub/confirm' as never);
  };

  const region = [zoneName, titleCaseId(cityId)].filter(Boolean).join(', ');

  return (
    <Screen scroll keyboard contentStyle={styles.content} footer={<PrimaryButton label="Save Primary Starting Hub" onPress={onContinue} />}>
      <OnboardingHeader title="Primary Start Hub" subtitle="Define where you prefer to start your deliveries each day." />

      <View style={styles.form}>
        <FormField label="City/Region" value={region || 'Zone not selected'} editable={false} />
        <FormField
          label="Starting address / hub point"
          placeholder="e.g. Near Shivajinagar Railway Station"
          value={address}
          onChangeText={(t) => {
            setAddress(t);
            if (addressError) setAddressError(null);
          }}
          error={addressError}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <FormField label="Landmark (optional)" placeholder="e.g. Next to Metro Gate No. 2" value={landmark} onChangeText={setLandmark} autoCapitalize="words" returnKeyType="done" />
      </View>

      <View style={styles.mapBlock}>
        <View style={styles.mapHeader}>
          <AppText variant="label" uppercase>
            Drop your start pin
          </AppText>
          <GhostButton label="Use my location" icon="locate" iconPosition="left" onPress={() => void locateMe()} disabled={locating} />
        </View>
        <View style={styles.mapCard}>
          {!effectivePin ? (
            <LoadingState label={locating ? 'Locating you…' : 'Waiting for your zone…'} compact style={styles.mapLoading} />
          ) : nativeMapAvailable ? (
            <RiderMap draggablePin={effectivePin} onPinDragEnd={setPin} zoneBoundary={zone?.boundary} focus="all" height={200} />
          ) : (
            <>
              <MapFallback height={200} />
              <View pointerEvents="none" style={styles.pinOverlay}>
                <Icon name="map-pin" size={36} fill={colors.lime} />
              </View>
            </>
          )}
        </View>
        <AppText variant="bodySm" color="textSecondary">
          {nativeMapAvailable ? 'Drag the pin to the exact spot you start from. ' : ''}
          {effectivePin ? `Pin: ${effectivePin.lat.toFixed(5)}, ${effectivePin.lng.toFixed(5)}` : ''}
        </AppText>
      </View>

      <View style={styles.infoBox}>
        <Icon name="map-pin" size={20} />
        <AppText variant="bodySemi" style={styles.infoText}>
          {"We'll prioritize dispatching orders within 3-5 km of this base point to minimize dry runs."}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.x3l },
  form: { gap: spacing.xxl },
  mapBlock: { gap: spacing.md },
  mapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapCard: { height: 200, borderRadius: 32, borderWidth: 2, borderColor: colors.border, overflow: 'hidden', backgroundColor: '#EBF2F0', alignSelf: 'stretch' },
  mapLoading: { flex: 1, paddingVertical: 0 },
  pinOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 36 },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, backgroundColor: colors.limeTint, borderWidth: 2, borderColor: colors.border, borderRadius: 34, padding: spacing.xxl },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
