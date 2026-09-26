import { Stack } from 'expo-router';

import { colors } from '@/theme';

/** Active job flow: gestures disabled so a swipe cannot skip a state; screens navigate via routeForJob(). */
export default function JobLayout() {
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }} />;
}
