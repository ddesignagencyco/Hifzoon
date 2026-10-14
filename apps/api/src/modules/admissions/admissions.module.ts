import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsService } from './admissions.service';
import { CmsService } from './cms.service';

@Module({
  imports: [AuditModule, SettingsModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService, CmsService],
  exports: [AdmissionsService, CmsService],
})
export class AdmissionsModule {}
