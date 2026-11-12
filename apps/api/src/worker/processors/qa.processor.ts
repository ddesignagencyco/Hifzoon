import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { QaService } from '../../modules/qa/qa.service';
import { QUEUE } from '../../queue/queue.constants';
import type { JobProcessor } from './processor.interface';

/**
 * Monthly QA sampling (FR-QA-03). On the 1st the month that just ended is complete, so the
 * sample is drawn from all of it; the job is a top-up and safe to run twice.
 */
@Injectable()
export class QaProcessor implements JobProcessor {
  readonly queue = QUEUE.QA;
  readonly concurrency = 1;

  private readonly logger = new Logger(QaProcessor.name);

  constructor(private readonly qa: QaService) {}

  async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'sample-monthly': {
        const now = new Date();
        // The last instant of the previous month: its calendar month is the one sampled.
        const reference = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1);
        return this.qa.sampleAllTeachers(reference);
      }
      default:
        this.logger.warn(`Unknown qa job "${job.name}" — ignoring`);
        return { skipped: job.name };
    }
  }
}
