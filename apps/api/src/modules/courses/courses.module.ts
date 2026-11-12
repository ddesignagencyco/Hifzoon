import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AssessmentsService } from './assessments.service';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { CurriculumController } from './curriculum.controller';
import { CurriculumService } from './curriculum.service';

@Module({
  imports: [NotificationsModule, AuditModule],
  controllers: [CoursesController, CurriculumController],
  providers: [CoursesService, AssessmentsService, CurriculumService],
  exports: [CoursesService, AssessmentsService],
})
export class CoursesModule {}
