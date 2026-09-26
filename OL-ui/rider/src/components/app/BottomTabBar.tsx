import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { colors, radius, spacing } from '@/theme';
import { AppText, Icon, type IconName } from '@/components/ui';
import { useNotifications } from '@/hooks/queries';

const TABS: Record<string, { label: string; icon: IconName }> = {
  home: { label: 'HOME', icon: 'home' },
  tasks: { label: 'TASKS', icon: 'briefcase' },
  earnings: { label: 'EARNINGS', icon: 'indian-rupee' },
  alerts: { label: 'ALERTS', icon: 'bell' },
  profile: { label: 'PROFILE', icon: 'user' },
};

/**
 * Figma navigation-tabs: white bar, 2px #DBE0D6 top border, radius 33, Manrope ExtraBold 10 labels.
 * Active tab: lime (#76EC00) icon pill with 1.5px #DBE0D6 border (profile / notifications / task screens).
 */
export const BottomTabBar = ({ state, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const { data } = useNotifications();
  const unread = data?.items.filter((n) => !n.readAt).length ?? 0;
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const meta = TABS[route.name];
          if (!meta) return null;
          const active = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={meta.label}
              onPress={() => {
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!active && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={styles.tab}>
              <View style={[styles.iconBox, active && styles.iconBoxActive]}>
                <Icon name={meta.icon} size={20} color={colors.ink} />
                {route.name === 'alerts' && unread > 0 ? (
                  <View style={styles.dot}>
                    <AppText variant="labelXs" color="surface" style={styles.dotText}>
                      {unread > 9 ? '9+' : unread}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <AppText variant="tab" color={active ? 'ink' : 'textSecondary'}>
                {meta.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.background, paddingHorizontal: spacing.gutter, paddingTop: spacing.md },
  bar: { backgroundColor: colors.surface, borderTopWidth: 2, borderColor: colors.border, borderRadius: radius.tabBar, flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.lg, paddingBottom: spacing.xs, paddingHorizontal: spacing.xs },
  tab: { flex: 1, alignItems: 'center', gap: spacing.xs, minHeight: 56 },
  iconBox: { padding: 6, borderRadius: 22.5, borderWidth: 1.5, borderColor: 'transparent' },
  iconBoxActive: { backgroundColor: colors.lime, borderColor: colors.border },
  dot: { position: 'absolute', top: -2, right: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  dotText: { fontSize: 9, lineHeight: 11 },
});
