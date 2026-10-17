import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagingService } from './messaging.service';
import { ParentPortalController } from './parent-portal.controller';
import { ParentPortalService } from './parent-portal.service';
import { TeacherMessagingController } from './teacher-messaging.controller';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [ParentPortalController, TeacherMessagingController],
  providers: [ParentPortalService, MessagingService],
  exports: [ParentPortalService, MessagingService],
})
export class ParentPortalModule {}
