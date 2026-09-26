import { StyleSheet } from 'react-native';

import { fontFamily } from '@/theme';

/** Literal Figma text sizes that have no typography token (11/13/15/40/48 px). */
export const figmaText = StyleSheet.create({
  label11: { fontFamily: fontFamily.manropeExtraBold, fontSize: 11, lineHeight: 15 },
  value15: { fontFamily: fontFamily.manropeExtraBold, fontSize: 15, lineHeight: 20 },
  body13: { fontFamily: fontFamily.manropeMedium, fontSize: 13, lineHeight: 18 },
  semi13: { fontFamily: fontFamily.manropeSemiBold, fontSize: 13, lineHeight: 18 },
  amount40: { fontFamily: fontFamily.manropeExtraBold, fontSize: 40, lineHeight: 48 },
  timer48: { fontFamily: fontFamily.manropeExtraBold, fontSize: 48, lineHeight: 58 },
});
