import { Module } from '@nestjs/common';

import { MushafController } from './mushaf.controller';
import { MushafService } from './mushaf.service';

@Module({
  controllers: [MushafController],
  providers: [MushafService],
  exports: [MushafService],
})
export class MushafModule {}
