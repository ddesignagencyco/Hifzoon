import { AppError } from '../common/errors/app-error';

/**
 * Thrown when a feature is reached on a deployment whose real provider is not
 * configured. This is a deliberate 501 rather than a silent fake response — e.g.
 * recording a class without a real video provider would otherwise look like it
 * worked (TRD section 21 open questions 1–3 are still open).
 */
export class UnsupportedProviderError extends AppError {
  constructor(capability: string, providerName: string, required: string[]) {
    super(
      'NOT_IMPLEMENTED',
      `${capability} requires a configured ${providerName} provider (missing: ${required.join(', ')})`,
      { capability, providerName, required },
    );
  }
}

export function assertProviderSelected(
  adapterName: string,
  providerName: string,
  required: string[],
): void {
  if (adapterName === 'fake') {
    throw new UnsupportedProviderError('This action', providerName, required);
  }
}
