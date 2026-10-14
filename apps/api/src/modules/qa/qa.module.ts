import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QueueModule } from '../../queue/queue.module';
import { SettingsModule } from '../settings/settings.module';
import { CasesService } from './cases.service';
import { CasesController, QaController, QualityRatingsController } from './qa.controller';
import { QaService, RatingsService } from './qa.service';

@Module({
  imports: [AuditModule, NotificationsModule, SettingsModule, QueueModule],
  controllers: [QualityRatingsController, QaController, CasesController],
  providers: [RatingsService, QaService, CasesService],
  exports: [RatingsService, QaService, CasesService],
})
export class QaModule {}
