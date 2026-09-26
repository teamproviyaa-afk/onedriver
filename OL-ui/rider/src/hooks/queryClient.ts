import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (count, err) => {
        if (ApiError.is(err) && err.code !== 'network' && (err.status ?? 500) < 500) return false;
        return count < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

export const queryKeys = {
  me: ['me'] as const,
  status: ['status'] as const,
  zones: (cityId: string) => ['zones', cityId] as const,
  currentOffer: ['offer', 'current'] as const,
  currentJob: ['job', 'current'] as const,
  job: (id: string) => ['job', id] as const,
  jobDetail: (id: string) => ['job', id, 'detail'] as const,
  earnings: (range: string) => ['earnings', range] as const,
  jobEarnings: (id: string) => ['earnings', 'job', id] as const,
  history: ['jobs', 'history'] as const,
  cash: ['cash'] as const,
  notifications: ['notifications'] as const,
};
