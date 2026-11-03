import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { InterviewsController } from './interviews.controller';
import { InterviewsGateway } from './interviews.gateway';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [NotificationsModule],
  controllers: [InterviewsController],
  providers: [InterviewsService, InterviewsGateway],
  exports: [InterviewsService, InterviewsGateway],
})
export class InterviewsModule {}
