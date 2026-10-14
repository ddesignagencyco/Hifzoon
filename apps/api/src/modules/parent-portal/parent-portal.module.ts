import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { MessagingService } from './messaging.service';
import { ParentPortalController } from './parent-portal.controller';
import { ParentPortalService } from './parent-portal.service';
import { TeacherMessagingController } from './teacher-messaging.controller';

@Module({
  imports: [AuditModule],
  controllers: [ParentPortalController, TeacherMessagingController],
  providers: [ParentPortalService, MessagingService],
  exports: [ParentPortalService, MessagingService],
})
export class ParentPortalModule {}
