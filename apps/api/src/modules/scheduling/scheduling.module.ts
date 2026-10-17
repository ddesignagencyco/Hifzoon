import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { ScheduleMaterialiser } from './schedule-materialiser.service';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';

@Module({
  imports: [NotificationsModule, SettingsModule],
  controllers: [SchedulingController],
  providers: [SchedulingService, ScheduleMaterialiser],
  exports: [SchedulingService, ScheduleMaterialiser],
})
export class SchedulingModule {}
