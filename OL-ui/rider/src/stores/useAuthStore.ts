import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AuthSession } from '@/providers/types';
import { zustandStorage } from './storage';

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  hasSeenIntro: boolean;
  locationPermissionAsked: boolean;
  notificationPermissionAsked: boolean;
  pendingPhone: string | null;
  pendingRegistration: { fullName: string; referralCode?: string } | null;
  setSession: (session: AuthSession | null) => void;
  setStatus: (status: AuthStatus) => void;
  markIntroSeen: () => void;
  markLocationAsked: () => void;
  markNotificationAsked: () => void;
  setPendingPhone: (phone: string | null) => void;
  setPendingRegistration: (r: AuthState['pendingRegistration']) => void;
  reset: () => void;
}

/**
 * Auth/client state. Tokens live in the auth provider (SecureStore / supabase-js);
 * this store only mirrors the session for routing and the phone for display.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      status: 'loading',
      session: null,
      hasSeenIntro: false,
      locationPermissionAsked: false,
      notificationPermissionAsked: false,
      pendingPhone: null,
      pendingRegistration: null,
      setSession: (session) => set({ session, status: session ? 'signed_in' : 'signed_out' }),
      setStatus: (status) => set({ status }),
      markIntroSeen: () => set({ hasSeenIntro: true }),
      markLocationAsked: () => set({ locationPermissionAsked: true }),
      markNotificationAsked: () => set({ notificationPermissionAsked: true }),
      setPendingPhone: (pendingPhone) => set({ pendingPhone }),
      setPendingRegistration: (pendingRegistration) => set({ pendingRegistration }),
      reset: () => set({ session: null, status: 'signed_out', pendingPhone: null, pendingRegistration: null }),
    }),
    {
      name: 'onelocal.rider.auth.v1',
      storage: zustandStorage,
      partialize: (s) => ({
        hasSeenIntro: s.hasSeenIntro,
        locationPermissionAsked: s.locationPermissionAsked,
        notificationPermissionAsked: s.notificationPermissionAsked,
      }),
    },
  ),
);
