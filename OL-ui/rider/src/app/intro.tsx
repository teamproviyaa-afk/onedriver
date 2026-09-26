import { useCallback, useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View, useWindowDimensions, type ImageSourcePropType, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router } from 'expo-router';

import { AppText, PrimaryButton, Screen } from '@/components/ui';
import { colors, radius, shadows, spacing } from '@/theme';
import { useAuthStore } from '@/stores/useAuthStore';

interface Slide {
  key: string;
  title: string;
  body: string;
  image: ImageSourcePropType;
  /** screen-intro-3: a second character render composited with multiply blending. */
  overlay?: { source: ImageSourcePropType; left: number; top: number; size: number };
}

const SLIDES: Slide[] = [
  {
    key: 'flexible-work',
    title: 'Work on Your Own Terms',
    body: 'No fixed shifts. Go online whenever you want and deliver when it fits your schedule.',
    image: require('@/assets/figma/intro-1-flexible-work.png'),
  },
  {
    key: 'transparent-earnings',
    title: 'Transparent Daily Earnings',
    body: 'Track every rupee right after completing a gig. Instant cash-out whenever you need.',
    image: require('@/assets/figma/intro-2-transparent-earnings.png'),
  },
  {
    key: 'accept-and-go',
    title: 'Simple Accept & Go Flow',
    body: 'Review route and payout before accepting. Swipe to complete the deliverable.',
    image: require('@/assets/figma/intro-3-accept-and-go.png'),
  },
];

const ILLUSTRATION_HEIGHT = 240;

/**
 * Intro carousel (Figma screen-intro-1/2/3): three value-prop slides with a paged
 * horizontal list, SKIP (hidden on the last slide), dot pagination and Next / Get Started.
 */
export default function IntroScreen() {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  // Horizontal lists size items by content; measure the list so each slide fills it vertically.
  const [listHeight, setListHeight] = useState(0);
  const last = index === SLIDES.length - 1;

  const finish = useCallback(() => {
    useAuthStore.getState().markIntroSeen();
    router.replace('/permissions/location' as never);
  }, []);

  const goTo = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, i));
    setIndex(clamped);
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
  }, []);

  const onNext = useCallback(() => {
    if (last) finish();
    else goTo(index + 1);
  }, [finish, goTo, index, last]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      if (i !== index) setIndex(Math.max(0, Math.min(SLIDES.length - 1, i)));
    },
    [index, width],
  );

  const renderItem = useCallback(
    ({ item }: { item: Slide }) => (
      <View style={[styles.slide, { width, height: listHeight > 0 ? listHeight : undefined }]}>
        <View style={styles.graphics}>
          <Image source={item.image} style={styles.illustration} resizeMode="cover" accessibilityIgnoresInvertColors accessible={false} />
          {item.overlay ? (
            <Image
              source={item.overlay.source}
              resizeMode="contain"
              accessible={false}
              style={[styles.overlay, { left: item.overlay.left, top: item.overlay.top, width: item.overlay.size, height: item.overlay.size }]}
            />
          ) : null}
        </View>
        <View style={styles.textContent}>
          <AppText variant="display" style={styles.heading} accessibilityRole="header">
            {item.title}
          </AppText>
          <AppText variant="bodyLg" color="textSecondary" style={styles.body}>
            {item.body}
          </AppText>
        </View>
      </View>
    ),
    [width, listHeight],
  );

  return (
    <Screen padded={false} contentStyle={styles.content}>
      <View style={styles.topSkip}>
        <Pressable
          onPress={finish}
          disabled={last}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Skip intro"
          accessibilityElementsHidden={last}
          importantForAccessibility={last ? 'no-hide-descendants' : 'auto'}
          style={({ pressed }) => [styles.skip, last && styles.skipHidden, pressed && styles.pressed]}>
          <AppText variant="title" style={styles.skipLabel}>
            SKIP
          </AppText>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        extraData={listHeight}
        style={styles.list}
        accessibilityRole="none"
      />

      <View style={styles.bottomControls}>
        <View style={styles.pagination} accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`} accessibilityRole="progressbar">
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <PrimaryButton label={last ? 'Get Started' : 'Next'} onPress={onNext} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  topSkip: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: spacing.lg, paddingHorizontal: spacing.gutter },
  skip: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skipHidden: { opacity: 0 },
  skipLabel: { textDecorationLine: 'underline' },
  pressed: { opacity: 0.7 },
  list: { flex: 1 },
  slide: { justifyContent: 'space-evenly', paddingHorizontal: spacing.gutter },
  graphics: {
    height: ILLUSTRATION_HEIGHT,
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustration: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: undefined, height: undefined, borderRadius: radius.card },
  overlay: { position: 'absolute', mixBlendMode: 'multiply' },
  textContent: { gap: spacing.lg, alignSelf: 'stretch' },
  heading: { fontSize: 32, lineHeight: 37 },
  body: { lineHeight: 22 },
  // Figma home-indicator-wrapper: 20px between the button and the home indicator.
  bottomControls: { gap: spacing.gutter, alignItems: 'center', paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.x3l },
  pagination: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderSubtle, ...shadows.soft },
  dotActive: { width: 24, backgroundColor: colors.ink },
});
