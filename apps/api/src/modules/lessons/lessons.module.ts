import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { MushafModule } from '../mushaf/mushaf.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ParentPortalModule } from '../parent-portal/parent-portal.module';
import { LessonCardsService } from './lesson-cards.service';
import { LessonsController } from './lessons.controller';
import { MistakesService } from './mistakes.service';
import { RevisionRequestsController } from './revision-requests.controller';
import { RevisionRequestsService } from './revision-requests.service';

@Module({
  imports: [NotificationsModule, MushafModule, AuditModule, ParentPortalModule],
  controllers: [LessonsController, RevisionRequestsController],
  providers: [MistakesService, LessonCardsService, RevisionRequestsService],
  exports: [MistakesService, LessonCardsService],
})
export class LessonsModule {}
