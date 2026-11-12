import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';
import { DataRequestsAdminController } from './data-requests-admin.controller';
import { DataRequestsAdminService } from './data-requests-admin.service';

@Module({
  imports: [SettingsModule, AuditModule, NotificationsModule],
  controllers: [ConsentController, DataRequestsAdminController],
  providers: [ConsentService, DataRequestsAdminService],
  exports: [ConsentService],
})
export class ConsentModule {}
