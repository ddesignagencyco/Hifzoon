import type { Job } from 'bullmq';

/**
 * Contract every background job implements (PLAT-BE-04).
 *
 * Processors are plain classes rather than Nest providers on purpose: they run in a
 * separate process where Nest's DI graph is deliberately minimal, so the modules they
 * touch (Prisma, storage) are constructed lazily inside `handle`. That keeps a worker
 * crash from cascading and keeps the dependency list of a job obvious in one file.
 */
export interface JobProcessor {
  /** BullMQ queue this processor consumes. */
  readonly queue: string;
  /** How many jobs may run at once. Queues are independent (NFR-CAP-01). */
  readonly concurrency: number;
  handle(job: Job): Promise<unknown>;
}
