import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { EnquiriesController } from './enquiries.controller';

@Module({
  imports: [AuditModule],
  controllers: [CrmController, EnquiriesController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
