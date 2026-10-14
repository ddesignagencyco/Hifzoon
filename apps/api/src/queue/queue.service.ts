import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, JobsOptions, Queue } from 'bullmq';

import { RedisService } from '../redis/redis.service';
import { QueueName } from './queue.constants';

/**
 * Queue producer used by the API process. The worker process consumes the same
 * queues via WorkerProcessorsService (TRD section 4.2 — same image, different entry
 * point), which keeps the API free of processor code.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly redis: RedisService) {}

  queue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.redis.queueConnectionOptions(),
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 86_400, count: 1_000 },
          removeOnFail: { age: 604_800 },
        },
      });
      this.queues.set(name, queue);
    }
    return queue;
  }

  /** Fire-and-forget enqueue; callers that need the id await the returned job. */
  async add<T>(name: QueueName, jobName: string, data: T, opts?: JobsOptions): Promise<Job<T>> {
    const job = await this.queue(name).add(jobName, data, opts);
    this.logger.debug(`Queued ${name}/${jobName} (${job.id})`);
    return job;
  }

  /** Delayed job used for reminders and dunning retries. */
  async addDelayed<T>(
    name: QueueName,
    jobName: string,
    data: T,
    delayMs: number,
    opts: JobsOptions = {},
  ): Promise<Job<T>> {
    return this.add(name, jobName, data, { delay: Math.max(0, delayMs), ...opts });
  }

  /** Removes any pending job matching a filter — used when a class is rescheduled. */
  async removePending(
    name: QueueName,
    jobName: string,
    predicate: (job: Job) => boolean,
  ): Promise<void> {
    const jobs = await this.queue(name).getJobs(['delayed', 'waiting', 'active']);
    for (const job of jobs) {
      if (job.name === jobName && predicate(job)) await job.remove().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }
}
