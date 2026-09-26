import type { LatLng, RiderPosition } from '@/types';
import { bearing, haversineM, offsetM } from '@/domain/geo';

type Listener = (p: RiderPosition) => void;

/**
 * Development GPS: moves the rider toward a target at a demo speed so the whole
 * delivery journey (geofences included) can be tested anywhere in the world.
 * Used only when DATA_MODE=local_demo and "Use device GPS" is off.
 */
export class DemoRouteSimulator {
  private position: LatLng;
  private target: LatLng | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<Listener>();
  speedMps = 22; // ≈ 80 km/h — demo only, so trips finish in well under a minute
  tickMs = 1000;

  constructor(start: LatLng) {
    this.position = start;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  get current(): LatLng {
    return this.position;
  }

  setTarget(target: LatLng | null) {
    this.target = target;
  }

  teleport(p: LatLng) {
    this.position = p;
    this.emit(0);
  }

  moveTo(p: LatLng) {
    this.position = p;
  }

  start() {
    if (this.timer) return;
    this.emit(0);
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick() {
    let speed = 0;
    if (this.target) {
      const d = haversineM(this.position, this.target);
      if (d > 12) {
        const step = Math.min(d - 8, this.speedMps * (this.tickMs / 1000));
        const brg = (bearing(this.position, this.target) * Math.PI) / 180;
        this.position = offsetM(this.position, Math.cos(brg) * step, Math.sin(brg) * step);
        speed = step / (this.tickMs / 1000);
      }
    }
    // Small jitter so stationary points still look like GPS.
    const jitter = offsetM(this.position, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
    this.emit(speed, jitter);
  }

  private emit(speed: number, at: LatLng = this.position) {
    const p: RiderPosition = {
      lat: at.lat,
      lng: at.lng,
      accuracyM: 6 + Math.round(Math.random() * 10),
      speed,
      heading: this.target ? bearing(this.position, this.target) : undefined,
      recordedAt: new Date().toISOString(),
      battery: 78,
    };
    for (const l of this.listeners) l(p);
  }
}
