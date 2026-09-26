/** Delivery OTP rules (spec §4.1 proof / §7.3). */
export const OTP = {
  deliveryLength: 4,
  loginLength: 6,
  maxAttempts: 5,
  resendSeconds: 30,
} as const;

export const attemptsLeft = (attempts: number): number => Math.max(0, OTP.maxAttempts - attempts);
export const isLocked = (attempts: number): boolean => attempts >= OTP.maxAttempts;
