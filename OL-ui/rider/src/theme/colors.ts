/**
 * Colour tokens extracted from the Figma "rider app" file (rider-ui-kit + screens).
 * Values are the exact hex codes used in the design. Where a screen uses a
 * different value the screen passes it explicitly; nothing else is hard-coded.
 */
export const colors = {
  // Surfaces
  background: '#FAFAF9',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F1EF',
  surfaceLime: '#E8F8D5',
  surfaceDanger: '#FEE2E2',
  surfaceWarning: '#FEF3C7',
  surfaceInfo: '#E5E5E0',
  overlay: 'rgba(18, 18, 18, 0.55)',

  // Ink / text
  ink: '#121212',
  inkDeep: '#050605',
  inkSoft: '#080808',
  textSecondary: '#666660',
  textMuted: '#9C9C96',
  textOnDark: '#FFFFFF',
  textOnAccent: '#121212',

  // Brand
  lime: '#76EC00',
  limeBright: '#A1FE2F',
  limeElectric: '#B3F400',
  limeSplashTop: '#61FF00',
  limeSplashMid: '#52F000',
  limeTint: 'rgba(118, 236, 0, 0.10)',
  darkAction: '#0C1F15',

  // Borders
  border: '#DBE0D6',
  borderSubtle: '#E5E5E0',
  borderStrong: '#121212',

  // Semantic
  danger: '#EF4444',
  dangerDark: '#B91C1C',
  warning: '#F59E0B',
  success: '#16A34A',
  info: '#2563EB',

  transparent: 'transparent',
} as const;

export type ColorToken = keyof typeof colors;
