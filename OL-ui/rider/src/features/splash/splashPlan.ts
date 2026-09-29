/**
 * Brand splash (OneLocal video): the full film once, on first launch, with Skip; afterwards only the
 * logo reveal so riders opening the app many times a day — or resuming a delivery — are not held up.
 */
export const SPLASH = {
  /** Background of the video's first frame; also the native launch screen colour (app.config.ts). */
  background: '#3FA841',
  /** The logo is assembled by here; the phone mock-up starts right after. */
  logoRevealEndSeconds: 2.3,
  /** The Skip button appears after this much of the film. */
  skipAfterSeconds: 1,
  /** Static logo (reduced motion / video unavailable) stays at least this long. */
  staticMinMs: 900,
  /** Give up on the video (static logo instead) if playback has not started by then. */
  loadTimeoutMs: 4000,
  /** Never hold the app longer than this, whatever the player does. */
  maxMs: 12000,
  /** Set once the full film has been seen on this device. */
  seenKey: 'onelocal.splash.v1',
} as const;

/** full — the whole film with Skip; logo — the first seconds only; static — the logo image, no motion. */
export type SplashMode = 'full' | 'logo' | 'static';

export const splashMode = (opts: { seenBefore: boolean; reduceMotion: boolean }): SplashMode => (opts.reduceMotion ? 'static' : opts.seenBefore ? 'logo' : 'full');

/** True when playback at `currentTime` has shown everything this mode shows. Unknown mode is treated as "logo". */
export const clipFinished = (mode: SplashMode | null, currentTime: number): boolean => mode !== 'full' && currentTime >= SPLASH.logoRevealEndSeconds;
