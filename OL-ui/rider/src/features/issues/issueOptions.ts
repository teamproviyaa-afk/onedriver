import type { ExceptionKind } from '@/types';

export interface IssueOption {
  kind: Extract<ExceptionKind, 'unavailable' | 'address' | 'refused' | 'cannot_access' | 'safety' | 'other'>;
  /** Verbatim label from the Figma delivery-failed frame. */
  label: string;
  /** Safety issue is flagged red (bullet + label) in the design. */
  critical?: boolean;
}

/** Reasons a delivery could not be completed, in Figma order. */
export const ISSUE_OPTIONS: readonly IssueOption[] = [
  { kind: 'unavailable', label: 'Customer unavailable' },
  { kind: 'address', label: 'Wrong address' },
  { kind: 'refused', label: 'Customer refused' },
  { kind: 'cannot_access', label: 'Cannot access location' },
  { kind: 'safety', label: 'Safety issue', critical: true },
  { kind: 'other', label: 'Other' },
] as const;

/** Rider helpline (toll-free) used by the safety sheet. */
export const RIDER_HELPLINE = '18000000000';

/** Coming-soon copy for the customer chat (V1 decision). */
export const CHAT_COMING_SOON = {
  title: 'Chat is coming soon',
  body: 'In-app chat with customers is not available yet. Call the customer for now.',
} as const;
