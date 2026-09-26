/** 4pt spacing scale. Screen gutter is 24 in Figma (390 x 844 frames). */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  base: 10,
  lg: 12,
  xl: 14,
  xxl: 16,
  x3l: 20,
  gutter: 24,
  x4l: 28,
  x5l: 32,
  x6l: 40,
  x7l: 48,
  x8l: 64,
} as const;

export type SpacingToken = keyof typeof spacing;
