import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins';

/**
 * Android 11+ package visibility: without a <queries> entry Linking.canOpenURL() cannot see
 * Google Maps' turn-by-turn scheme, and the navigation hand-off would drop to the web link.
 */
const withNavigationQueries: ConfigPlugin = (cfg) =>
  withAndroidManifest(cfg, (c) => {
    const manifest = c.modResults.manifest;
    const queries = manifest.queries ?? [];
    if (queries.length === 0) queries.push({});
    const query = queries[0]!;
    const intents = query.intent ?? [];
    const scheme = 'google.navigation';
    if (!intents.some((i) => i.data?.some((d) => d.$?.['android:scheme'] === scheme))) {
      intents.push({ action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }], data: [{ $: { 'android:scheme': scheme } }] });
    }
    query.intent = intents;
    manifest.queries = queries;
    return c;
  });

/**
 * OneLocal Rider (OnLatur Rider) — Expo app config.
 * Native behaviour is configured here and through config plugins only
 * (Continuous Native Generation: never edit ios/ or android/ by hand).
 */
const appConfig = ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'OneLocal Rider',
  slug: 'onelocal-rider',
  // Bump all three for every release you install on phones (appVersionSource: local in eas.json).
  version: '1.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'onelocalrider',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.onelocal.rider',
    buildNumber: '2',
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'OneLocal Rider uses your location to find orders nearby and to guide you to the store and the customer during a delivery.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'OneLocal Rider shares your live location with the customer only while you are on an active delivery.',
      NSCameraUsageDescription:
        'The camera is used to scan pickup QR codes, capture delivery photo proof and upload KYC documents.',
      UIBackgroundModes: ['location'],
      // Lets Linking.canOpenURL() find Google Maps / Apple Maps for the navigation hand-off.
      LSApplicationQueriesSchemes: ['comgooglemaps', 'maps'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.onelocal.rider',
    versionCode: 2,
    adaptiveIcon: {
      backgroundColor: '#61FF00',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Added by expo-camera / the native template but never used by the rider app.
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW'],
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
        // Matches the first frame of the brand film (src/features/splash) so launch → film has no flash.
        backgroundColor: '#3FA841',
        image: './assets/images/splash-onelocal.png',
        imageWidth: 240,
      },
    ],
    'expo-video',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'OneLocal Rider uses your location to find orders nearby and to guide you during a delivery.',
        locationAlwaysAndWhenInUsePermission:
          'OneLocal Rider shares your live location with the customer only while you are on an active delivery.',
        isAndroidForegroundServiceEnabled: true,
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: true,
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
        recordAudioAndroid: false,
        microphonePermission: false,
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
  // EAS writes extra.eas.projectId into app.json on the first `eas build`; keep it.
  extra: {
    ...config.extra,
    eas: { ...(config.extra?.eas as Record<string, unknown> | undefined) },
  },
});

export default (ctx: ConfigContext): ExpoConfig => withNavigationQueries(appConfig(ctx));
