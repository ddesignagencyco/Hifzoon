import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import {
  Audit,
  CurrentUser,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import { ZodBody } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminFamiliesService } from './admin-families.service';

const familyPatch = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    country: z.string().length(2).nullable().optional(),
    timeZone: z.string().min(1).max(64).optional(),
    billingName: z.string().trim().max(160).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Send at least one field to change' });

const studentPatch = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    birthYear: z.number().int().min(1930).max(2100).optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    language: z.string().min(2).max(5).optional(),
    timeZone: z.string().min(1).max(64).optional(),
    kidsMode: z.boolean().optional(),
    notes: z.string().max(4000).nullable().optional(),
    mushafLayout: z.enum(['MADANI_15', 'INDOPAK_13', 'INDOPAK_16']).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Send at least one field to change' });

/**
 * Staff screens for families, children and analytics (FR-OPS). Access goes through the
 * configurable role matrix (`RequirePermission`), so a super admin can widen or narrow who
 * may use them without a deploy; the defaults are ADMIN and SUPER_ADMIN.
 */
@ApiTags('admin/ops')
@ApiBearerAuth()
@Controller('admin/ops')
export class AdminOpsController {
  constructor(
    private readonly families: AdminFamiliesService,
    private readonly analytics: AdminAnalyticsService,
  ) {}

  @Get('families/:familyId')
  @RequirePermission('families.view')
  @ApiOperation({ summary: 'A family in one read: guardians, children, plans, invoices, balances' })
  family(@Param('familyId', new ParseUUIDPipe()) familyId: string) {
    return this.families.getFamily(familyId);
  }

  @ZodBody(familyPatch)
  @Patch('families/:familyId')
  @RequirePermission('families.edit')
  @Audit({ action: 'ops.family.update', targetType: 'family', captureBody: false })
  @ApiOperation({ summary: 'Edit a family’s name, country, time zone or billing name' })
  updateFamily(
    @Param('familyId', new ParseUUIDPipe()) familyId: string,
    @Body(new ZodValidationPipe(familyPatch)) body: z.infer<typeof familyPatch>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.families.updateFamily(familyId, body, user.id);
  }

  @Get('students/:studentId')
  @RequirePermission('families.view')
  @ApiOperation({ summary: 'A child with enrolments, teachers and recent classes' })
  student(@Param('studentId', new ParseUUIDPipe()) studentId: string) {
    return this.families.getStudent(studentId);
  }

  @ZodBody(studentPatch)
  @Patch('students/:studentId')
  @RequirePermission('families.edit')
  @Audit({ action: 'ops.student.update', targetType: 'student', captureBody: false })
  @ApiOperation({ summary: 'Edit a child’s profile details' })
  updateStudent(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Body(new ZodValidationPipe(studentPatch)) body: z.infer<typeof studentPatch>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.families.updateStudent(studentId, body, user.id);
  }

  @Get('analytics')
  @RequirePermission('analytics.view')
  @ApiOperation({
    summary: 'Revenue, churn, teacher utilisation and class completion by week or month',
  })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'granularity', required: false, enum: ['week', 'month'] })
  report(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('granularity') granularity?: string,
  ) {
    const parse = (v?: string) => (v ? new Date(v) : undefined);
    const f = parse(from);
    const t = parse(to);
    if ((f && Number.isNaN(f.getTime())) || (t && Number.isNaN(t.getTime()))) {
      throw AppError.badRequest('from and to are dates');
    }
    return this.analytics.report({
      from: f,
      to: t,
      granularity: granularity as 'week' | 'month' | undefined,
    });
  }
}
