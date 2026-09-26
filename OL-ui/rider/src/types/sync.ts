import type { IsoDate } from './common';

/** Global connectivity states shown by the banner (Figma connectivity-states). */
export type ConnectivityState = 'online_heartbeat' | 'syncing' | 'offline' | 'sync_error';

export type QueueEntityType =
  | 'availability'
  | 'job'
  | 'pickup_verify'
  | 'track'
  | 'proof'
  | 'exception'
  | 'heartbeat'
  | 'sos'
  | 'offer'
  | 'notification';

export type QueueStatus = 'pending' | 'in_flight' | 'done' | 'failed' | 'conflict';

export interface QueueItem<TPayload = unknown> {
  id: string;
  entityType: QueueEntityType;
  entityId: string;
  action: string;
  payload: TPayload;
  idempotencyKey: string;
  /** When the user performed the action (preserved on replay). */
  recordedAt: IsoDate;
  createdAt: IsoDate;
  retryCount: number;
  status: QueueStatus;
  lastError?: string;
}

export interface SyncReport {
  processed: number;
  succeeded: number;
  failed: number;
  conflicts: number;
}
