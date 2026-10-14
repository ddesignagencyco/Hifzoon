import { Module } from '@nestjs/common';

import { ClassroomController } from './classroom.controller';
import { ClassroomGateway } from './classroom.gateway';
import { ClassroomService } from './classroom.service';

@Module({
  controllers: [ClassroomController],
  providers: [ClassroomService, ClassroomGateway],
  exports: [ClassroomService, ClassroomGateway],
})
export class ClassroomModule {}
