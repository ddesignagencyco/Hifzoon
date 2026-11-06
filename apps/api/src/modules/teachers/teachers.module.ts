import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { ApplicantTrainingModule } from '../training/applicant-training.module';
import { ProfileCompleteGuard } from './profile-complete.guard';
import { TeacherOnboardingController } from './teacher-onboarding.controller';
import { TeacherOnboardingService } from './teacher-onboarding.service';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';

@Module({
  imports: [NotificationsModule, ApplicantTrainingModule],
  controllers: [TeachersController, TeacherOnboardingController],
  providers: [TeachersService, TeacherOnboardingService, ProfileCompleteGuard],
  exports: [TeachersService, TeacherOnboardingService, ProfileCompleteGuard],
})
export class TeachersModule {}
