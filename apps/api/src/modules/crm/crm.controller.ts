import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LeadStatus, Role, TaskStatus, TaskType } from '@hifzoon/shared';
import { z } from 'zod';

import { Audit, CurrentUser, type AuthenticatedUser, Roles } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CrmService } from './crm.service';

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const listLeadsQuery = pageQuery.extend({
  status: z.nativeEnum(LeadStatus).optional(),
  ownerId: z.string().uuid().optional(),
  source: z.string().max(60).optional(),
  search: z.string().max(160).optional(),
});

const createLeadBody = z.object({
  contactName: z.string().min(1).max(160),
  source: z.string().max(60).optional(),
  email: z.string().email().max(320).optional(),
  phone: z.string().min(5).max(32).optional(),
  country: z.string().length(2).optional(),
  // Marketing geolocation (M-GEO-01) — where the enquiry came from, for area roll-ups.
  region: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  postcode: z.string().max(20).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  childAge: z.number().int().min(3).max(18).optional(),
  courseInterest: z.string().max(60).optional(),
  notes: z.string().max(4000).optional(),
  ownerId: z.string().uuid().optional(),
});

const leadsByAreaQuery = z.object({
  country: z.string().length(2).optional(),
});

const updateStatusBody = z.object({
  status: z.nativeEnum(LeadStatus),
  lostReason: z.string().max(2000).optional(),
  familyId: z.string().uuid().optional(),
});

const listTasksQuery = pageQuery.extend({
  assigneeId: z.string().uuid().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  overdueOnly: z.coerce.boolean().optional(),
});

const createTaskBody = z.object({
  leadId: z.string().uuid().optional(),
  type: z.nativeEnum(TaskType),
  assigneeId: z.string().uuid().optional(),
  dueAt: z.coerce.date(),
  note: z.string().max(2000).optional(),
});

/**
 * CRM (FR-OPS-01..03). Staff-only.
 *
 * `POST /crm/leads` is deliberately open to `ADMIN` and `SUPER_ADMIN` but *not*
 * teachers: a teacher has no visibility into pricing conversations, and letting them
 * create leads would put prospect phone numbers in front of someone who has no need to
 * see them (CR-07 data minimisation).
 */
@ApiTags('admin/crm')
@ApiBearerAuth()
@Controller('admin/crm')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @ZodQuery(listLeadsQuery)
  @ZodQuery(listLeadsQuery)
  @Get('leads')
  @ApiOperation({ summary: 'List CRM leads' })
  listLeads(@Query(new ZodValidationPipe(listLeadsQuery)) query: z.infer<typeof listLeadsQuery>) {
    return this.crm.listLeads(query);
  }

  @ZodBody(createLeadBody)
  @ZodBody(createLeadBody)
  @Post('leads')
  @Audit({ action: 'crm.lead.create', targetType: 'lead' })
  @ApiOperation({ summary: 'Create a lead and its first follow-up task' })
  createLead(
    @Body(new ZodValidationPipe(createLeadBody)) body: z.infer<typeof createLeadBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.crm.createLead({ ...body, ownerId: body.ownerId ?? user.id });
  }

  @ZodBody(updateStatusBody)
  @ZodBody(updateStatusBody)
  @Patch('leads/:id/status')
  @Audit({ action: 'crm.lead.status', targetType: 'lead' })
  @ApiOperation({ summary: 'Move a lead through the pipeline' })
  updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStatusBody)) body: z.infer<typeof updateStatusBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.crm.updateLeadStatus({ leadId: id, ...body, actorId: user.id });
  }

  @Get('pipeline')
  @ApiOperation({ summary: 'Pipeline counts and conversion rates' })
  pipeline() {
    return this.crm.pipelineSummary();
  }

  @ZodQuery(leadsByAreaQuery)
  @ZodQuery(leadsByAreaQuery)
  @Get('leads/by-area')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Lead counts grouped by country and region (M-GEO-01)' })
  leadsByArea(
    @Query(new ZodValidationPipe(leadsByAreaQuery)) query: z.infer<typeof leadsByAreaQuery>,
  ) {
    return this.crm.leadsByArea(query);
  }

  @ZodQuery(listTasksQuery)
  @ZodQuery(listTasksQuery)
  @Get('tasks')
  @ApiOperation({ summary: 'List follow-up tasks, overdue first' })
  listTasks(@Query(new ZodValidationPipe(listTasksQuery)) query: z.infer<typeof listTasksQuery>) {
    return this.crm.listTasks(query);
  }

  @ZodBody(createTaskBody)
  @ZodBody(createTaskBody)
  @Post('tasks')
  @Audit({ action: 'crm.task.create', targetType: 'task' })
  @ApiOperation({ summary: 'Create a follow-up task' })
  createTask(@Body(new ZodValidationPipe(createTaskBody)) body: z.infer<typeof createTaskBody>) {
    return this.crm.createTask(body);
  }

  @Post('tasks/:id/complete')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'crm.task.complete', targetType: 'task' })
  @ApiOperation({ summary: 'Mark a follow-up task done' })
  completeTask(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.crm.completeTask(id, user.id);
  }
}
