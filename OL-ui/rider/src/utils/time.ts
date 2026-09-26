export const nowIso = (): string => new Date().toISOString();

export const addSeconds = (iso: string, seconds: number): string =>
  new Date(new Date(iso).getTime() + seconds * 1000).toISOString();

export const secondsUntil = (iso: string, now: number = Date.now()): number =>
  Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));

export const isSameLocalDay = (a: string | Date, b: string | Date): boolean => {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
};

export const startOfDay = (d: Date = new Date()): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
