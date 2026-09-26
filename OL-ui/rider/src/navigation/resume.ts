import { ApiError } from '@/types';
import { getAuthProvider, getDataProvider, getDemoProvider } from '@/providers';
import { routeForJob } from '@/state-machine/deliveryStateMachine';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDeliveryStore } from '@/stores/useDeliveryStore';
import { useOnboardingStore, nextOnboardingRoute } from '@/stores/useOnboardingStore';
import { useRiderStore } from '@/stores/useRiderStore';
import { log } from '@/utils/logger';

/**
 * Decides where the app should open (cold start or resume after being killed):
 *   1. restore auth  2. load /rider/me  3. fetch the active job / offer
 *   4. compare with the local copy (server wins)  5. return the route.
 */
export const resolveEntryRoute = async (): Promise<string> => {
  const auth = useAuthStore.getState();
  const authProvider = getAuthProvider();
  let session = auth.session;
  if (!session) {
    session = await authProvider.restoreSession();
    auth.setSession(session);
  }
  if (!session) {
    if (!auth.hasSeenIntro) return '/intro';
    if (!auth.locationPermissionAsked) return '/permissions/location';
    return '/sign-in';
  }
  const demo = getDemoProvider();
  if (demo) await demo.attachPhone(session.phone);
  const provider = getDataProvider();
  try {
    const me = await provider.getMe();
    useRiderStore.getState().setMe(me);
    const status = me.rider.status;
    if (status === 'draft') return nextOnboardingRoute(useOnboardingStore.getState());
    if (status !== 'approved') return '/status';
    const job = await provider.getCurrentJob();
    if (job) {
      useDeliveryStore.getState().setJob(job); // server state wins over any stale local copy
      return routeForJob(job);
    }
    useDeliveryStore.getState().clearJob();
    const offer = await provider.getCurrentOffer();
    if (offer) {
      useDeliveryStore.getState().setOffer(offer);
      return `/offer/${offer.jobId}`;
    }
    return '/home';
  } catch (e) {
    if (ApiError.is(e, 'not_enrolled')) {
      const draft = useOnboardingStore.getState();
      return draft.completed.length ? nextOnboardingRoute(draft) : '/register';
    }
    if (ApiError.is(e, 'unauthorized')) {
      await authProvider.signOut();
      auth.reset();
      return '/sign-in';
    }
    log.warn('resume failed, falling back to home', e);
    // Offline: rely on last known state.
    const last = useRiderStore.getState();
    if (last.lastStatus && last.lastStatus !== 'approved') return last.lastStatus === 'draft' ? nextOnboardingRoute(useOnboardingStore.getState()) : '/status';
    const localJob = useDeliveryStore.getState().job;
    return localJob ? routeForJob(localJob) : '/home';
  }
};
