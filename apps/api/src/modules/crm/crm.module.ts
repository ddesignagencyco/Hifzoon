import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { EnquiriesController } from './enquiries.controller';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [CrmController, EnquiriesController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
