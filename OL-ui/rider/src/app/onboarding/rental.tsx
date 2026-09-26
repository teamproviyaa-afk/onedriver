import { useState } from 'react';
import { Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { router } from 'expo-router';

import { colors, shadows, spacing } from '@/theme';
import { AppText, ConfirmationSheet, InfoBanner, PrimaryButton, Screen } from '@/components/ui';
import { OnboardingHeader } from '@/features/onboarding/components';

interface Listing {
  id: string;
  name: string;
  deposit: string;
  rate: string;
  tags: string[];
  image: ImageSourcePropType;
  featured: boolean;
}

/** Illustrative partner listings from the Figma frame — the marketplace itself ships in V2. */
const LISTINGS: Listing[] = [
  { id: 'zypp', name: 'Zypp Electric EV', deposit: 'Deposit: ₹1,000 refundable', rate: '₹149/day', tags: ['80km range', 'GPS Tracked'], image: require('@/assets/figma/rental-scooter-1.png'), featured: true },
  { id: 'yulu', name: 'Yulu Wynn Solo', deposit: 'Deposit: ₹500 refundable', rate: '₹99/day', tags: ['80km range', 'GPS Tracked'], image: require('@/assets/figma/rental-scooter-2.png'), featured: false },
];

/** rental-marketplace: V2 preview. Listings are shown but not selectable; every action explains "coming soon". */
export default function RentalScreen() {
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/onboarding/vehicle' as never));

  return (
    <Screen scroll contentStyle={styles.content} footer={<PrimaryButton label="Back to vehicle" icon="arrow-left" iconPosition="left" onPress={back} />}>
      <OnboardingHeader title="Rental Marketplace" subtitle="Select a verified partner EV. All rates include zero maintenance costs." backIcon="chevron-left" onBack={back} />

      <InfoBanner tone="dark" icon="sparkles" text="COMING SOON (V2) — partner rentals open in the next release. Register your own vehicle to start now." />

      <View style={styles.stack} accessibilityLabel="Rental listings preview, not yet available">
        {LISTINGS.map((l) => (
          <View key={l.id} style={[styles.card, { borderColor: l.featured ? colors.border : colors.borderSubtle }]}>
            <Image source={l.image} style={styles.visual} resizeMode="cover" accessibilityLabel={l.name} />
            <View style={styles.cardTop}>
              <View style={styles.nameBlock}>
                <AppText variant="titleLg">{l.name}</AppText>
                <AppText variant="bodySm" color="textSecondary">
                  {l.deposit}
                </AppText>
              </View>
              <View style={styles.rateBadge}>
                <AppText variant="label">{l.rate}</AppText>
              </View>
            </View>
            <View style={styles.cardBottom}>
              <View style={styles.tags}>
                {l.tags.map((t) => (
                  <View key={t} style={styles.tag}>
                    <AppText variant="labelXs" color="textSecondary">
                      {t}
                    </AppText>
                  </View>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View plans for ${l.name}, coming soon`}
                onPress={() => setComingSoon(l.name)}
                style={({ pressed }) => [styles.viewCta, l.featured ? styles.viewCtaDark : styles.viewCtaLight, pressed && styles.pressed]}>
                <AppText variant="label" color={l.featured ? 'surface' : 'inkSoft'}>
                  View Plans
                </AppText>
              </Pressable>
            </View>
            <View pointerEvents="none" style={styles.veil} />
          </View>
        ))}
      </View>

      <ConfirmationSheet
        visible={comingSoon !== null}
        onClose={() => setComingSoon(null)}
        icon="bike"
        title="Rentals are coming soon"
        body={`${comingSoon ?? 'Partner'} plans open in V2. For now, register a vehicle you own to go online.`}
        cancelLabel="Back to vehicle"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.x3l },
  stack: { gap: spacing.lg },
  card: { backgroundColor: colors.surface, borderWidth: 2, borderRadius: 32, padding: spacing.xxl, gap: spacing.lg, overflow: 'hidden' },
  visual: { width: '100%', height: 100, borderRadius: 32, borderWidth: 1, borderColor: colors.borderSubtle },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.lg },
  nameBlock: { flex: 1, gap: spacing.xxs },
  rateBadge: { backgroundColor: colors.lime, borderWidth: 2, borderColor: colors.border, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  tags: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', flex: 1 },
  tag: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 11, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  viewCta: { paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, minHeight: 36, alignItems: 'center', justifyContent: 'center', ...shadows.soft },
  viewCtaDark: { backgroundColor: colors.ink, borderRadius: 16 },
  viewCtaLight: { backgroundColor: colors.surface, borderRadius: 100 },
  pressed: { opacity: 0.85 },
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(250, 250, 249, 0.35)' },
});
