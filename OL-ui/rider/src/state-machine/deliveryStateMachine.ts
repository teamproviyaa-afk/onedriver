/**
 * OneLocal Dispatch State Engine — the single source of truth for a delivery.
 *
 *   01 available · 02 offered · 03 accepted · 04 to_pickup · 05 at_pickup
 *   06 pickup_verified · 07 picked_up · 08 to_drop · 09 at_drop · 10 handover
 *   11 proof · 12 delivered
 *
 * Terminal: delivered, failed, returned, cancelled.
 * Steps only move forward; every transition carries the expected `version`
 * so two taps can never double-advance (spec §4.1, R5).
 *
 * No UI screen may invent a transition: screens call `advance()` /
 * `canAdvance()` and route with `routeForJob()`.
 */
import type { ExceptionKind, Job, JobState, RiderFlowState, TerminalJobState } from '@/types';

export const FLOW_STATES: readonly RiderFlowState[] = [
  'available',
  'offered',
  'accepted',
  'to_pickup',
  'at_pickup',
  'pickup_verified',
  'picked_up',
  'to_drop',
  'at_drop',
  'handover',
  'proof',
  'delivered',
] as const;

export const TERMINAL_STATES: readonly TerminalJobState[] = ['delivered', 'failed', 'returned', 'cancelled'] as const;

/** Ordinal number of a state in the 12-step engine (01…12). */
export const stateOrdinal = (state: RiderFlowState | JobState): number => {
  const idx = FLOW_STATES.indexOf(state as RiderFlowState);
  return idx === -1 ? -1 : idx + 1;
};

/** Human labels taken verbatim from the Figma rider-state-machine frame. */
export const STATE_LABELS: Record<RiderFlowState, { title: string; subtitle: string; exception: string }> = {
  available: { title: 'AVAILABLE', subtitle: 'Online & tracing location', exception: 'Offline/Break' },
  offered: { title: 'OFFERED', subtitle: 'Task dispatch pop-up', exception: 'Auto-Reject/Timeout' },
  accepted: { title: 'ACCEPTED', subtitle: 'Route details locked', exception: 'Re-assign Requisition' },
  to_pickup: { title: 'TO PICKUP', subtitle: 'Travelling to merchant', exception: 'Vehicle Breakdown' },
  at_pickup: { title: 'AT PICKUP', subtitle: 'Waiting for dispatch', exception: 'Order Not Ready' },
  pickup_verified: { title: 'PICKUP VERIFIED', subtitle: 'Items / barcode checked', exception: 'Mismatch / Incomplete' },
  picked_up: { title: 'PICKED UP', subtitle: 'Package secured on board', exception: 'Safety Incident' },
  to_drop: { title: 'TO DROP', subtitle: 'Travelling to customer', exception: 'Flat Tyre / Accident' },
  at_drop: { title: 'AT DROP', subtitle: 'At customer location', exception: 'Unavailable / Wrong Address' },
  handover: { title: 'HANDOVER', subtitle: 'Handing over', exception: 'Rejected by Customer' },
  proof: { title: 'PROOF', subtitle: 'OTP / photo / signature', exception: 'Failed Verification' },
  delivered: { title: 'DELIVERED', subtitle: 'Funds / cash recorded', exception: '—' },
};

/** Forward transitions only. Exceptions are handled by `EXCEPTIONS`. */
const TRANSITIONS: Readonly<Record<JobState, readonly JobState[]>> = {
  created: ['offered', 'cancelled'],
  offered: ['accepted', 'offered', 'cancelled'], // offered → offered = re-offer to next rider after timeout
  accepted: ['to_pickup', 'offered', 'cancelled'], // accepted → offered = re-assign requisition
  to_pickup: ['at_pickup', 'failed', 'cancelled'],
  at_pickup: ['pickup_verified', 'failed', 'cancelled'],
  pickup_verified: ['picked_up', 'failed', 'cancelled'],
  picked_up: ['to_drop', 'failed', 'returned'],
  to_drop: ['at_drop', 'failed', 'returned'],
  at_drop: ['handover', 'failed', 'returned'],
  handover: ['proof', 'returned', 'failed'],
  proof: ['delivered', 'returned', 'failed'],
  delivered: [],
  failed: [],
  returned: [],
  cancelled: [],
};

/** Exactly one exception branch per state (spec §4.1). */
export const EXCEPTIONS: Readonly<Partial<Record<JobState, readonly ExceptionKind[]>>> = {
  to_pickup: ['vehicle'],
  // A mismatch / incomplete check is discovered while verifying at the store, so it can be
  // reported from at_pickup (failed check) as well as from pickup_verified (design table row 06).
  at_pickup: ['not_ready', 'mismatch', 'incomplete'],
  pickup_verified: ['mismatch', 'incomplete'],
  picked_up: ['safety'],
  to_drop: ['vehicle', 'safety'],
  at_drop: ['unavailable', 'address', 'cannot_access', 'other'],
  handover: ['refused'],
  proof: ['proof_failed'],
};

/** Exceptions that may be raised from any active state (SOS is always available). */
const GLOBAL_EXCEPTIONS: readonly ExceptionKind[] = ['safety', 'other'];

export const isTerminal = (state: JobState): state is TerminalJobState =>
  (TERMINAL_STATES as readonly string[]).includes(state);

export const isActiveState = (state: JobState): boolean => !isTerminal(state) && state !== 'created' && state !== 'offered';

export const canTransition = (from: JobState, to: JobState): boolean => TRANSITIONS[from]?.includes(to) ?? false;

/** The single "happy path" successor used by the primary action on each screen. */
export const nextHappyState = (from: JobState): JobState | null => {
  const idx = FLOW_STATES.indexOf(from as RiderFlowState);
  if (idx === -1 || from === 'delivered') return null;
  const next = FLOW_STATES[idx + 1];
  return (next as JobState) ?? null;
};

export const canRaiseException = (state: JobState, kind: ExceptionKind): boolean =>
  (EXCEPTIONS[state]?.includes(kind) ?? false) || (isActiveState(state) && GLOBAL_EXCEPTIONS.includes(kind));

export type TransitionErrorCode = 'version_conflict' | 'invalid_transition' | 'terminal_state';

export class TransitionError extends Error {
  readonly code: TransitionErrorCode;
  readonly from: JobState;
  readonly to: JobState;
  readonly expectedVersion: number;
  readonly actualVersion: number;
  constructor(code: TransitionErrorCode, from: JobState, to: JobState, expectedVersion: number, actualVersion: number) {
    super(`${code}: ${from} → ${to} (expected v${expectedVersion}, actual v${actualVersion})`);
    this.name = 'TransitionError';
    this.code = code;
    this.from = from;
    this.to = to;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export interface TransitionOptions {
  /** The version the caller last saw. Mismatch → version_conflict (prevents double taps). */
  expectedVersion: number;
  at?: string;
}

/**
 * Pure transition: returns a new Job with `state = to` and `version + 1`.
 * Throws TransitionError; never mutates the input.
 */
export const transition = (job: Job, to: JobState, opts: TransitionOptions): Job => {
  if (job.version !== opts.expectedVersion) {
    throw new TransitionError('version_conflict', job.state, to, opts.expectedVersion, job.version);
  }
  if (isTerminal(job.state)) {
    throw new TransitionError('terminal_state', job.state, to, opts.expectedVersion, job.version);
  }
  if (!canTransition(job.state, to)) {
    throw new TransitionError('invalid_transition', job.state, to, opts.expectedVersion, job.version);
  }
  const at = opts.at ?? new Date().toISOString();
  return {
    ...job,
    state: to,
    version: job.version + 1,
    updatedAt: at,
    acceptedAt: to === 'accepted' ? at : job.acceptedAt,
    deliveredAt: to === 'delivered' ? at : job.deliveredAt,
  };
};

/** Same as `transition` but returns a Result instead of throwing. */
export const tryTransition = (
  job: Job,
  to: JobState,
  opts: TransitionOptions,
): { ok: true; job: Job } | { ok: false; error: TransitionError } => {
  try {
    return { ok: true, job: transition(job, to, opts) };
  } catch (e) {
    if (e instanceof TransitionError) return { ok: false, error: e };
    throw e;
  }
};

/**
 * Where the rider should be for a given job state. Used on resume (app killed
 * mid-job) and by every "next" action so screens never guess.
 */
export const routeForJob = (job: Pick<Job, 'id' | 'state'>): string => {
  const base = `/job/${job.id}`;
  switch (job.state) {
    case 'offered':
      return `/offer/${job.id}`;
    case 'accepted':
    case 'to_pickup':
      return base; // current-job (map, stepper, Start navigation)
    case 'at_pickup':
      return `${base}/pickup`;
    case 'pickup_verified':
      return `${base}/pickup/done`;
    case 'picked_up':
      return `${base}/navigate`;
    case 'to_drop':
      return base; // active-delivery
    case 'at_drop':
      return `${base}/arrived`;
    case 'handover':
      return `${base}/proof`;
    case 'proof':
      return `${base}/proof`;
    case 'delivered':
      return `${base}/done`;
    case 'failed':
    case 'returned':
    case 'cancelled':
      return `/tasks/${job.id}`;
    default:
      return '/home';
  }
};

/** Stepper labels for the current-job screen (At store → Delivery). */
export const stepperFor = (state: JobState): { label: string; done: boolean; active: boolean }[] => {
  const ord = stateOrdinal(state);
  const atStoreDone = ord >= stateOrdinal('picked_up');
  const deliveryDone = state === 'delivered';
  return [
    { label: 'At store', done: atStoreDone, active: !atStoreDone && ord >= stateOrdinal('accepted') },
    { label: 'Delivery', done: deliveryDone, active: atStoreDone && !deliveryDone },
  ];
};

/** Which resolution a raised exception leads to (spec §7.3). */
export const exceptionOutcome = (
  kind: ExceptionKind,
): { endsJob: boolean; resultState?: TerminalJobState; nextActions: import('@/types').ExceptionNextAction[] } => {
  switch (kind) {
    case 'not_ready':
      return { endsJob: false, nextActions: ['wait', 'call_merchant', 'continue'] };
    case 'mismatch':
    case 'incomplete':
      return { endsJob: false, nextActions: ['call_merchant', 'continue', 'await_operations'] };
    case 'vehicle':
      return { endsJob: true, resultState: 'failed', nextActions: ['reassigned'] };
    case 'safety':
      return { endsJob: false, nextActions: ['await_operations'] };
    case 'unavailable':
      return { endsJob: false, nextActions: ['wait', 'call_customer', 'escalate'] };
    case 'address':
      return { endsJob: false, nextActions: ['share_location', 'call_customer', 'dispute_address', 'continue'] };
    case 'cannot_access':
      return { endsJob: false, nextActions: ['call_customer', 'escalate'] };
    case 'refused':
      return { endsJob: true, resultState: 'returned', nextActions: ['return_to_store'] };
    case 'proof_failed':
      return { endsJob: false, nextActions: ['photo_fallback', 'await_operations'] };
    default:
      return { endsJob: false, nextActions: ['await_operations'] };
  }
};
