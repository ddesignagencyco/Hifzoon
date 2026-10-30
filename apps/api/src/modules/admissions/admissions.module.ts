import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { SettingsModule } from '../settings/settings.module';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsService } from './admissions.service';
import { CmsService } from './cms.service';

@Module({
  imports: [AuditModule, SettingsModule, BillingModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService, CmsService],
  exports: [AdmissionsService, CmsService],
})
export class AdmissionsModule {}
