import NetInfo from '@react-native-community/netinfo';

import { useConnectivityStore } from '@/stores/useConnectivityStore';
import { processQueue } from './queueEngine';

let unsubscribe: (() => void) | null = null;

/** Watches device reachability; when the network returns the queue is replayed in order. */
export const startConnectivityMonitor = (): (() => void) => {
  if (unsubscribe) return unsubscribe;
  unsubscribe = NetInfo.addEventListener((state) => {
    const reachable = state.isInternetReachable ?? state.isConnected ?? true;
    const was = useConnectivityStore.getState().isConnected;
    useConnectivityStore.getState().setConnected(!!reachable);
    if (!was && reachable) void processQueue();
  });
  return () => {
    unsubscribe?.();
    unsubscribe = null;
  };
};
