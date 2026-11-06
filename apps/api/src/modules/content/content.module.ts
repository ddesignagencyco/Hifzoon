import { Module } from '@nestjs/common';

import { ContentController } from './content.controller';
import { DuasService } from './duas.service';

@Module({
  controllers: [ContentController],
  providers: [{ provide: DuasService, useFactory: () => new DuasService() }],
  exports: [DuasService],
})
export class ContentModule {}
