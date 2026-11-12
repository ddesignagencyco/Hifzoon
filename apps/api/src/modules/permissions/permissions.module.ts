import { Global, Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PermissionGuard } from './permission.guard';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

@Global()
@Module({
  imports: [AuditModule],
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionGuard],
  exports: [PermissionsService, PermissionGuard],
})
export class PermissionsModule {}
