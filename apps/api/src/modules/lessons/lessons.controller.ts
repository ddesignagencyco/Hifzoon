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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Grade, MistakeType, PortionKind, Role } from '@hifzoon/shared';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { AuthenticatedUser, CurrentUser, Roles } from '../../common/decorators';
import { LessonCardsService } from './lesson-cards.service';
import { MistakesService } from './mistakes.service';

export class MarkMistakeDto {
  @IsString() studentId!: string;
  @IsInt() @Min(1) surah!: number;
  @IsInt() @Min(1) ayah!: number;
  @IsInt() @Min(0) wordIndex!: number;
  @IsEnum(MistakeType) type!: MistakeType;
  @IsOptional() @IsString() @MaxLength(80) tajweedRule?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
}

export class PortionDto {
  @IsEnum(PortionKind) kind!: PortionKind;
  @IsOptional() @IsInt() @Min(1) fromSurah?: number;
  @IsOptional() @IsInt() @Min(1) fromAyah?: number;
  @IsOptional() @IsInt() @Min(1) toSurah?: number;
  @IsOptional() @IsInt() @Min(1) toAyah?: number;
  @IsOptional() @IsEnum(Grade) grade?: Grade;
}

export class SubmitLessonCardDto {
  @IsOptional() @IsString() @MaxLength(2000) homework?: string;
  @IsOptional() @IsString() @MaxLength(2000) parentNote?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PortionDto)
  portions!: PortionDto[];
}

export class UpdateLessonCardDto {
  @IsOptional() @IsString() @MaxLength(2000) homework?: string;
  @IsOptional() @IsString() @MaxLength(2000) parentNote?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PortionDto)
  portions?: PortionDto[];

  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class AiDraftDto {
  @IsString() @MinLength(1) @MaxLength(4000) draft!: string;
}

export class MistakeListQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(MistakeType) type?: MistakeType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

@ApiTags('lessons')
@ApiBearerAuth()
@Controller()
export class LessonsController {
  constructor(
    private readonly mistakes: MistakesService,
    private readonly cards: LessonCardsService,
  ) {}

  // ── Mistakes (FR-REC-01, FR-REC-02) ───────────────────────────────────────

  @Post('classes/:classId/mistakes')
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Mark a mistake during a class (FR-REC-01, FR-REC-02)',
    description:
      'A mistake is a position (surah, ayah, word index) of one of six kinds, recorded against ' +
      'a student who is in this class. The socket event of the same name only updates the UI; ' +
      'this endpoint is where the record is created, validated and authorised.',
  })
  mark(
    @Param('classId') classId: string,
    @Body() dto: MarkMistakeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mistakes.mark({
      classId,
      ...dto,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
      actorUserId: user.id,
    });
  }

  @Get('classes/:classId/mistakes')
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({ summary: 'Mistakes marked in a class (FR-REC-04, used to prefill the card)' })
  listForClass(@Param('classId') classId: string) {
    return this.mistakes.listForClass(classId);
  }

  @Get('students/:studentId/mistakes')
  @ApiOperation({ summary: 'Mistake history for a student (FR-REC-02)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'type', required: false, enum: MistakeType })
  listForStudent(@Param('studentId') studentId: string, @Query() query: MistakeListQuery) {
    return this.mistakes.listForStudent(studentId, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      type: query.type,
      limit: query.limit,
    });
  }

  @Post('mistakes/:mistakeId/dismiss')
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dismiss an AI-flagged mistake (FR-AIC-07)',
    description: 'The row is kept, not deleted, so the false-positive rate stays measurable.',
  })
  dismiss(
    @Param('mistakeId') mistakeId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mistakes.dismiss(mistakeId, user.id, body?.reason);
  }

  @Post('mistakes/:mistakeId/confirm')
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm an AI-flagged mistake (FR-AIC-07)' })
  confirm(@Param('mistakeId') mistakeId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.mistakes.confirm(mistakeId, user.id);
  }

  // ── Lesson cards (FR-REC-03 … FR-REC-06) ──────────────────────────────────

  @Get('classes/:classId/lesson-card/prefill')
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Prefill a lesson card from the class (FR-REC-04)',
    description:
      'Returns pages shown, mistakes marked and attendance, with a proposed Sabaq. The teacher ' +
      'confirms rather than retypes — the product target is under two minutes.',
  })
  prefill(@Param('classId') classId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cards.prefill(classId, user.id);
  }

  @Post('classes/:classId/lesson-card')
  @Roles(Role.TEACHER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a lesson card (FR-REC-03)',
    description:
      'Starts the 48-hour clock and schedules the family notification for within 15 minutes ' +
      '(FR-REC-06). Submitting twice returns 409.',
  })
  submit(
    @Param('classId') classId: string,
    @Body() dto: SubmitLessonCardDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cards.submit({ classId, ...dto }, user);
  }

  @Get('lesson-cards/:lessonCardId')
  @ApiOperation({
    summary: 'Read a lesson card (FR-REC-06, PAR-BE-02)',
    description:
      'Guardians see only cards that have been shared, and never see an unapproved AI summary ' +
      'draft (FR-REC-05).',
  })
  get(@Param('lessonCardId') lessonCardId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cards.get(lessonCardId, user);
  }

  @Get('students/:studentId/lesson-cards')
  @ApiOperation({ summary: 'Lesson card history for a student (FR-PAR-02)' })
  list(@Param('studentId') studentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cards.listForStudent(studentId, user);
  }

  @Patch('lesson-cards/:lessonCardId')
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Edit a lesson card (FR-REC-08)',
    description:
      'Within 48 hours the class teacher may edit freely. After that only a supervisor may, and ' +
      'every such edit is written to the edit log with before and after. A supervisor edit ' +
      'after the lock must state a reason.',
  })
  update(
    @Param('lessonCardId') lessonCardId: string,
    @Body() dto: UpdateLessonCardDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cards.update(lessonCardId, dto, user);
  }

  @Get('lesson-cards/:lessonCardId/edit-log')
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Edit history for a lesson card (FR-REC-08)',
    description: 'What changed, when, by whom and why — answerable without an argument.',
  })
  editLog(@Param('lessonCardId') lessonCardId: string) {
    return this.cards.editLog(lessonCardId);
  }

  @Patch('lesson-cards/:lessonCardId/ai-draft')
  @Roles(Role.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Save the AI summary draft (FR-REC-05)',
    description: 'A draft is never sent to the family until the teacher approves it.',
  })
  saveDraft(
    @Param('lessonCardId') lessonCardId: string,
    @Body() dto: AiDraftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cards.saveAiDraft(lessonCardId, dto.draft, user.id);
  }

  @Post('lesson-cards/:lessonCardId/ai-draft/approve')
  @Roles(Role.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve and send the summary (FR-REC-05)',
    description: 'Approval is the gate. Until it happens the family sees the raw lesson card only.',
  })
  approveDraft(
    @Param('lessonCardId') lessonCardId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cards.approveAiSummary(lessonCardId, user.id);
  }
}
