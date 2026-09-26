import { navigationAttempts, navigationUrls } from '@/domain/navigation';
import { cadenceFor, trackingModeFor } from '@/domain/tracking';
import { formatINR, formatCountdown } from '@/utils/format';

describe('navigation handoff', () => {
  it('opens coordinates, never address text, with platform fallbacks', () => {
    const u = navigationUrls({ lat: 18.4211, lng: 76.5793 });
    expect(u.androidTwoWheeler).toBe('google.navigation:q=18.4211,76.5793&mode=l');
    expect(u.androidDriving).toBe('google.navigation:q=18.4211,76.5793&mode=d');
    expect(u.iosGoogleMaps).toBe('comgooglemaps://?daddr=18.4211,76.5793&directionsmode=driving');
    expect(u.iosAppleMaps.startsWith('maps://?daddr=18.4211,76.5793')).toBe(true);
    expect(navigationAttempts('android', { lat: 1, lng: 2 })).toHaveLength(3);
    expect(navigationAttempts('ios', { lat: 1, lng: 2 })[1]).toContain('maps://');
    expect(navigationAttempts('web', { lat: 1, lng: 2 })[0]).toContain('google.com/maps/dir');
  });
});

describe('tracking cadence', () => {
  it('follows the R8 rules', () => {
    expect(trackingModeFor(false, false)).toBe('off');
    expect(trackingModeFor(true, false)).toBe('heartbeat');
    expect(trackingModeFor(true, true, 5)).toBe('job_moving');
    expect(trackingModeFor(true, true, 0)).toBe('job_stationary');
    expect(cadenceFor('heartbeat').timeIntervalMs).toBe(30000);
    expect(cadenceFor('job_moving')).toEqual({ timeIntervalMs: 5000, distanceIntervalM: 25 });
    expect(cadenceFor('job_stationary').timeIntervalMs).toBe(30000);
  });
});

describe('formatting', () => {
  it('formats INR with Indian grouping', () => {
    expect(formatINR(780)).toBe('₹780');
    expect(formatINR(3420)).toBe('₹3,420');
    expect(formatINR(142.5)).toBe('₹142.50');
    expect(formatINR(1234567)).toBe('₹12,34,567');
    expect(formatCountdown(95)).toBe('01:35');
  });
});
