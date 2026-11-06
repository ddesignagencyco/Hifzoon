import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@hifzoon/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { Response } from 'express';

import { AuthenticatedUser, CurrentUser, Public, Roles } from '../../common/decorators';
import { TeacherOnboardingService } from './teacher-onboarding.service';

export class OnboardingUploadDto {
  @IsString() @MaxLength(16) kind!: string;
  @IsString() @MaxLength(160) contentType!: string;
  @IsInt() size!: number;
}

export class OnboardingCertificateDto {
  @IsString() @MaxLength(512) key!: string;
  @IsString() @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(160) issuer?: string;
  @IsOptional() @IsInt() year?: number;
}

export class SubmitOnboardingDto {
  // Length is checked by the service so the message can say how long the bio is.
  @IsString() @MaxLength(4000) bio!: string;
  @IsOptional() @IsString() @MaxLength(512) photoKey?: string;
  @IsOptional() @IsString() @MaxLength(512) introVideoKey?: string;
  @IsOptional() @IsString() @MaxLength(512) recitationSampleKey?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => OnboardingCertificateDto)
  certificates?: OnboardingCertificateDto[];
}

/** The one-time profile setup a newly approved teacher completes before using the portal. */
@ApiTags('teachers')
@Controller('teachers')
export class TeacherOnboardingController {
  constructor(private readonly onboarding: TeacherOnboardingService) {}

  @Get('me/onboarding')
  @ApiBearerAuth()
  @Roles(Role.TEACHER)
  @ApiOperation({
    summary: 'Your profile setup status',
    description:
      '`required` is false for staff who also hold TEACHER. `complete` is true once the setup ' +
      'was submitted; it is never asked again.',
  })
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.status(user);
  }

  @Post('me/uploads')
  @ApiBearerAuth()
  @Roles(Role.TEACHER)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 600_000 } })
  @ApiOperation({
    summary: 'Presign a profile upload',
    description:
      'kind `photo` (jpg/png/webp, 5 MB), `certificate` (pdf/jpg/png, 10 MB) or `media` ' +
      '(audio or video, 50 MB). Returns a signed PUT and the key to submit.',
  })
  upload(@Body() dto: OnboardingUploadDto, @CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.presignUpload(user.id, dto);
  }

  @Post('me/onboarding')
  @ApiBearerAuth()
  @Roles(Role.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit your profile setup',
    description:
      'Requires a bio of 80-1500 characters; the photo, intro video, recitation and ' +
      'certificates are optional. Saved directly and marks the setup complete.',
  })
  submit(@Body() dto: SubmitOnboardingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.submit(user, dto);
  }

  @Public()
  @Get('files/:profileId/:file')
  @ApiOperation({
    summary: "A teacher's public profile photo or media",
    description: 'Redirects to a short-lived signed link. Certificates are never served here.',
  })
  async file(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('file') file: string,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.onboarding.publicFileUrl(profileId, file);
    // Shorter than the signed link's lifetime, so a cached redirect never points at an expired one.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.redirect(302, url);
  }
}
