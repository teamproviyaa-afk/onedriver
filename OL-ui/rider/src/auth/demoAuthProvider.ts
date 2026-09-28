import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AuthProvider, AuthSession, OtpChallenge, SendOtpOptions } from '@/providers/types';
import { ApiError } from '@/types';
import { OTP } from '@/domain/otp';
import { DEMO_OTP_CODE, DEMO_RETURNING_PHONE } from '@/demo/constants';
import { MESSAGING, demoHasWhatsApp, routeMessage } from '@/domain/messaging';

const SESSION_KEY = 'onelocal.rider.session.v1';

const secure = {
  async get(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return AsyncStorage.getItem(key);
    }
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },
  async del(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(key);
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      await AsyncStorage.removeItem(key);
    }
  },
};

/**
 * Deterministic phone + OTP flow for DATA_MODE=local_demo.
 * OTP is always 123456; the demo rider phone signs in as a returning approved rider,
 * any other 10-digit number registers as a new rider. The code goes on WhatsApp, or by SMS
 * for numbers without WhatsApp (9000000001 / 9000000002) and for a resend soon after a
 * WhatsApp send — the same rules as the server's send-SMS hook.
 */
export class DemoAuthProvider implements AuthProvider {
  readonly kind = 'demo' as const;
  private attempts = new Map<string, number>();
  private lastWhatsAppAt = new Map<string, number>();

  async restoreSession(): Promise<AuthSession | null> {
    const raw = await secure.get(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  }

  async sendOtp(phone: string, options: SendOtpOptions = {}): Promise<OtpChallenge> {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) throw new ApiError({ code: 'validation', detail: 'Enter a valid 10-digit mobile number' });
    this.attempts.set(digits, 0);
    const last = this.lastWhatsAppAt.get(digits);
    const route = routeMessage({
      policy: 'whatsapp_then_sms',
      hasWhatsApp: demoHasWhatsApp(digits),
      recentWhatsAppSend: !!options.resend && last !== undefined && Date.now() - last < MESSAGING.resendEscalationSeconds * 1000,
    });
    if (route.primary === 'whatsapp') this.lastWhatsAppAt.set(digits, Date.now());
    return {
      phone: digits,
      expiresInSeconds: 300,
      resendAfterSeconds: OTP.resendSeconds,
      delivery: { channel: route.primary === 'whatsapp' ? 'whatsapp' : 'sms', fallbackReason: route.fallbackReason },
      demoCode: DEMO_OTP_CODE,
    };
  }

  async verifyOtp(phone: string, code: string): Promise<AuthSession> {
    const digits = phone.replace(/\D/g, '');
    if (code !== DEMO_OTP_CODE) {
      const n = (this.attempts.get(digits) ?? 0) + 1;
      this.attempts.set(digits, n);
      throw new ApiError({ code: 'otp_invalid', detail: `Incorrect OTP. ${Math.max(0, 5 - n)} attempts left`, meta: { attemptsLeft: Math.max(0, 5 - n) } });
    }
    const session: AuthSession = {
      userId: `demo-user-${digits}`,
      phone: digits,
      accessToken: `demo-token-${digits}`,
      isNewUser: digits !== DEMO_RETURNING_PHONE,
    };
    await secure.set(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  async signOut(): Promise<void> {
    await secure.del(SESSION_KEY);
  }

  async getAccessToken(): Promise<string | null> {
    const s = await this.restoreSession();
    return s?.accessToken ?? null;
  }
}
