import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QueueModule } from '../../queue/queue.module';
import { SettingsModule } from '../settings/settings.module';
import { CasesService } from './cases.service';
import { CasesController, QaController, QualityRatingsController } from './qa.controller';
import { QaInsightsService } from './qa-insights.service';
import { QaService, RatingsService } from './qa.service';
import { SupervisionController } from './supervision.controller';
import { SupervisionService } from './supervision.service';

@Module({
  imports: [AuditModule, NotificationsModule, SettingsModule, QueueModule],
  controllers: [QualityRatingsController, QaController, CasesController, SupervisionController],
  providers: [RatingsService, QaService, QaInsightsService, CasesService, SupervisionService],
  exports: [RatingsService, QaService, QaInsightsService, CasesService, SupervisionService],
})
export class QaModule {}
