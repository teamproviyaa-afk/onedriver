/**
 * Privacy-safe logger. Never logs customer PII (address, phone, name) — callers
 * must pass only ids and states. In production builds it is silent.
 */
const enabled = __DEV__;

export const log = {
  debug: (...args: unknown[]) => enabled && console.log('[rider]', ...args),
  info: (...args: unknown[]) => enabled && console.info('[rider]', ...args),
  warn: (...args: unknown[]) => enabled && console.warn('[rider]', ...args),
  error: (...args: unknown[]) => enabled && console.error('[rider]', ...args),
};
