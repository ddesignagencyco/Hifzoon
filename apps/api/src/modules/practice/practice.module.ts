import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ConsentModule } from '../consent/consent.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';

@Module({
  imports: [ConsentModule, NotificationsModule, AuditModule],
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
