import { View } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';

import { colors } from '@/theme';
import { ActiveJobBar } from '@/components/app/ActiveJobBar';
import { BottomTabBar } from '@/components/app/BottomTabBar';

/** Home · Tasks · Earnings · Alerts · Profile with the persistent active-job bar above the tabs. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background }, lazy: true }}
      tabBar={(props) => (
        <View style={{ backgroundColor: colors.background }}>
          <ActiveJobBar />
          <BottomTabBar {...props} />
        </View>
      )}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings' }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
