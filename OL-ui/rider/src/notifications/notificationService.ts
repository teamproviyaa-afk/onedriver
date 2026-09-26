import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { Offer, RiderNotification } from '@/types';
import { getDataProvider } from '@/providers';
import { log } from '@/utils/logger';

export const OFFER_CHANNEL = 'offers';
export const DEFAULT_CHANNEL = 'default';

let handlerSet = false;

/** Foreground presentation: offers must ring even when the app is open. */
export const configureNotificationHandler = () => {
  if (handlerSet) return;
  handlerSet = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    log.warn('notification handler unavailable', e);
  }
};

export const setupNotificationChannels = async () => {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(OFFER_CHANNEL, {
      name: 'Delivery offers',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#76EC00',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
    await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL, {
      name: 'OneLocal Rider',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#76EC00',
    });
  } catch (e) {
    log.warn('channel setup failed', e);
  }
};

export const getNotificationPermission = async (): Promise<'granted' | 'denied' | 'undetermined'> => {
  try {
    const s = await Notifications.getPermissionsAsync();
    if (s.granted) return 'granted';
    return s.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'undetermined';
  }
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    const s = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
};

/** Registers the Expo push token with the server (PUT /rider/push-token). Skips gracefully in Expo Go. */
export const registerPushToken = async (): Promise<string | null> => {
  try {
    if (!Device.isDevice) return null;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      log.debug('no EAS projectId — push token registration skipped');
      return null;
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await getDataProvider().setPushToken(token, Platform.OS);
    return token;
  } catch (e) {
    log.warn('push token registration failed', e);
    return null;
  }
};

const present = async (title: string, body: string, data: Record<string, unknown>, channelId = DEFAULT_CHANNEL) => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: 'default', ...(Platform.OS === 'android' ? { channelId } : {}) },
      trigger: null,
    });
  } catch (e) {
    log.warn('local notification failed', e);
  }
};

/** Offer alert — never includes the customer's address or phone (privacy). */
export const presentOfferNotification = (offer: Offer) =>
  present(
    offer.mode === 'auto' ? `Job auto-accepted · ${offer.job.orderRef}` : `New delivery · est. ₹${offer.payoutEstimate}`,
    `${offer.pickup.name} → ${offer.drop.area} · ${offer.pickup.distanceKm.toFixed(1)} km to pickup`,
    { deepLink: `/offer/${offer.jobId}`, kind: 'new_delivery' },
    OFFER_CHANNEL,
  );

export const presentRiderNotification = (n: RiderNotification) => present(n.title, n.body, { deepLink: n.deepLink ?? '/alerts', kind: n.kind });

export const addResponseListener = (onDeepLink: (link: string) => void) => {
  try {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const link = resp.notification.request.content.data?.deepLink;
      if (typeof link === 'string') onDeepLink(link);
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
};
