/** Border radii used in the Figma file. */
export const radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  card: 32,
  banner: 23,
  tabBar: 33,
  pill: 100,
  circle: 999,
} as const;

export type RadiusToken = keyof typeof radius;
