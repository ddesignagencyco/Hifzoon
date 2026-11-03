import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { ApplicantTrainingModule } from '../training/applicant-training.module';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';

@Module({
  imports: [NotificationsModule, ApplicantTrainingModule],
  controllers: [TeachersController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
