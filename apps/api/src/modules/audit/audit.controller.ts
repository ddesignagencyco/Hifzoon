import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import { z } from 'zod';

import { Audit, Roles } from '../../common/decorators';
import { ZodQuery } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from './audit.service';

const listQuery = z.object({
  actorId: z.string().uuid().optional(),
  action: z.string().max(120).optional(),
  targetType: z.string().max(80).optional(),
  targetId: z.string().max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Read-only audit viewer (FR-OPS-06, OPS-FE-06).
 *
 * Restricted to `SUPER_ADMIN` rather than `ADMIN`: an administrator who can change
 * records should not also be the one adjudicating who changed them (separation of
 * duties). There is deliberately no write endpoint — `AuditService` is the only writer,
 * and the migration installs a trigger that rejects `UPDATE` and `DELETE` on the table.
 */
@ApiTags('admin/audit')
@ApiBearerAuth()
@Controller('admin/audit')
@Roles(Role.SUPER_ADMIN)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('facets')
  @ApiOperation({ summary: 'Who acted and on what, for the audit filters (no ids to paste)' })
  facets() {
    return this.audit.facets();
  }

  @Get()
  @ZodQuery(listQuery)
  @ApiOperation({ summary: 'Search the append-only audit log' })
  @Audit({ action: 'admin.audit.read', targetType: 'audit_log', captureBody: false })
  list(@Query(new ZodValidationPipe(listQuery)) query: z.infer<typeof listQuery>) {
    return this.audit.list(query);
  }
}
