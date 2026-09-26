import { forwardRef } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, typography, type ColorToken, type TypographyToken } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TypographyToken;
  color?: ColorToken | (string & {});
  align?: TextStyle['textAlign'];
  uppercase?: boolean;
}

const resolveColor = (c?: string): string | undefined => (c && c in colors ? colors[c as ColorToken] : c);

/** Typography primitive: every visible string goes through here (fonts, scaling, a11y). */
export const AppText = forwardRef<Text, AppTextProps>(function AppText({ variant = 'body', color = 'ink', align, uppercase, style, children, ...rest }, ref) {
  return (
    <Text
      ref={ref}
      allowFontScaling
      maxFontSizeMultiplier={1.3}
      {...rest}
      style={[typography[variant], { color: resolveColor(color) }, align ? { textAlign: align } : null, uppercase ? { textTransform: 'uppercase' } : null, style]}>
      {children}
    </Text>
  );
});
