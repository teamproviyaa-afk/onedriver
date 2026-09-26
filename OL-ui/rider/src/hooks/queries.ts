import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { getDataProvider } from '@/providers';
import { useDeliveryStore } from '@/stores/useDeliveryStore';
import { useEarningsStore } from '@/stores/useEarningsStore';
import { useRiderStore } from '@/stores/useRiderStore';
import { useConnectivityStore, selectEffectiveOnline } from '@/stores/useConnectivityStore';
import { isTerminal } from '@/state-machine/deliveryStateMachine';
import { queryKeys } from './queryClient';

const provider = () => getDataProvider();

/** GET /rider/me — mirrored into the rider + earnings stores for offline display. */
export const useMe = (enabled = true) => {
  const setMe = useRiderStore((s) => s.setMe);
  const setSummaries = useEarningsStore((s) => s.setSummaries);
  const q = useQuery({ queryKey: queryKeys.me, queryFn: () => provider().getMe(), enabled, staleTime: 5_000 });
  useEffect(() => {
    if (q.data) {
      setMe(q.data);
      setSummaries(q.data.today, q.data.yesterday);
    }
  }, [q.data, setMe, setSummaries]);
  return q;
};

export const useStatus = (enabled = true, pollMs: number | false = 4000) =>
  useQuery({ queryKey: queryKeys.status, queryFn: () => provider().getStatus(), enabled, refetchInterval: pollMs, staleTime: 0 });

export const useZones = (cityId: string | undefined) =>
  useQuery({ queryKey: queryKeys.zones(cityId ?? ''), queryFn: () => provider().listZones(cityId!), enabled: !!cityId, staleTime: 60 * 60 * 1000 });

/** Polls the current offer while online without a job (Realtime replaces polling in production). */
export const useCurrentOffer = (enabled: boolean) => {
  const setOffer = useDeliveryStore((s) => s.setOffer);
  const online = useConnectivityStore(selectEffectiveOnline);
  const q = useQuery({
    queryKey: queryKeys.currentOffer,
    queryFn: () => provider().getCurrentOffer(),
    enabled: enabled && online,
    refetchInterval: enabled && online ? 2000 : false,
    staleTime: 0,
  });
  useEffect(() => {
    if (q.isSuccess) setOffer(q.data ?? null);
  }, [q.isSuccess, q.data, setOffer]);
  return q;
};

/** The active job: server copy wins unless a queued offline step is pending. */
export const useCurrentJob = (enabled = true) => {
  const setJob = useDeliveryStore((s) => s.setJob);
  const pendingSync = useDeliveryStore((s) => s.pendingSync);
  const online = useConnectivityStore(selectEffectiveOnline);
  const q = useQuery({
    queryKey: queryKeys.currentJob,
    queryFn: () => provider().getCurrentJob(),
    enabled: enabled && online,
    refetchInterval: enabled && online && !pendingSync ? 6000 : false,
    staleTime: 0,
  });
  useEffect(() => {
    if (!q.isSuccess || pendingSync) return;
    const local = useDeliveryStore.getState().job;
    const server = q.data ?? null;
    if (!server) {
      if (local && !isTerminal(local.state)) return; // keep the local copy while the server catches up offline
      if (local) setJob(null);
      return;
    }
    if (!local || local.id !== server.id || local.version !== server.version || local.state !== server.state) setJob(server);
  }, [q.isSuccess, q.data, pendingSync, setJob]);
  return q;
};

export const useJob = (id: string | undefined) => {
  const local = useDeliveryStore((s) => s.job);
  const q = useQuery({ queryKey: queryKeys.job(id ?? ''), queryFn: () => provider().getJob(id!), enabled: !!id && (!local || local.id !== id), staleTime: 5_000 });
  const job = local && local.id === id ? local : (q.data ?? null);
  return { ...q, job };
};

export const useJobDetail = (id: string | undefined) =>
  useQuery({ queryKey: queryKeys.jobDetail(id ?? ''), queryFn: () => provider().getJobDetail(id!), enabled: !!id });

export const useEarnings = (range: 'today' | 'week' | 'month') =>
  useQuery({ queryKey: queryKeys.earnings(range), queryFn: () => provider().getEarnings(range), staleTime: 15_000 });

export const useJobEarnings = (id: string | undefined) =>
  useQuery({ queryKey: queryKeys.jobEarnings(id ?? ''), queryFn: () => provider().getJobEarnings(id!), enabled: !!id });

export const useJobHistory = () => useQuery({ queryKey: queryKeys.history, queryFn: () => provider().listJobs(), staleTime: 15_000 });

export const useCash = () => useQuery({ queryKey: queryKeys.cash, queryFn: () => provider().getCash(), staleTime: 5_000 });

export const useNotifications = () =>
  useQuery({ queryKey: queryKeys.notifications, queryFn: () => provider().listNotifications(), staleTime: 5_000, refetchInterval: 15_000 });

export const useInvalidateAll = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
};
