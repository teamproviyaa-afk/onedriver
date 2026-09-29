import { SPLASH, clipFinished, splashMode } from '@/features/splash/splashPlan';

describe('brand splash plan', () => {
  it('shows the whole film once, then only the logo reveal; reduced motion gets the static logo', () => {
    expect(splashMode({ seenBefore: false, reduceMotion: false })).toBe('full');
    expect(splashMode({ seenBefore: true, reduceMotion: false })).toBe('logo');
    expect(splashMode({ seenBefore: false, reduceMotion: true })).toBe('static');
    expect(splashMode({ seenBefore: true, reduceMotion: true })).toBe('static');
  });

  it('cuts the short clip when the logo is assembled; the full film runs to the end', () => {
    expect(clipFinished('logo', SPLASH.logoRevealEndSeconds - 0.1)).toBe(false);
    expect(clipFinished('logo', SPLASH.logoRevealEndSeconds)).toBe(true);
    expect(clipFinished(null, SPLASH.logoRevealEndSeconds + 0.5)).toBe(true);
    expect(clipFinished('full', 9.9)).toBe(false);
  });

});
