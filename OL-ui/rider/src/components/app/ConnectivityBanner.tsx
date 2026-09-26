import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import type { ConnectivityState } from '@/types';
import { AppText } from '@/components/ui';
import { useConnectivityStore } from '@/stores/useConnectivityStore';

/** Exact copy + colours from Figma connectivity-states. */
export const CONNECTIVITY_COPY: Record<ConnectivityState, { label: string; caption: string; bg: string; fg: string; border: boolean }> = {
  online_heartbeat: { label: 'ONLINE • HEARTBEAT ON', caption: 'Normal operation mode. Continuous coordinate trace active.', bg: colors.lime, fg: colors.ink, border: true },
  syncing: { label: 'SYNCING QUEUED TASKS', caption: 'Connection resumed. Transmitting offline dispatch records.', bg: '#3B82F6', fg: '#000000', border: false },
  offline: { label: 'OFFLINE MODE ACTIVATED', caption: 'No cellular data. Encrypting signatures in local device cache.', bg: colors.warning, fg: '#000000', border: false },
  sync_error: { label: 'SYNC ERROR • RETRYING', caption: 'API payload rejected. Securely queuing for next gateway retry.', bg: colors.danger, fg: '#000000', border: false },
};

export const ConnectivityBadge = ({ state, withCaption = false }: { state: ConnectivityState; withCaption?: boolean }) => {
  const c = CONNECTIVITY_COPY[state];
  return (
    <View style={styles.badgeWrap}>
      <View style={[styles.badge, { backgroundColor: c.bg, borderWidth: c.border ? 1 : 0 }]} accessibilityRole="text" accessibilityLiveRegion="polite">
        <AppText variant="labelXs" color={c.fg} style={styles.badgeText}>
          {c.label}
        </AppText>
      </View>
      {withCaption ? (
        <AppText variant="bodySm" color="textSecondary">
          {c.caption}
        </AppText>
      ) : null}
    </View>
  );
};

/**
 * Global banner under the status bar. Shown while the rider is on duty
 * (heartbeat) or whenever the app is offline / syncing / retrying.
 */
export const ConnectivityBanner = () => {
  const state = useConnectivityStore((s) => s.state);
  const heartbeatOn = useConnectivityStore((s) => s.heartbeatOn);
  const pending = useConnectivityStore((s) => s.pendingCount);
  if (state === 'online_heartbeat' && !heartbeatOn) return null;
  const c = CONNECTIVITY_COPY[state];
  return (
    <View style={styles.bar} pointerEvents="none">
      <View style={[styles.badge, { backgroundColor: c.bg, borderWidth: c.border ? 1 : 0 }]}>
        <AppText variant="labelXs" color={c.fg} style={styles.badgeText}>
          {c.label}
          {state === 'syncing' && pending > 0 ? ` (${pending})` : ''}
        </AppText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { alignItems: 'center', paddingVertical: spacing.xs, backgroundColor: 'transparent' },
  badgeWrap: { gap: spacing.md, alignSelf: 'stretch' },
  badge: { alignSelf: 'flex-start', borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.xs },
  badgeText: { fontSize: 11, lineHeight: 14 },
});
