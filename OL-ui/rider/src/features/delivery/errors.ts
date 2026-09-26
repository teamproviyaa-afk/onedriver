import { ApiError } from '@/types';

/** Human-readable message for any thrown value (ApiError detail first). */
export const errorMessage = (e: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (ApiError.is(e)) return e.detail || fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
};
