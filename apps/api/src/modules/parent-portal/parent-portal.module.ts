import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagingService } from './messaging.service';
import { ParentPortalController } from './parent-portal.controller';
import { ParentPortalService } from './parent-portal.service';
import { SupervisorMessagesController } from './supervisor-messages.controller';
import { SupervisorMessagesService } from './supervisor-messages.service';
import { TeacherMessagingController } from './teacher-messaging.controller';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [ParentPortalController, TeacherMessagingController, SupervisorMessagesController],
  providers: [ParentPortalService, MessagingService, SupervisorMessagesService],
  exports: [ParentPortalService, MessagingService],
})
export class ParentPortalModule {}
