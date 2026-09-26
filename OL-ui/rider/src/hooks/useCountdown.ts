import { useEffect, useState } from 'react';

import { secondsUntil } from '@/utils/time';

/** Seconds remaining until an ISO timestamp, ticking every second. */
export const useCountdown = (expiresAt: string | undefined | null): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return expiresAt ? secondsUntil(expiresAt, now) : 0;
};

/** Seconds elapsed since an ISO timestamp. */
export const useElapsed = (startedAt: string | undefined | null): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0;
};
