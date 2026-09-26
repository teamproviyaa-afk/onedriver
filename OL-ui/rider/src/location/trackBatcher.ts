import type { TrackPoint } from '@/types';
import { TRACKING } from '@/domain/tracking';
import { buildQueueItem, enqueue } from '@/offline/queueEngine';

/** Batches job track points and ships them every 10 s (≤ 60 points) via the offline queue. */
export class TrackBatcher {
  private buffer: TrackPoint[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private jobId: string | null = null;

  start(jobId: string) {
    if (this.jobId === jobId && this.timer) return;
    this.stop();
    this.jobId = jobId;
    this.timer = setInterval(() => this.flush(), TRACKING.batchFlushSeconds * 1000);
  }

  push(p: TrackPoint) {
    if (!this.jobId) return;
    this.buffer.push(p);
    if (this.buffer.length >= TRACKING.batchMaxPoints) this.flush();
  }

  flush() {
    if (!this.jobId || this.buffer.length === 0) return;
    const points = this.buffer.splice(0, TRACKING.batchMaxPoints);
    enqueue(buildQueueItem('track', this.jobId, 'batch', { points }, points[0]!.recordedAt));
  }

  stop() {
    this.flush();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.jobId = null;
  }
}
