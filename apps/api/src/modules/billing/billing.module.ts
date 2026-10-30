import { Module } from '@nestjs/common';

import { IntegrationsModule } from '../../integrations/integrations.module';
import { QueueModule } from '../../queue/queue.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminBillingController, BillingController, PayrollController } from './billing.controller';
import { BillingService } from './billing.service';
import { PayrollService } from './payroll.service';

@Module({
  imports: [AuditModule, SettingsModule, IntegrationsModule, QueueModule, SchedulingModule, NotificationsModule],
  controllers: [BillingController, AdminBillingController, PayrollController],
  providers: [BillingService, PayrollService],
  exports: [BillingService, PayrollService],
})
export class BillingModule {}
