/** Deterministic-enough id helpers that work without native crypto. */
let counter = 0;

export const newId = (prefix = 'id'): string => {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
};

export const newIdempotencyKey = (entityType: string, entityId: string, action: string): string =>
  `${entityType}:${entityId}:${action}:${newId('k')}`;
