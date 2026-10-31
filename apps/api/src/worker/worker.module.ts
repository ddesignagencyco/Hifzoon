import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';

import { CommonModule } from '../common/common.module';
import { AppConfigModule } from '../config/app-config.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { BillingModule } from '../modules/billing/billing.module';
import { SchedulingModule } from '../modules/scheduling/scheduling.module';
import { ClassroomModule } from '../modules/classroom/classroom.module';
import { SettingsModule } from '../modules/settings/settings.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { ALL_QUEUE_NAMES } from '../queue/queue.constants';
import { RedisModule, RedisService } from '../redis/redis.service';
import { StorageModule } from '../storage/storage.module';
import { RECURRING_JOBS } from './schedules';
import { JobProcessor } from './processors/processor.interface';
import { BillingProcessor, SafeguardingProcessor } from './processors/billing.processor';
import { ClassroomProcessor } from './processors/classroom.processor';
import { ClassReminderProcessor } from './processors/class-reminder.processor';
import { DataRequestProcessor } from './processors/data-request.processor';
import { LessonCardProcessor } from './processors/lesson-card.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { RetentionProcessor } from './processors/retention.processor';
import { SchedulingProcessor } from './processors/scheduling.processor';

export const JOB_PROCESSORS = 'JOB_PROCESSORS';

/**
 * Worker process (TRD section 4.2 — the same image as the API, a different entry
 * command).
 *
 * BullMQ workers are created imperatively so queue names, concurrency and retry
 * policy are all visible in one place, while the processors themselves stay ordinary
 * Nest injectables and get the same Prisma, storage and queue services as the API.
 * No HTTP server and no controllers are started here, so a runaway job cannot take
 * the request path down and the two processes scale independently (NFR-CAP-01).
 */
@Injectable()
export class WorkerBootstrap implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerBootstrap.name);
  private readonly workers: Worker[] = [];
  private readonly scheduleQueues: Queue[] = [];

  constructor(
    private readonly redis: RedisService,
    @Inject(JOB_PROCESSORS) private readonly processors: JobProcessor[],
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Fail fast and loudly if any declared queue has no consumer. A queue that exists in
    // `queue.constants.ts` but has no processor is worse than no queue at all: the API
    // happily enqueues work that will never run, and nothing in the system reports an
    // error. Refusing to boot is the only signal that surfaces this before a family
    // notices a class reminder that never arrived.
    const covered = new Set(this.processors.map((p) => p.queue));
    const orphaned = ALL_QUEUE_NAMES.filter((name) => !covered.has(name));
    if (orphaned.length > 0) {
      throw new Error(
        `Queues with no worker processor: ${orphaned.join(', ')}. ` +
          'Every queue in ALL_QUEUE_NAMES must be consumed by exactly one JobProcessor.',
      );
    }

    for (const processor of this.processors) {
      const worker = new Worker(processor.queue, (job: Job) => processor.handle(job), {
        connection: this.redis.queueConnectionOptions(),
        concurrency: processor.concurrency,
      });

      worker.on('failed', (job, error) => {
        this.logger.error(
          `${processor.queue}/${job?.name ?? 'unknown'} failed after ${job?.attemptsMade ?? 0} attempt(s): ${error.message}`,
        );
      });
      worker.on('error', (error) =>
        this.logger.error(`${processor.queue} worker error: ${error.message}`),
      );

      this.workers.push(worker);
      this.logger.log(`Listening on "${processor.queue}" (concurrency ${processor.concurrency})`);
    }

    await this.registerRecurringJobs();
  }

  /** Registers the sweeps in `RECURRING_JOBS`; upserting keeps boot idempotent. */
  private async registerRecurringJobs(): Promise<void> {
    const queues = new Map<string, Queue>();
    for (const job of RECURRING_JOBS) {
      let queue = queues.get(job.queue);
      if (!queue) {
        queue = new Queue(job.queue, { connection: this.redis.queueConnectionOptions() });
        queues.set(job.queue, queue);
        this.scheduleQueues.push(queue);
      }
      const repeat = job.cron ? { pattern: job.cron, tz: 'UTC' } : { every: job.everyMs! };
      await queue.upsertJobScheduler(job.id, repeat, { name: job.jobName, data: {} });
    }
    this.logger.log(`Registered ${RECURRING_JOBS.length} recurring job(s)`);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all(this.scheduleQueues.map((queue) => queue.close()));
  }
}

@Global()
@Module({
  imports: [
    AppConfigModule,
    CommonModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    StorageModule,
    IntegrationsModule,
    NotificationsModule,
    SchedulingModule,
    BillingModule,
    ClassroomModule,
    SettingsModule,
  ],
  providers: [
    // One processor per queue in `ALL_QUEUE_NAMES`. A queue with a producer but no
    // processor is the failure mode this list exists to prevent: jobs pile up in Redis
    // and nothing ever consumes them, while every health check stays green.
    SchedulingProcessor,
    LessonCardProcessor,
    RetentionProcessor,
    BillingProcessor,
    SafeguardingProcessor,
    DataRequestProcessor,
    ClassroomProcessor,
    ClassReminderProcessor,
    NotificationProcessor,
    {
      provide: JOB_PROCESSORS,
      inject: [
        SchedulingProcessor,
        LessonCardProcessor,
        RetentionProcessor,
        BillingProcessor,
        SafeguardingProcessor,
        DataRequestProcessor,
        ClassroomProcessor,
        ClassReminderProcessor,
        NotificationProcessor,
      ],
      useFactory: (...p: JobProcessor[]) => p,
    },
    WorkerBootstrap,
  ],
  exports: [WorkerBootstrap],
})
export class WorkerModule {}
