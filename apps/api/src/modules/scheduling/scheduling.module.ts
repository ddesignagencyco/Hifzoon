import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { ScheduleMaterialiser } from './schedule-materialiser.service';
import { SchedulingAdminController } from './scheduling-admin.controller';
import { SchedulingAdminService } from './scheduling-admin.service';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';

@Module({
  imports: [AuditModule, NotificationsModule, SettingsModule],
  controllers: [SchedulingController, SchedulingAdminController],
  providers: [SchedulingService, ScheduleMaterialiser, SchedulingAdminService],
  exports: [SchedulingService, ScheduleMaterialiser],
})
export class SchedulingModule {}
