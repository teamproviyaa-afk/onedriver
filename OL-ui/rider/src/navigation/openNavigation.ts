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
    // Web: open Google Maps directions in a NEW tab and never replace the app tab
    // (a popup blocker may swallow it, which is preferable to losing the app).
    const url = attempts[attempts.length - 1]!;
    try {
      if (typeof window !== 'undefined') {
        const w = window.open(url, '_blank', 'noopener,noreferrer');
        if (w) return true;
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
      }
    } catch (e) {
      log.debug('web navigation open failed', e);
    }
    return false;
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
