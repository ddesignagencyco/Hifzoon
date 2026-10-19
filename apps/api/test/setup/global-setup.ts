import infrastructure from './infrastructure';

/**
 * Global setup for the e2e suite (TRD section 18).
 *
 * Kept as a thin shim over `infrastructure.ts` so the container lifecycle can also be
 * driven from a script — see `test:e2e:containers` — without duplicating the wiring.
 */
export default infrastructure;
