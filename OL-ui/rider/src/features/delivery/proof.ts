import { router } from 'expo-router';

import { toast } from '@/components/ui';
import type { Job, ProofInput, ProofMethod, ProofResult } from '@/types';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * Proof payload as a screen builds it (the hook adds version + position). Distributive so
 * `code` / `assetId` stay attached to their method — plain `Omit` on the union drops them.
 */
export type ProofSubmission = DistributiveOmit<ProofInput, 'version' | 'lat' | 'lng' | 'accuracyM'>;

/** Methods the server accepts right now: the OTP lock always unlocks the photo fallback. */
export const allowedProofMethods = (job: Pick<Job, 'proofMethods' | 'otpLocked'>): ProofMethod[] =>
  job.otpLocked ? Array.from(new Set<ProofMethod>([...job.proofMethods.filter((m) => m !== 'otp'), 'photo'])) : [...job.proofMethods];

/** Which method the confirmation screen preselects (spec: OTP; pick & drop → signature; contactless → photo; locked → photo). */
export const defaultProofMethod = (job: Pick<Job, 'proofMethods' | 'otpLocked' | 'category' | 'drop'>): ProofMethod | null => {
  const allowed = allowedProofMethods(job);
  const contactless = /contactless/i.test(job.drop.instructions ?? '');
  const preferred: ProofMethod[] = job.otpLocked ? ['photo', 'signature'] : job.category === 'pick_drop' ? ['signature', 'otp', 'photo'] : contactless ? ['photo', 'otp', 'signature'] : ['otp', 'photo', 'signature'];
  return preferred.find((m) => allowed.includes(m)) ?? allowed[0] ?? null;
};

/** Common landing after any proof submission: offline results are queued, everything ends on the success screen. */
export const finishProof = (jobId: string, res: ProofResult | { queued: true }): void => {
  if ('queued' in res) toast.show('Saved offline — will sync');
  router.replace(`/job/${jobId}/done` as never);
};
