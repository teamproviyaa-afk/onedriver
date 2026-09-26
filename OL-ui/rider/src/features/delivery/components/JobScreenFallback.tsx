import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { errorMessage } from '../errors';

export interface JobScreenFallbackProps {
  error?: Error | null;
  onRetry?: () => void;
  label?: string;
}

/** Loading / error shell shown while a job screen has no job to render (never a blank screen). */
export const JobScreenFallback = ({ error, onRetry, label = 'Loading job…' }: JobScreenFallbackProps) => (
  <Screen>{error ? <ErrorState title="Could not load this job" body={errorMessage(error, 'Check your connection and try again.')} onRetry={onRetry} /> : <LoadingState label={label} />}</Screen>
);
