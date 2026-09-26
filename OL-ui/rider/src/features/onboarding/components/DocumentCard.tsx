import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { colors, shadows, spacing } from '@/theme';
import { AppText, Icon } from '@/components/ui';

export type DocumentCardStatus = 'todo' | 'pending' | 'verified' | 'rejected' | 'expired';

export interface DocumentCardProps {
  index: number;
  title: string;
  subtitle: string;
  status: DocumentCardStatus;
  /** store-kyc: radius 32, 20px check / pending-dot glyphs, white EDIT pill · solo-kyc: radius 34, 24px state circle, dark START pill. */
  variant: 'store' | 'solo';
  onAction?: () => void;
  busy?: boolean;
}

const TRAIL = ['Submitted', 'Under review', 'Verified'] as const;

const actionLabel = (status: DocumentCardStatus): string | null => {
  switch (status) {
    case 'todo':
      return 'START';
    case 'rejected':
    case 'expired':
      return 'RE-UPLOAD';
    case 'pending':
      return 'EDIT';
    default:
      return null;
  }
};

const StateGlyph = ({ status, index, variant }: { status: DocumentCardStatus; index: number; variant: 'store' | 'solo' }) => {
  if (variant === 'store') {
    if (status === 'verified') return <Icon name="check" size={20} color="lime" strokeWidth={3} />;
    if (status === 'pending') return <Image source={require('@/assets/figma/icon-pending-dot.png')} style={styles.glyph20} accessibilityLabel="Pending" />;
    if (status === 'rejected' || status === 'expired') return <Icon name="alert-triangle" size={20} color="danger" />;
    return (
      <View style={styles.ring20}>
        <AppText variant="labelXs" style={styles.ringNumber}>
          {String(index)}
        </AppText>
      </View>
    );
  }
  if (status === 'verified') {
    return (
      <View style={[styles.circle24, styles.circleLime]}>
        <Icon name="check" size={12} strokeWidth={3} />
      </View>
    );
  }
  if (status === 'pending') {
    return (
      <View style={styles.circle24}>
        <Image source={require('@/assets/figma/icon-pending-dot.png')} style={styles.glyph16} accessibilityLabel="Pending" />
      </View>
    );
  }
  if (status === 'rejected' || status === 'expired') {
    return (
      <View style={[styles.circle24, styles.circleDanger]}>
        <Icon name="alert-triangle" size={12} color="danger" />
      </View>
    );
  }
  return (
    <View style={styles.circle24}>
      <AppText variant="labelXs" style={styles.circleNumber}>
        {String(index)}
      </AppText>
    </View>
  );
};

/** Per-document progress chips: Submitted → Under review → Verified (rejected replaces the last chip). */
const ProgressTrail = ({ status }: { status: DocumentCardStatus }) => {
  if (status === 'todo') return null;
  const failed = status === 'rejected' || status === 'expired';
  const reached = status === 'verified' ? 3 : status === 'pending' ? 2 : 1;
  return (
    <View style={styles.trail} accessibilityLabel={`Document status: ${failed ? status : TRAIL[reached - 1]}`}>
      {TRAIL.map((label, i) => {
        const isLast = i === TRAIL.length - 1;
        const text = failed && isLast ? (status === 'expired' ? 'Expired' : 'Rejected') : label;
        const done = i < reached - 1 || (status === 'verified' && isLast);
        const active = i === reached - 1 && !failed;
        const color = failed && isLast ? colors.danger : done ? colors.ink : active ? colors.lime : colors.border;
        return (
          <View key={label} style={styles.trailItem}>
            {i > 0 ? <View style={[styles.trailLine, { backgroundColor: done || active ? colors.ink : colors.border }]} /> : null}
            <View style={[styles.trailDot, { backgroundColor: color, borderColor: active ? colors.ink : color }]} />
            <AppText variant="labelXs" color={failed && isLast ? 'danger' : done || active ? 'ink' : 'textMuted'} style={styles.trailText}>
              {text}
            </AppText>
          </View>
        );
      })}
    </View>
  );
};

/** KYC checklist card (store-kyc check-card / solo-kyc step-card) with state glyph, copy, progress trail and inline action pill. */
export const DocumentCard = ({ index, title, subtitle, status, variant, onAction, busy }: DocumentCardProps) => {
  const solo = variant === 'solo';
  const label = actionLabel(status);
  const dark = status === 'todo';
  const borderColor = solo ? (status === 'verified' ? colors.borderSubtle : colors.border) : colors.border;
  return (
    <View style={[styles.card, { borderRadius: solo ? 34 : 32, padding: solo ? spacing.xxl : spacing.xl, gap: solo ? spacing.xxl : spacing.lg, borderColor }]} accessibilityLabel={`${title}: ${subtitle}`}>
      <StateGlyph status={status} index={index} variant={variant} />
      <View style={styles.info}>
        <AppText variant="title">{title}</AppText>
        <AppText variant="bodySm" color="textSecondary" style={styles.subtitle}>
          {subtitle}
        </AppText>
        <ProgressTrail status={status} />
      </View>
      {label && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} ${title}`}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          hitSlop={8}
          onPress={onAction}
          style={({ pressed }) => [styles.action, dark ? styles.actionDark : styles.actionLight, pressed && styles.pressed]}>
          {busy ? (
            <ActivityIndicator size="small" color={dark ? colors.limeBright : colors.ink} />
          ) : dark ? (
            <AppText variant="buttonPrimary" color="limeBright" style={styles.startText}>
              {label}
            </AppText>
          ) : (
            <AppText variant="labelXs" color="inkSoft">
              {label}
            </AppText>
          )}
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 2, alignSelf: 'stretch' },
  info: { flex: 1, gap: spacing.xxs },
  subtitle: { fontSize: 11, lineHeight: 15 },
  glyph20: { width: 20, height: 20 },
  glyph16: { width: 16, height: 16 },
  ring20: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  ringNumber: { fontSize: 9, lineHeight: 11 },
  circle24: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  circleLime: { backgroundColor: colors.lime },
  circleDanger: { backgroundColor: colors.surfaceDanger, borderColor: colors.surfaceDanger },
  circleNumber: { fontSize: 11, lineHeight: 13, color: '#000000' },
  trail: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, flexWrap: 'wrap' },
  trailItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  trailLine: { width: 10, height: 1 },
  trailDot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1 },
  trailText: { fontSize: 9, lineHeight: 12 },
  action: { minHeight: 32, minWidth: 44, borderRadius: 100, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.xs },
  actionDark: { backgroundColor: colors.darkAction },
  actionLight: { backgroundColor: colors.surface, ...shadows.soft },
  startText: { fontSize: 14, lineHeight: 18 },
  pressed: { opacity: 0.85 },
});
