import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, shadows, spacing } from '@/theme';

export interface OtpBoxesProps {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  error?: boolean;
  autoFocus?: boolean;
  editable?: boolean;
  /** Called once as soon as the last digit is entered (typed or SMS auto-filled). */
  onComplete?: (v: string) => void;
  style?: StyleProp<ViewStyle>;
}

/** Figma screen-otp digit row: 6 boxes, 56 tall, radius 25.167, gap 8, lime active border and a caret. */
const BOX_RADIUS = 25.167;

/**
 * Login OTP boxes from Figma screen-otp. The ui-kit `OTPInput` is the fixed-size
 * (48 / 64 px) variant with an ink active border; this one stretches the boxes across
 * the gutter, uses the lime focus ring and shows a blinking caret in the active box.
 * A single hidden TextInput drives the value so SMS auto-fill keeps working.
 */
export const OtpBoxes = ({ value, onChange, length = 6, error = false, autoFocus = true, editable = true, onComplete, style }: OtpBoxesProps) => {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [blink] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!focused) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      blink.setValue(1);
    };
  }, [focused, blink]);

  const handleChange = (t: string) => {
    const next = t.replace(/\D/g, '').slice(0, length);
    onChange(next);
    if (next.length === length && next !== value) onComplete?.(next);
  };

  const activeIndex = value.length < length ? value.length : -1;

  return (
    <Pressable
      onPress={() => input.current?.focus()}
      disabled={!editable}
      accessibilityLabel={`One-time code, ${value.length} of ${length} digits entered`}
      style={[styles.wrap, style]}>
      <View style={styles.row}>
        {Array.from({ length }, (_, i) => {
          const digit = value[i] ?? '';
          const active = focused && i === activeIndex;
          return (
            <View key={i} style={[styles.box, active && styles.boxActive, error && styles.boxError, !editable && styles.boxDisabled]}>
              {digit ? <AppText variant="h1">{digit}</AppText> : active ? <Animated.View style={[styles.caret, { opacity: blink }]} /> : null}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        importantForAutofill="yes"
        maxLength={length}
        autoFocus={autoFocus}
        editable={editable}
        caretHidden
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hidden}
        accessibilityLabel="One-time code input"
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', alignSelf: 'stretch' },
  box: {
    flex: 1,
    height: 56,
    borderRadius: BOX_RADIUS,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.lime },
  boxError: { borderColor: colors.danger },
  boxDisabled: { opacity: 0.6 },
  caret: { width: 2, height: 24, backgroundColor: colors.ink, ...shadows.soft },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
