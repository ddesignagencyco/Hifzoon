import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MushafLayout, Role } from '@hifzoon/shared';
import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { AuthenticatedUser, CurrentUser, Public, Roles } from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import { MushafService } from './mushaf.service';

export class AyahWordsQueryDto {
  @IsEnum(MushafLayout)
  layout!: MushafLayout;

  // Explicit conversion: query parameters arrive as strings, and implicit conversion
  // is off globally so it cannot quietly coerce request bodies.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(114)
  surah!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(286)
  ayah!: number;
}

@ApiTags('mushaf')
@Controller('mushaf')
export class MushafController {
  constructor(private readonly mushaf: MushafService) {}

  @Public()
  @Get('layouts')
  @ApiOperation({
    summary: 'Available Mushaf layouts and their page geometry (FR-CLS-04)',
    description: 'Indices only — safe to call without a content licence (CR-11).',
  })
  layouts() {
    return this.mushaf.layouts();
  }

  @Get('pages/:layout/:page')
  @ApiBearerAuth()
  @Roles(
    Role.STUDENT,
    Role.CHILD_STUDENT,
    Role.GUARDIAN,
    Role.TEACHER,
    Role.EXAMINER,
    Role.SUPERVISOR,
    Role.ADMIN,
    Role.SUPER_ADMIN,
  )
  @ApiOperation({
    summary: 'One Mushaf page (CLS-BE-01, FR-CLS-04)',
    description:
      'Served from a cache that expires within 7 days, as the Quran Foundation licence requires ' +
      '(CR-11). `licensed: false` means the deployment has no content licence and the client ' +
      'must not render Quran text.',
  })
  page(@Param('layout') layout: MushafLayout, @Param('page', ParseIntPipe) page: number) {
    assertLayout(layout);
    return this.mushaf.getPage(layout, page);
  }

  @Get('ayah-words')
  @ApiBearerAuth()
  @Roles(
    Role.STUDENT,
    Role.CHILD_STUDENT,
    Role.GUARDIAN,
    Role.TEACHER,
    Role.EXAMINER,
    Role.SUPERVISOR,
    Role.ADMIN,
    Role.SUPER_ADMIN,
  )
  @ApiOperation({
    summary: 'Word-level data for an ayah (CLS-BE-01)',
    description: 'Used for word highlight sync and tap-for-meaning.',
  })
  words(@Query() query: AyahWordsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    void user;
    return this.mushaf.getAyahWords(query.layout, query.surah, query.ayah);
  }

  @Delete('cache')
  @ApiBearerAuth()
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Purge the content cache (CR-11)',
    description: 'For use when a licence changes or a source correction is issued.',
  })
  @ApiQuery({ name: 'expiredOnly', required: false })
  purge(@Query('expiredOnly') expiredOnly?: string) {
    if (expiredOnly === 'true') return this.mushaf.purgeExpired();
    return this.mushaf.purgeCache();
  }
}

function assertLayout(layout: string): asserts layout is MushafLayout {
  if (!Object.values(MushafLayout).includes(layout as MushafLayout)) {
    throw AppError.badRequest(
      `Unknown Mushaf layout "${layout}". Supported: ${Object.values(MushafLayout).join(', ')}`,
    );
  }
}
