import { Module } from '@nestjs/common';

import { ClassReminderService } from './class-reminder.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, ClassReminderService],
  exports: [NotificationsService, ClassReminderService],
})
export class NotificationsModule {}
