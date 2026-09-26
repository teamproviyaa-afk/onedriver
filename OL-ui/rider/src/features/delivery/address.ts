import type { Job } from '@/types';
import { canSeeDropAddress } from '@/domain/privacy';

/**
 * Drop line for the delivery screens ("Apt 4B, Shanti Enclave, Sector 15"): flat / floor then the
 * street once the pickup is verified; only the area before that (privacy rule, spec §5.4).
 */
export const dropAddressLine = (job: Pick<Job, 'state' | 'drop'>): string => {
  if (!canSeeDropAddress(job.state)) return job.drop.area;
  return [job.drop.flatFloor, job.drop.address].filter(Boolean).join(', ') || job.drop.area;
};
