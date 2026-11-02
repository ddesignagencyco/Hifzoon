import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@hifzoon/shared';
import { IsString, MaxLength } from 'class-validator';

import { Public, Roles } from '../../common/decorators';
import { ApplicantTrainingService } from './applicant-training.service';

export class TrainingTokenDto {
  @IsString() @MaxLength(256) token!: string;
}

export class AcknowledgeModuleDto extends TrainingTokenDto {
  @IsString() @MaxLength(40) moduleId!: string;
}

/**
 * The applicant's training course (the TRAINING hiring step) and the hiring team's link
 * to it. Applicant routes are `@Public`: the emailed token is the credential and travels
 * in the body, never in an API path.
 */
@ApiTags('applicant-training')
@Controller('applicant-training')
export class ApplicantTrainingController {
  constructor(private readonly training: ApplicantTrainingService) {}

  @Post('applications/:id/send')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SUPERVISOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email (or re-email) the training link to an applicant' })
  send(@Param('id', ParseUUIDPipe) id: string) {
    return this.training.send(id);
  }

  @Public()
  @Post('session')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'The course and the applicant’s progress' })
  session(@Body() dto: TrainingTokenDto) {
    return this.training.session(dto.token);
  }

  @Public()
  @Post('acknowledge')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirm a module was read and understood' })
  acknowledge(@Body() dto: AcknowledgeModuleDto) {
    return this.training.acknowledge(dto.token, dto.moduleId);
  }

  @Public()
  @Post('terms')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Accept the teacher terms, which completes the training' })
  acceptTerms(@Body() dto: TrainingTokenDto) {
    return this.training.acceptTerms(dto.token);
  }
}
