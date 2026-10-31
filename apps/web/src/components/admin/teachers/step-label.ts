import { humanize } from '@/components/ui/primitives';

/** Hiring steps as people say them ("ID check", not "Id check"). */
export function stepLabel(step: string): string {
  if (step === 'ID_CHECK') return 'ID check';
  return humanize(step);
}
