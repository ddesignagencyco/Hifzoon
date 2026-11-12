import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminConsoleController } from './admin-console.controller';
import { AdminConsoleService } from './admin-console.service';
import { AdminFamiliesService } from './admin-families.service';
import { AdminOpsController } from './admin-ops.controller';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [AdminConsoleController, AdminOpsController],
  providers: [
    AdminConsoleService,
    AdminAccountsService,
    AdminFamiliesService,
    AdminAnalyticsService,
  ],
  exports: [AdminConsoleService],
})
export class AdminModule {}
