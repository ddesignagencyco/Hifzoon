import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Matches,
  MinLength,
} from 'class-validator';
import { Gender, LOGIN_SECURITY, Role } from '@hifzoon/shared';

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
  @IsOptional() @IsString() @MaxLength(160) billingName?: string;
  @IsOptional() billingAddress?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(64) timeZone?: string;
}

export class AddGuardianDto {
  // STU-03 — a guardian is invited by email, so it must be a valid address, not any string.
  @IsEmail()
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

/** FR-AUTH-03 — the guardian sets the child's address and password; nothing is emailed. */
export class SetKidsPinDto {
  // Length and format only; FamiliesService also refuses repeated or counting digits.
  @ApiProperty({ example: '4826', writeOnly: true })
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'The PIN must be 4 to 6 digits' })
  pin!: string;
}

export class CreateStudentLoginDto {
  @ApiProperty({ example: 'zara@example.com' })
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(320)
  email!: string;

  // The register DTO's rule, from the same shared constant.
  @ApiProperty({ minLength: LOGIN_SECURITY.PASSWORD_MIN_LENGTH, writeOnly: true })
  @IsString()
  @MinLength(LOGIN_SECURITY.PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${LOGIN_SECURITY.PASSWORD_MIN_LENGTH} characters`,
  })
  @MaxLength(256)
  password!: string;
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

  // ── Child's own login (FR-AUTH-03) ────────────────────────────────────────

  @Post(':familyId/students/:studentId/login')
  @Roles(Role.GUARDIAN)
  @ApiOperation({
    summary: 'Give a child aged 13+ their own login (FR-AUTH-03)',
    description:
      'The guardian sets the email and password. Creates a STUDENT account, links it to the child and turns kids mode off. Never returns the password or its hash.',
  })
  createStudentLogin(
    @Param('familyId') familyId: string,
    @Param('studentId') studentId: string,
    @Body() dto: CreateStudentLoginDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.families.createStudentLogin({
      familyId,
      studentId,
      actorUserId: user.id,
      email: dto.email,
      password: dto.password,
    });
  }

  @Delete(':familyId/students/:studentId/login')
  @Roles(Role.GUARDIAN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Remove a child's own login (FR-AUTH-03)",
    description:
      'Disables the account and revokes its sessions; the account row is kept because other records may reference it.',
  })
  removeStudentLogin(
    @Param('familyId') familyId: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.families.removeStudentLogin({ familyId, studentId, actorUserId: user.id });
  }

  // ── Kids PIN sign-in (FR-AUTH-03) ─────────────────────────────────────────

  @Put(':familyId/students/:studentId/kids-pin')
  @Roles(Role.GUARDIAN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set or reset the PIN a child in kids mode signs in with',
    description:
      'The child signs in with the guardian email, their name and this PIN. The first PIN creates ' +
      'a password-less CHILD_STUDENT account linked to the child; a reset signs out every session ' +
      'started with the old PIN. Audited; never returns the PIN or its hash.',
  })
  setKidsPin(
    @Param('familyId') familyId: string,
    @Param('studentId') studentId: string,
    @Body() dto: SetKidsPinDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.families.setKidsPin({ familyId, studentId, actorUserId: user.id, pin: dto.pin });
  }

  @Delete(':familyId/students/:studentId/kids-pin')
  @Roles(Role.GUARDIAN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Remove a child's kids PIN",
    description: 'Switches the PIN account off and ends its sessions. Audited.',
  })
  removeKidsPin(
    @Param('familyId') familyId: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.families.removeKidsPin({ familyId, studentId, actorUserId: user.id });
  }
}
