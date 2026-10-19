import { Module } from '@nestjs/common';

import { HifzController } from './hifz.controller';
import { HifzService } from './hifz.service';

@Module({
  controllers: [HifzController],
  providers: [HifzService],
  exports: [HifzService],
})
export class HifzModule {}
