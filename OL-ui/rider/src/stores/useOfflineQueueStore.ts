import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { QueueItem, QueueStatus } from '@/types';
import { zustandStorage } from './storage';

interface QueueState {
  items: QueueItem[];
  processing: boolean;
  enqueue: (item: QueueItem) => void;
  update: (id: string, patch: Partial<QueueItem>) => void;
  remove: (id: string) => void;
  setProcessing: (v: boolean) => void;
  clearDone: () => void;
  clearAll: () => void;
}

/** Persisted FIFO of state-changing operations awaiting the server (spec §8 offline). */
export const useOfflineQueueStore = create<QueueState>()(
  persist(
    (set) => ({
      items: [],
      processing: false,
      enqueue: (item) => set((s) => ({ items: [...s.items, item] })),
      update: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      setProcessing: (processing) => set({ processing }),
      clearDone: () => set((s) => ({ items: s.items.filter((i) => i.status !== 'done') })),
      clearAll: () => set({ items: [] }),
    }),
    { name: 'onelocal.rider.queue.v1', storage: zustandStorage, partialize: (s) => ({ items: s.items }) },
  ),
);

export const selectPendingItems = (s: QueueState) => s.items.filter((i) => i.status === 'pending' || i.status === 'failed');
export const countByStatus = (items: QueueItem[], status: QueueStatus) => items.filter((i) => i.status === status).length;
