import { humanize } from '@/components/ui/primitives';

/** Hiring steps as people say them ("ID check", not "Id check"). */
export function stepLabel(step: string): string {
  if (step === 'ID_CHECK') return 'ID check';
  // Stored as DEMO_CLASS; the step is the live interview with the applicant.
  if (step === 'DEMO_CLASS') return 'Interview';
  return humanize(step);
}
