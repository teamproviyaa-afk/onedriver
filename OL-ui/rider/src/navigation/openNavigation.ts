import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import type { LatLng } from '@/types';
import { navigationAttempts } from '@/domain/navigation';
import { log } from '@/utils/logger';

/**
 * Opens turn-by-turn navigation on COORDINATES (spec §3.3):
 * Android google.navigation (two-wheeler → driving), iOS Google Maps → Apple Maps, then web.
 */
export const openNavigation = async (dest: LatLng, label?: string): Promise<boolean> => {
  const attempts = navigationAttempts(Platform.OS, dest, label);
  if (Platform.OS === 'web') {
    // Keep the app tab alive: open Google Maps directions in a new tab.
    try {
      const w = typeof window !== 'undefined' ? window.open(attempts[attempts.length - 1]!, '_blank', 'noopener,noreferrer') : null;
      if (w) return true;
    } catch (e) {
      log.debug('window.open failed', e);
    }
  }
  for (const url of attempts) {
    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
        return true;
      }
    } catch (e) {
      log.debug('nav attempt failed', url, e);
    }
  }
  // Last resort: web URL always opens in a browser.
  try {
    await Linking.openURL(attempts[attempts.length - 1]!);
    return true;
  } catch {
    return false;
  }
};

export const openDialer = async (number: string): Promise<boolean> => {
  const url = `tel:${number.replace(/\s/g, '')}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
};
