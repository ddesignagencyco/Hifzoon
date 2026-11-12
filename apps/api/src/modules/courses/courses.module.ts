import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AssessmentsService } from './assessments.service';
import { CourseAdminController } from './course-admin.controller';
import { CourseAdminService } from './course-admin.service';
import { CourseMaterialsService } from './course-materials.service';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { CurriculumController } from './curriculum.controller';
import { CurriculumService } from './curriculum.service';

@Module({
  imports: [NotificationsModule, AuditModule],
  controllers: [CoursesController, CurriculumController, CourseAdminController],
  providers: [
    CoursesService,
    AssessmentsService,
    CurriculumService,
    CourseAdminService,
    CourseMaterialsService,
  ],
  exports: [CoursesService, AssessmentsService],
})
export class CoursesModule {}
