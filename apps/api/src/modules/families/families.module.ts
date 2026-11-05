import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ConsentModule } from '../consent/consent.module';
import { FamiliesController } from './families.controller';
import { FamiliesService } from './families.service';

@Module({
  imports: [AuditModule, ConsentModule],
  controllers: [FamiliesController],
  providers: [FamiliesService],
  exports: [FamiliesService],
})
export class FamiliesModule {}
