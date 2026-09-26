import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * OneLocal Rider (OnLatur Rider) — Expo app config.
 * Native behaviour is configured here and through config plugins only
 * (Continuous Native Generation: never edit ios/ or android/ by hand).
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'OneLocal Rider',
  slug: 'onelocal-rider',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'onelocalrider',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.onelocal.rider',
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'OneLocal Rider uses your location to find orders nearby and to guide you to the store and the customer during a delivery.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'OneLocal Rider shares your live location with the customer only while you are on an active delivery.',
      NSCameraUsageDescription:
        'The camera is used to scan pickup QR codes, capture delivery photo proof and upload KYC documents.',
      UIBackgroundModes: ['location'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.onelocal.rider',
    adaptiveIcon: {
      backgroundColor: '#61FF00',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.CAMERA',
      'android.permission.VIBRATE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
    ],
    config: process.env.GOOGLE_MAPS_ANDROID_API_KEY
      ? { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY } }
      : undefined,
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#61FF00',
        image: './assets/images/splash-icon.png',
        imageWidth: 240,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'OneLocal Rider uses your location to find orders nearby and to guide you during a delivery.',
        locationAlwaysAndWhenInUsePermission:
          'OneLocal Rider shares your live location with the customer only while you are on an active delivery.',
        isAndroidForegroundServiceEnabled: true,
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
    [
      'expo-notifications',
      {
        color: '#76EC00',
        defaultChannel: 'default',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission:
          'The camera is used to scan pickup QR codes, capture delivery photo proof and upload KYC documents.',
      },
    ],
    'expo-secure-store',
    'expo-task-manager',
    [
      'expo-font',
      {
        fonts: [
          './node_modules/@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf',
          './node_modules/@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf',
          './node_modules/@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf',
          './node_modules/@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf',
          './node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
          './node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
          './node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf',
          './node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf',
        ],
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {},
  },
});
