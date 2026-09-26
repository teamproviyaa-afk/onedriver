import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText, Icon } from '@/components/ui';

export interface OTPInputProps {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  /** When true the OS keyboard is hidden and the in-app keypad drives the value (proof-otp). */
  keypad?: boolean;
  boxSize?: number;
  boxRadius?: number;
  error?: boolean;
  autoFocus?: boolean;
  onComplete?: (v: string) => void;
}

/** OTP boxes (login: 6 × 48, proof: 4 × 64 radius 32) with Android SMS auto-fill support. */
export const OTPInput = ({ value, onChange, length = 6, keypad = false, boxSize = 48, boxRadius = 12, error, autoFocus = true, onComplete }: OTPInputProps) => {
  const ref = useRef<TextInput>(null);
  useEffect(() => {
    if (value.length === length) onComplete?.(value);
  }, [value, length, onComplete]);
  const digits = value.padEnd(length, ' ').split('').slice(0, length);
  return (
    <Pressable onPress={() => !keypad && ref.current?.focus()} accessibilityLabel={`One-time code, ${value.length} of ${length} digits entered`} style={styles.wrap}>
      <View style={styles.row}>
        {digits.map((d, i) => {
          const filled = d.trim().length > 0;
          const cursor = i === value.length;
          return (
            <View key={i} style={[styles.box, { width: boxSize, height: boxSize, borderRadius: boxRadius }, cursor && styles.boxActive, error && styles.boxError]}>
              <AppText variant={boxSize >= 60 ? 'display' : 'h3'}>{filled ? d : ''}</AppText>
            </View>
          );
        })}
      </View>
      {!keypad ? (
        <TextInput
          ref={ref}
          value={value}
          onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          importantForAutofill="yes"
          maxLength={length}
          autoFocus={autoFocus}
          caretHidden
          style={styles.hidden}
          accessibilityLabel="One-time code input"
        />
      ) : null}
    </Pressable>
  );
};

export interface NumericKeypadProps {
  onDigit: (d: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}

/** In-app keypad from proof-otp: 4×3 grid, white keys, 1px #DBE0D6, radius 24, height 48. */
export const NumericKeypad = ({ onDigit, onDelete, disabled }: NumericKeypadProps) => {
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ];
  return (
    <View style={styles.keypad}>
      {rows.map((r, i) => (
        <View key={i} style={styles.keyRow}>
          {r.map((k, j) => {
            if (k === '') return <View key={j} style={styles.keySpacer} />;
            const isDel = k === 'del';
            return (
              <Pressable
                key={j}
                accessibilityRole="button"
                accessibilityLabel={isDel ? 'Delete' : k}
                disabled={disabled}
                onPress={() => (isDel ? onDelete() : onDigit(k))}
                style={({ pressed }) => [styles.key, pressed && styles.keyPressed, disabled && styles.keyDisabled]}>
                {isDel ? <Icon name="delete" size={20} /> : <AppText variant="h4">{k}</AppText>}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', alignItems: 'center' },
  row: { flexDirection: 'row', gap: spacing.lg, justifyContent: 'center' },
  box: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  boxActive: { borderColor: colors.borderStrong },
  boxError: { borderColor: colors.danger },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  keypad: { gap: spacing.base, paddingTop: spacing.x3l, alignSelf: 'stretch' },
  keyRow: { flexDirection: 'row', gap: spacing.base },
  key: { flex: 1, height: 48, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  keyPressed: { backgroundColor: colors.surfaceMuted },
  keyDisabled: { opacity: 0.5 },
  keySpacer: { flex: 1 },
});
