import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AdminConsoleController } from './admin-console.controller';
import { AdminConsoleService } from './admin-console.service';

@Module({
  imports: [AuditModule],
  controllers: [AdminConsoleController],
  providers: [AdminConsoleService],
  exports: [AdminConsoleService],
})
export class AdminModule {}
