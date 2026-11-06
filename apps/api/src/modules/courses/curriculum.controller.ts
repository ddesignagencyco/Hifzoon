import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { AuthenticatedUser, CurrentUser, Roles } from '../../common/decorators';
import { CurriculumService, MoveDirection } from './curriculum.service';

export class UpdateLevelDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @IsInt() @Min(0) passMark?: number;
}

export class UpdateLessonDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  /** A list of lines; an empty list clears the objectives. */
  @IsOptional() @IsArray() objectives?: unknown;
  /** `{ label: value }`; an empty object clears the materials. */
  @IsOptional() @IsObject() materials?: Record<string, unknown>;
  /** Empty string or null clears the notes. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  teacherNotes?: string | null;
}

export class MoveDto {
  @IsIn(['up', 'down']) direction!: MoveDirection;
}

/**
 * Admin curriculum editing (FR-CRS-01): rename, reorder and delete what the course builder
 * created. Every write is audited. Creating levels and lessons lives in CoursesController.
 */
@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
export class CurriculumController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Get(':courseId/curriculum')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'A course as the admin builder edits it (FR-CRS-01)',
    description: 'Includes teacher notes and the number of live enrolments on each lesson.',
  })
  adminCourse(@Param('courseId') courseId: string) {
    return this.curriculum.adminCourse(courseId);
  }

  @Patch('levels/:levelId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rename a level or change its pass mark (FR-CRS-01)' })
  updateLevel(
    @Param('levelId') levelId: string,
    @Body() dto: UpdateLevelDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.curriculum.updateLevel({ levelId, ...dto, actorUserId: user.id });
  }

  @Patch('levels/:levelId/move')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a level up or down one place (FR-CRS-01)' })
  moveLevel(
    @Param('levelId') levelId: string,
    @Body() dto: MoveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.curriculum.moveLevel({ levelId, direction: dto.direction, actorUserId: user.id });
  }

  @Patch('lessons/:lessonId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edit a lesson: title, objectives, materials, teacher notes' })
  updateLesson(
    @Param('lessonId') lessonId: string,
    @Body() dto: UpdateLessonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.curriculum.updateLesson({ lessonId, ...dto, actorUserId: user.id });
  }

  @Patch('lessons/:lessonId/move')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move a lesson up or down one place within its level',
    description: 'Enrolments on either lesson move with it, so each student keeps their lesson.',
  })
  moveLesson(
    @Param('lessonId') lessonId: string,
    @Body() dto: MoveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.curriculum.moveLesson({ lessonId, direction: dto.direction, actorUserId: user.id });
  }

  @Delete('lessons/:lessonId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a lesson (409 while a live enrolment is on it)',
    description: 'Later lessons move up one place; enrolment pointers move with them.',
  })
  deleteLesson(@Param('lessonId') lessonId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.curriculum.deleteLesson({ lessonId, actorUserId: user.id });
  }
}
