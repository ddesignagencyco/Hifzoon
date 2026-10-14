import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { LessonCardsService } from './lesson-cards.service';
import { LessonsController } from './lessons.controller';
import { MistakesService } from './mistakes.service';

@Module({
  imports: [NotificationsModule],
  controllers: [LessonsController],
  providers: [MistakesService, LessonCardsService],
  exports: [MistakesService, LessonCardsService],
})
export class LessonsModule {}
