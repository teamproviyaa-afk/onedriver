import { getSupabase } from './supabaseClient';
import type { AuthProvider, AuthSession, OtpChallenge } from '@/providers/types';
import { ApiError } from '@/types';
import { OTP } from '@/domain/otp';

/** Supabase phone auth (MSG91 + DLT SMS provider configured server-side). */
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

  async sendOtp(phone: string): Promise<OtpChallenge> {
    const { error } = await this.client.auth.signInWithOtp({ phone: toE164(phone) });
    if (error) throw new ApiError({ code: 'unknown', detail: error.message });
    return { phone, expiresInSeconds: 300, resendAfterSeconds: OTP.resendSeconds };
  }

  async verifyOtp(phone: string, code: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.verifyOtp({ phone: toE164(phone), token: code, type: 'sms' });
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
