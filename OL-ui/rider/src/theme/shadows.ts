import { Platform, type ViewStyle } from 'react-native';

type Shadow = Pick<ViewStyle, 'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'>;

const mk = (color: string, y: number, blur: number, opacity: number, elevation: number): Shadow =>
  Platform.select<Shadow>({
    android: { elevation, shadowColor: color },
    default: {
      shadowColor: color,
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur / 2,
    },
  }) as Shadow;

/** Shadows from rider-ui-kit: primary button, soft card, destructive hard shadow. */
export const shadows = {
  none: {} as Shadow,
  primaryButton: mk('#0C1F15', 8, 8, 0.08, 4),
  soft: mk('#000000', 2, 4, 0.1, 2),
  card: mk('#000000', 4, 12, 0.06, 3),
  destructive: mk('#050A03', 5, 0, 0.34, 6),
  floating: mk('#000000', 9, 12, 0.16, 8),
} as const;

export type ShadowToken = keyof typeof shadows;
