import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

/**
 * Inbound provider webhooks. Kept as its own module rather than tacked onto billing or
 * classroom so that every provider callback lives at one `/webhooks/*` prefix and the
 * `@Public()` surface is easy to audit in one place.
 *
 * `PrismaModule`, `QueueModule` and `IntegrationsModule` are global, so the only feature
 * dependency to import is `BillingModule` (for `BillingService`).
 */
@Module({
  imports: [BillingModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
