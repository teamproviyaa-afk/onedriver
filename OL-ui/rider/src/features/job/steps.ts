import type { JobStepperProps } from '@/components/app/JobStepper';
import { stepperFor } from '@/state-machine/deliveryStateMachine';
import type { JobState } from '@/types';

/** The state machine labels the first step "At store"; Figma current-job prints "At Store". */
const FIGMA_LABELS: Record<string, string> = { 'At store': 'At Store' };

/** Two-step "At Store — Delivery" stepper for the current-job drawer, driven by the state machine. */
export const currentJobSteps = (state: JobState): JobStepperProps['steps'] => stepperFor(state).map((s) => ({ ...s, label: FIGMA_LABELS[s.label] ?? s.label }));
