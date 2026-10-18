import { Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MUSHAF_MAX_PAGE, MUSHAF_MIN_PAGE, PageState, Role } from '@hifzoon/shared';
import { z } from 'zod';

import { Audit, CurrentUser, type AuthenticatedUser, Roles } from '../../common/decorators';
import { ZodQuery } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { HifzService } from './hifz.service';

const listPagesQuery = z.object({
  state: z.nativeEnum(PageState).optional(),
  fromPage: z.coerce.number().int().min(MUSHAF_MIN_PAGE).max(MUSHAF_MAX_PAGE).optional(),
  toPage: z.coerce.number().int().min(MUSHAF_MIN_PAGE).max(MUSHAF_MAX_PAGE).optional(),
});

/**
 * Page-state reads for the heat map (FR-HFZ-01, FR-HFZ-05) and the one-time
 * initialisation that gives a student their 604 rows.
 *
 * The URL carries `:studentId` for routing only — every handler re-derives access from
 * `PolicyService` inside the service, so a guardian cannot read another family's pages
 * by changing the id.
 */
@ApiTags('hifz')
@ApiBearerAuth()
@Controller('hifz')
@Roles(
  Role.GUARDIAN,
  Role.TEACHER,
  Role.STUDENT,
  Role.CHILD_STUDENT,
  Role.SUPERVISOR,
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.SAFEGUARDING_LEAD,
)
export class HifzController {
  constructor(private readonly hifz: HifzService) {}

  @ZodQuery(listPagesQuery)
  @Get('students/:studentId/pages')
  @ApiOperation({ summary: 'Page-state rows for a student (FR-HFZ-01)' })
  listPages(
    @Param('studentId') studentId: string,
    @Query(new ZodValidationPipe(listPagesQuery)) query: z.infer<typeof listPagesQuery>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hifz.listPageStates({ userId: user.id, roles: user.roles }, studentId, query);
  }

  @Get('students/:studentId/pages/:pageNumber')
  @ApiOperation({ summary: 'A single Mushaf page state' })
  getPage(
    @Param('studentId') studentId: string,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hifz.getPageState({ userId: user.id, roles: user.roles }, studentId, pageNumber);
  }

  @Post('students/:studentId/pages/initialize')
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'hfz.pages.initialize', targetType: 'student_page_state' })
  @ApiOperation({ summary: 'Materialise the 604 page-state rows for a student (FR-HFZ-01)' })
  initializePages(
    @Param('studentId') studentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hifz.initializePageStates({ userId: user.id, roles: user.roles }, studentId);
  }
}
