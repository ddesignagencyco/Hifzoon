import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Currency, Gender, Role } from '@hifzoon/shared';

import { AuthenticatedUser, CurrentUser, Roles } from '../../common/decorators';
import { FamiliesService } from './families.service';

/** Swagger metadata documenting the data-minimisation rule (ERD section 2.2). */
const ApiBirthYear = () =>
  ApiProperty({
    example: 2016,
    description:
      'Birth year only — the full date of birth is deliberately not collected (data minimisation, CR-04).',
  });

export class CreateFamilyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  billingName?: string;

  @IsOptional()
  billingAddress?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;
}

export class UpdateFamilyDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(2) country?: string;
  @IsOptional() @IsEnum(Currency) currency?: Currency;
  @IsOptional() @IsString() @MaxLength(160) billingName?: string;
  @IsOptional() billingAddress?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(64) timeZone?: string;
}

export class AddGuardianDto {
  @IsString()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MaxLength(40)
  relationship!: string;
}

export class AddStudentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @ApiBirthYear()
  @IsInt()
  @Min(1990, { message: 'Birth year must be between 1990 and the current year' })
  @Max(new Date().getUTCFullYear(), { message: 'Birth year cannot be in the future' })
  birthYear!: number;

  @IsEnum(Gender)
  gender!: Gender;

  @IsOptional() @IsString() @MaxLength(5) language?: string;
  @IsOptional() @IsString() @MaxLength(64) timeZone?: string;
  @IsOptional() @IsBoolean() kidsMode?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateStudentDto {
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @IsOptional()
  @IsInt()
  @Min(1990)
  @Max(new Date().getUTCFullYear())
  birthYear?: number;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsString() @MaxLength(5) language?: string;
  @IsOptional() @IsString() @MaxLength(64) timeZone?: string;
  @IsOptional() @IsBoolean() kidsMode?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

@ApiTags('families')
@ApiBearerAuth()
@Controller('families')
export class FamiliesController {
  constructor(private readonly families: FamiliesService) {}

  @Post()
  @Roles(Role.GUARDIAN)
  @ApiOperation({ summary: 'Create a family account (AUTH-BE-05, FR-AUTH-03)' })
  create(@Body() dto: CreateFamilyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.families.createFamilyForGuardian({ ...dto, userId: user.id });
  }

  @Get()
  @ApiOperation({ summary: 'Families the signed-in user belongs to' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.families.listForUser(user.id);
  }

  @Get(':familyId')
  @ApiOperation({ summary: 'Family with guardians and children (FR-AUTH-03)' })
  get(@Param('familyId') familyId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.families.getFamily(familyId, user.id);
  }

  @Patch(':familyId')
  @Roles(Role.GUARDIAN)
  update(
    @Param('familyId') familyId: string,
    @Body() dto: UpdateFamilyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.families.updateFamily(familyId, user.id, dto);
  }

  // ── Guardians ─────────────────────────────────────────────────────────────

  @Post(':familyId/guardians')
  @Roles(Role.GUARDIAN)
  @ApiOperation({
    summary: 'Add another guardian (FR-AUTH-03)',
    description: 'The new guardian is unverified until they complete CR-10 verification.',
  })
  addGuardian(
    @Param('familyId') familyId: string,
    @Body() dto: AddGuardianDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.families.addGuardian({ familyId, actorUserId: user.id, ...dto });
  }

  @Get(':familyId/guardians')
  @ApiOperation({ summary: 'List guardians and their verification state (CR-10)' })
  listGuardians(@Param('familyId') familyId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.families.listGuardians(familyId, user.id);
  }

  // ── Students ──────────────────────────────────────────────────────────────

  @Post(':familyId/students')
  @Roles(Role.GUARDIAN)
  @ApiOperation({
    summary: 'Add a child, who needs no email address (FR-AUTH-03)',
    description:
      'Returns `requiresConsent: true` for children under 13 until DATA_COLLECTION consent is granted (CR-01).',
  })
  addStudent(
    @Param('familyId') familyId: string,
    @Body() dto: AddStudentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.families.addStudent({ familyId, actorUserId: user.id, ...dto });
  }

  @Get(':familyId/students')
  @ApiOperation({ summary: 'List children in the family' })
  listStudents(@Param('familyId') familyId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.families.listStudents(familyId, user.id);
  }

  @Patch('students/:studentId')
  @Roles(Role.GUARDIAN)
  @HttpCode(HttpStatus.OK)
  updateStudent(
    @Param('studentId') studentId: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.families.updateStudent(studentId, user.id, dto);
  }
}
