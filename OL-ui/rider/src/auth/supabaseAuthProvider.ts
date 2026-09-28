import { getSupabase } from './supabaseClient';
import type { AuthProvider, AuthSession, OtpChallenge, SendOtpOptions } from '@/providers/types';
import { ApiError } from '@/types';
import { OTP } from '@/domain/otp';

/**
 * Supabase phone auth. The code is delivered by the `notify` Edge Function through the Auth
 * "Send SMS" hook: WhatsApp first, SMS when the number is not on WhatsApp, and SMS for a resend
 * shortly after a WhatsApp send. The app cannot see which channel the hook used.
 */
export class SupabaseAuthProvider implements AuthProvider {
  readonly kind = 'supabase' as const;

  private get client() {
    const c = getSupabase();
    if (!c) throw new ApiError({ code: 'unknown', detail: 'Supabase is not configured' });
    return c;
  }

  async restoreSession(): Promise<AuthSession | null> {
    const { data } = await this.client.auth.getSession();
    const s = data.session;
    if (!s?.user) return null;
    return { userId: s.user.id, phone: s.user.phone ?? '', accessToken: s.access_token, refreshToken: s.refresh_token, expiresAt: s.expires_at ? new Date(s.expires_at * 1000).toISOString() : undefined };
  }

  async sendOtp(phone: string, _options: SendOtpOptions = {}): Promise<OtpChallenge> {
    const { error } = await this.client.auth.signInWithOtp({ phone: toE164(phone) });
    if (error) {
      const limited = error.status === 429 || /rate limit|too many/i.test(error.message);
      if (limited) throw new ApiError({ code: 'rate_limited', detail: 'Too many codes requested. Wait a few minutes and try again.', status: 429 });
      if (isNetworkError(error)) throw new ApiError({ code: 'network', detail: "Couldn't reach the server. Check your internet connection and try again." });
      throw new ApiError({ code: 'unknown', detail: error.message, status: error.status });
    }
    return { phone, expiresInSeconds: 300, resendAfterSeconds: OTP.resendSeconds, delivery: { channel: 'unknown' } };
  }

  async verifyOtp(phone: string, code: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.verifyOtp({ phone: toE164(phone), token: code, type: 'sms' });
    if (error && isNetworkError(error)) throw new ApiError({ code: 'network', detail: "Couldn't reach the server. Check your internet connection and try again." });
    if (error || !data.session) throw new ApiError({ code: 'otp_invalid', detail: error?.message ?? 'Invalid OTP' });
    const s = data.session;
    return { userId: s.user.id, phone, accessToken: s.access_token, refreshToken: s.refresh_token, isNewUser: !!data.user && data.user.created_at === data.user.last_sign_in_at };
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async getAccessToken(): Promise<string | null> {
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }
}

export const toE164 = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
};

/** supabase-js reports a failed request (offline, blocked) as AuthRetryableFetchError / "Failed to fetch". */
const isNetworkError = (error: { name?: string; message: string; status?: number }): boolean =>
  error.name === 'AuthRetryableFetchError' || error.status === 0 || /failed to fetch|network request failed|load failed/i.test(error.message);
