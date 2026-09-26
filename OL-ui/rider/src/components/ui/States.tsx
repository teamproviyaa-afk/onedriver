import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { OutlineButton, PrimaryButton } from './Buttons';
import { Icon, type IconName } from './Icon';

export const LoadingState = ({ label = 'Loading…', style, compact }: { label?: string; style?: StyleProp<ViewStyle>; compact?: boolean }) => (
  <View style={[styles.center, compact && styles.compact, style]} accessibilityRole="progressbar" accessibilityLabel={label}>
    <ActivityIndicator color={colors.ink} size={compact ? 'small' : 'large'} />
    <AppText variant="bodySemi" color="textSecondary">
      {label}
    </AppText>
  </View>
);

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState = ({ icon = 'package', title, body, actionLabel, onAction, style }: EmptyStateProps) => (
  <View style={[styles.center, style]}>
    <View style={styles.iconRing}>
      <Icon name={icon} size={28} color="textSecondary" />
    </View>
    <AppText variant="h4" align="center">
      {title}
    </AppText>
    {body ? (
      <AppText variant="body" color="textSecondary" align="center">
        {body}
      </AppText>
    ) : null}
    {actionLabel && onAction ? <OutlineButton label={actionLabel} onPress={onAction} /> : null}
  </View>
);

export interface ErrorStateProps {
  title?: string;
  body?: string;
  onRetry?: () => void;
  retryLabel?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export const ErrorState = ({ title = 'Something went wrong', body = 'Check your connection and try again.', onRetry, retryLabel = 'Retry', style, compact }: ErrorStateProps) => (
  <View style={[styles.center, compact && styles.compact, style]} accessibilityLiveRegion="polite">
    <View style={[styles.iconRing, styles.iconDanger]}>
      <Icon name="alert-triangle" size={26} color="danger" />
    </View>
    <AppText variant="h4" align="center">
      {title}
    </AppText>
    <AppText variant="body" color="textSecondary" align="center">
      {body}
    </AppText>
    {onRetry ? <RetryButton onPress={onRetry} label={retryLabel} /> : null}
  </View>
);

export const RetryButton = ({ onPress, label = 'Retry', loading }: { onPress: () => void; label?: string; loading?: boolean }) => (
  <PrimaryButton label={label} onPress={onPress} icon="refresh-cw" iconPosition="left" fullWidth={false} loading={loading} style={styles.retry} />
);

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.gutter },
  compact: { flex: 0, paddingVertical: spacing.x5l },
  iconRing: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  iconDanger: { backgroundColor: colors.surfaceDanger },
  retry: { paddingHorizontal: spacing.x5l, borderRadius: radius.pill, marginTop: spacing.md },
});
