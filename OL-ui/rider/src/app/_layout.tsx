import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

import { colors } from '@/theme';
import { queryClient } from '@/hooks/queryClient';
import { useAppServices } from '@/services/useAppServices';
import { ConnectivityBanner } from '@/components/app/ConnectivityBanner';
import { ToastHost } from '@/components/ui/Toast';
import { isDevBuild } from '@/config/env';
import { DevOverlay } from '@/features/dev/DevOverlay';

SplashScreen.preventAutoHideAsync().catch(() => {});

const AppServices = () => {
  useAppServices();
  return null;
};

const TopOverlay = () => {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={[styles.top, { top: insets.top }]}>
      <ConnectivityBanner />
    </View>
  );
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppServices />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade_from_bottom' }}>
            <Stack.Screen name="index" options={{ animation: 'none' }} />
            <Stack.Screen name="intro" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="offer/[id]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }} />
            <Stack.Screen name="status" options={{ gestureEnabled: false }} />
            <Stack.Screen name="dev/scenarios" options={{ presentation: 'modal' }} />
          </Stack>
          <TopOverlay />
          <ToastHost />
          {isDevBuild ? <DevOverlay /> : null}
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  top: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
