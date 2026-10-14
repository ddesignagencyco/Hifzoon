import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';

import { WorkerModule } from './worker/worker.module';

/**
 * Worker entry point (TRD section 4.2). Runs as `npm run start:worker` in development
 * and `node dist/worker.js` in the container — the same image as the API, a different
 * command, so both roles always ship the same code.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(['error', 'warn', 'log']);
  app.enableShutdownHooks();
  logger.log('Hifzoon worker started');
}

void bootstrap().catch((error) => {
  console.error('Worker failed to start', error);
  process.exit(1);
});
