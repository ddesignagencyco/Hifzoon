import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { QUEUE } from '../../queue/queue.constants';
import { InterviewsService } from '../../modules/interviews/interviews.service';
import type { JobProcessor } from './processor.interface';

/**
 * Hiring interview lifecycle (INT).
 *
 * One sweep, and it exists for a failure that has no other cure: nobody is obliged to
 * press "End interview". If Qari shb simply closes the tab, the interview stays LIVE,
 * the applicant's banked minutes never settle and a LiveKit room sits open — reachable
 * by anyone still holding a token. The sweep is what makes the booked window mean
 * something.
 */
@Injectable()
export class InterviewsProcessor implements JobProcessor {
  readonly queue = QUEUE.INTERVIEWS;
  readonly concurrency = 2;

  private readonly logger = new Logger(InterviewsProcessor.name);

  constructor(private readonly interviews: InterviewsService) {}

  async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'close-finished-interviews':
        return this.closeFinished();
      default:
        this.logger.warn(`Unknown interviews job "${job.name}" — ignoring`);
        return { skipped: job.name };
    }
  }

  /**
   * Promotes interviews that have started, then closes the ones whose join window has
   * fully passed. Promotion runs first so the two never disagree about an interview that
   * ran: an interview still marked SCHEDULED when its window closes is read as a
   * no-show, and one that was LIVE is read as having happened.
   */
  private async closeFinished() {
    const promoted = await this.interviews.promoteStartedInterviews();
    const { closed, roomsEnded } = await this.interviews.closeFinishedInterviews();

    if (closed > 0 || promoted > 0) {
      this.logger.log(
        `Interviews: promoted ${promoted} to LIVE, closed ${closed}, ended ${roomsEnded} room(s)`,
      );
    }
    return { promoted, closed, roomsEnded };
  }
}
