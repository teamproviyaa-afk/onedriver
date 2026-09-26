import type { TextStyle } from 'react-native';

/**
 * Font families as registered with expo-font (file names from @expo-google-fonts).
 * Figma uses Manrope (Medium/SemiBold/Bold/ExtraBold) and Inter (Bold) — see rider-ui-kit.
 */
export const fontFamily = {
  manropeMedium: 'Manrope_500Medium',
  manropeSemiBold: 'Manrope_600SemiBold',
  manropeBold: 'Manrope_700Bold',
  manropeExtraBold: 'Manrope_800ExtraBold',
  interRegular: 'Inter_400Regular',
  interMedium: 'Inter_500Medium',
  interSemiBold: 'Inter_600SemiBold',
  interBold: 'Inter_700Bold',
} as const;

export const fontSize = {
  xxs: 10,
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  lg: 15,
  xl: 16,
  h4: 18,
  h3: 20,
  h2: 22,
  h1: 24,
  display: 28,
  displayLg: 32,
  hero: 36,
  jumbo: 48,
} as const;

type Style = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing'>;

const mk = (family: string, size: number, lineHeight?: number, letterSpacing?: number): Style => ({
  fontFamily: family,
  fontSize: size,
  lineHeight: lineHeight ?? Math.round(size * 1.35),
  letterSpacing,
});

/** Named text styles matching the Figma component spec. */
export const typography = {
  hero: mk(fontFamily.manropeExtraBold, fontSize.hero, 44),
  display: mk(fontFamily.manropeExtraBold, fontSize.display, 36),
  h1: mk(fontFamily.manropeExtraBold, fontSize.h1, 32),
  h2: mk(fontFamily.manropeExtraBold, fontSize.h2, 30),
  h3: mk(fontFamily.manropeExtraBold, fontSize.h3, 27),
  h4: mk(fontFamily.manropeExtraBold, fontSize.h4, 24),
  titleLg: mk(fontFamily.manropeExtraBold, fontSize.xl, 22),
  title: mk(fontFamily.manropeExtraBold, fontSize.base, 19),
  titleSm: mk(fontFamily.manropeExtraBold, fontSize.md, 18),
  label: mk(fontFamily.manropeExtraBold, fontSize.sm, 16),
  labelXs: mk(fontFamily.manropeExtraBold, fontSize.xxs, 14),
  bodyLg: mk(fontFamily.manropeMedium, fontSize.xl, 24),
  body: mk(fontFamily.manropeMedium, fontSize.base, 20),
  bodySm: mk(fontFamily.manropeMedium, fontSize.sm, 17),
  bodySemi: mk(fontFamily.manropeSemiBold, fontSize.base, 20),
  bodySemiLg: mk(fontFamily.manropeSemiBold, fontSize.xl, 22),
  bodyBold: mk(fontFamily.manropeBold, fontSize.base, 19),
  bodyBoldSm: mk(fontFamily.manropeBold, fontSize.sm, 16),
  buttonPrimary: mk(fontFamily.interBold, fontSize.xl, 20),
  buttonSecondary: mk(fontFamily.manropeExtraBold, fontSize.xl, 22),
  buttonSm: mk(fontFamily.manropeExtraBold, fontSize.base, 19),
  chip: mk(fontFamily.manropeExtraBold, fontSize.md, 18),
  tab: mk(fontFamily.manropeExtraBold, fontSize.xxs, 14),
  statusTime: mk(fontFamily.manropeExtraBold, fontSize.lg, 20),
  mono: mk(fontFamily.interSemiBold, fontSize.base, 20),
} as const;

export type TypographyToken = keyof typeof typography;
