import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { ScheduleMaterialiser } from './schedule-materialiser.service';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';

@Module({
  imports: [NotificationsModule],
  controllers: [SchedulingController],
  providers: [SchedulingService, ScheduleMaterialiser],
  exports: [SchedulingService, ScheduleMaterialiser],
})
export class SchedulingModule {}
