import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { ApplicantTrainingController } from './applicant-training.controller';
import { ApplicantTrainingService } from './applicant-training.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ApplicantTrainingController],
  providers: [ApplicantTrainingService],
  exports: [ApplicantTrainingService],
})
export class ApplicantTrainingModule {}
