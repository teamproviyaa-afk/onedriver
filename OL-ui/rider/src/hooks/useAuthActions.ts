import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { ApiError } from '@/types';
import { getAuthProvider, getDataProvider, getDemoProvider } from '@/providers';
import type { OtpChallenge, SendOtpOptions } from '@/providers/types';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDeliveryStore } from '@/stores/useDeliveryStore';
import { useOnboardingStore, nextOnboardingRoute } from '@/stores/useOnboardingStore';
import { useOfflineQueueStore } from '@/stores/useOfflineQueueStore';
import { useRiderStore } from '@/stores/useRiderStore';
import { routeForJob } from '@/state-machine/deliveryStateMachine';

/** Phone + OTP sign-in / registration and sign-out. */
export const useAuthActions = () => {
  const qc = useQueryClient();
  const auth = useAuthStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = useCallback(
    async (phone: string, options?: SendOtpOptions): Promise<OtpChallenge | null> => {
      setBusy(true);
      setError(null);
      try {
        const c = await getAuthProvider().sendOtp(phone, options);
        auth.setPendingPhone(c.phone);
        auth.setOtpDelivery(c.delivery ?? null);
        void getDemoProvider()?.recordLoginOtp(c);
        return c;
      } catch (e) {
        setError(ApiError.is(e) ? e.detail : 'Could not send the OTP. Try again.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [auth],
  );

  /** Verifies the OTP and returns the route to continue to. */
  const verifyOtp = useCallback(
    async (code: string): Promise<{ ok: true; route: string } | { ok: false; detail: string; attemptsLeft?: number }> => {
      const phone = auth.pendingPhone;
      if (!phone) return { ok: false, detail: 'Enter your phone number first' };
      setBusy(true);
      setError(null);
      try {
        const session = await getAuthProvider().verifyOtp(phone, code);
        auth.setSession(session);
        const demo = getDemoProvider();
        if (demo) await demo.attachPhone(session.phone);
        const provider = getDataProvider();
        const pendingReg = auth.pendingRegistration;
        try {
          if (pendingReg) {
            await provider.register({ fullName: pendingReg.fullName, phone, referralCode: pendingReg.referralCode });
            useOnboardingStore.getState().patch({ fullName: pendingReg.fullName });
            auth.setPendingRegistration(null);
          }
          const me = await provider.getMe();
          useRiderStore.getState().setMe(me);
          void qc.invalidateQueries();
          if (me.rider.status === 'draft') return { ok: true, route: nextOnboardingRoute(useOnboardingStore.getState()) };
          if (me.rider.status !== 'approved') return { ok: true, route: '/status' };
          const job = await provider.getCurrentJob();
          if (job) {
            useDeliveryStore.getState().setJob(job);
            return { ok: true, route: routeForJob(job) };
          }
          return { ok: true, route: '/home' };
        } catch (e) {
          if (ApiError.is(e, 'not_enrolled')) return { ok: true, route: '/register' };
          throw e;
        }
      } catch (e) {
        const detail = ApiError.is(e) ? e.detail : 'Verification failed. Try again.';
        setError(detail);
        return { ok: false, detail, attemptsLeft: ApiError.is(e) ? (e.meta?.attemptsLeft as number | undefined) : undefined };
      } finally {
        setBusy(false);
      }
    },
    [auth, qc],
  );

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await getAuthProvider().signOut();
      const demo = getDemoProvider();
      if (demo) await demo.detachPhone();
    } finally {
      auth.reset();
      useRiderStore.getState().clear();
      useDeliveryStore.getState().clearJob();
      useDeliveryStore.getState().setOffer(null);
      useOnboardingStore.getState().reset();
      useOfflineQueueStore.getState().clearAll();
      qc.clear();
      setBusy(false);
    }
  }, [auth, qc]);

  return { busy, error, sendOtp, verifyOtp, signOut, clearError: () => setError(null) };
};
