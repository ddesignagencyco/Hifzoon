import { Module } from '@nestjs/common';

import { ConsentModule } from '../consent/consent.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';

@Module({
  imports: [ConsentModule, NotificationsModule],
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
