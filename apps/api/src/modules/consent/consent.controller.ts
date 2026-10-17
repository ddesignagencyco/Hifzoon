import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ConsentMethod, ConsentPurpose, DataRequestType, Role } from '@hifzoon/shared';
import { Request } from 'express';

import { AuthenticatedUser, CurrentUser, Roles } from '../../common/decorators';
import { PolicyService } from '../../common/services/policy.service';
import { ConsentService } from './consent.service';

export class GrantConsentDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ConsentPurpose, { each: true })
  purposes!: ConsentPurpose[];

  @IsEnum(ConsentMethod)
  method!: ConsentMethod;

  @IsString()
  @MaxLength(32)
  policyVersion!: string;
}

export class WithdrawConsentDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ConsentPurpose, { each: true })
  purposes!: ConsentPurpose[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class GuardianVerifyDto {
  @IsString()
  @MaxLength(16)
  code!: string;
}

export class DataRequestDto {
  @IsEnum(DataRequestType)
  type!: DataRequestType;

  @IsOptional()
  @IsString()
  studentId?: string;
}

@ApiTags('consent')
@ApiBearerAuth()
@Controller('consent')
export class ConsentController {
  constructor(
    private readonly consent: ConsentService,
    private readonly policies: PolicyService,
  ) {}

  @Get('students/:studentId')
  @Roles(Role.GUARDIAN, Role.TEACHER, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Consent state per purpose for a student (FR-AUTH-04, CR-01)',
    description:
      'Teachers may read this for their own students — the classroom needs it to decide whether ' +
      'recording is permitted (FR-CLS-12). Guardians may only read their own children; both are ' +
      'enforced by PolicyService.',
  })
  forStudent(@Param('studentId') studentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assertAccess(user, studentId).then(() => this.consent.getForStudent(studentId));
  }

  @Post('students/:studentId/grant')
  @Roles(Role.GUARDIAN)
  @ApiOperation({
    summary: 'Grant consent for one or more purposes (FR-AUTH-04)',
    description: 'Purposes are independent. AI_TRAINING requires its own explicit opt-in (CR-06).',
  })
  grant(
    @Param('studentId') studentId: string,
    @Body() dto: GrantConsentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.consent.grant({
      studentId,
      purposes: dto.purposes,
      method: dto.method,
      policyVersion: dto.policyVersion,
      actorUserId: user.id,
      ip: req.ip,
    });
  }

  @Post('students/:studentId/withdraw')
  @Roles(Role.GUARDIAN)
  @ApiOperation({
    summary: 'Withdraw consent (FR-AUTH-04, CR-06)',
    description:
      'Withdrawal is recorded as an event; the original grant is never deleted. Consequences ' +
      '(recording stop, practice audio removal) are applied immediately.',
  })
  withdraw(
    @Param('studentId') studentId: string,
    @Body() dto: WithdrawConsentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.consent.withdraw({
      studentId,
      purposes: dto.purposes,
      actorUserId: user.id,
      reason: dto.reason,
      ip: req.ip,
    });
  }

  // ── Guardian verification (CR-10) ─────────────────────────────────────────

  @Post('families/:familyId/verify/start')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(Role.GUARDIAN)
  @ApiOperation({
    summary: 'Start guardian verification (CR-10)',
    description: "Sends a 6-digit code to the family's primary guardian.",
  })
  startVerification(@Param('familyId') familyId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assertFamilyAccess(user, familyId).then(() =>
      this.consent.startGuardianVerification({ familyId, requesterUserId: user.id }),
    );
  }

  @Post('families/:familyId/verify/confirm')
  @Roles(Role.GUARDIAN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm guardian verification with the emailed code (CR-10)' })
  confirmVerification(
    @Param('familyId') familyId: string,
    @Body() dto: GuardianVerifyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assertFamilyAccess(user, familyId).then(() =>
      this.consent.confirmGuardianVerification({ familyId, userId: user.id, code: dto.code }),
    );
  }

  // ── CR-05 data requests ───────────────────────────────────────────────────

  @Post('families/:familyId/data-requests')
  @Roles(Role.GUARDIAN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request an export or deletion of personal data (FR-AUTH-05, CR-05)',
    description: 'Processed asynchronously with a 30 day SLA.',
  })
  requestData(
    @Param('familyId') familyId: string,
    @Body() dto: DataRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assertFamilyAccess(user, familyId).then(() =>
      this.consent.requestDataRequest({
        familyId,
        studentId: dto.studentId,
        type: dto.type,
        actorUserId: user.id,
      }),
    );
  }

  @Get('families/:familyId/data-requests')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  listDataRequests(@Param('familyId') familyId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assertFamilyAccess(user, familyId).then(() =>
      this.consent.listDataRequests(familyId),
    );
  }

  @Get('families/:familyId/privacy-summary')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Everything held about a family, for the privacy centre (CR-05)' })
  privacySummary(@Param('familyId') familyId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assertFamilyAccess(user, familyId).then(() =>
      this.consent.privacySummary(familyId),
    );
  }

  private async assertAccess(user: AuthenticatedUser, id: string): Promise<void> {
    await this.policies.assertStudentAccess({ userId: user.id, roles: user.roles }, id);
  }

  private async assertFamilyAccess(user: AuthenticatedUser, familyId: string): Promise<void> {
    if (
      user.roles.some((r) =>
        ['ADMIN', 'SUPER_ADMIN', 'SUPERVISOR', 'SAFEGUARDING_LEAD'].includes(r),
      )
    ) {
      return;
    }
    await this.policies.assertGuardianInFamily(user.id, familyId);
  }
}
