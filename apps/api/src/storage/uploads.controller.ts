import { randomUUID } from 'node:crypto';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsString, MaxLength, Min } from 'class-validator';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../common/decorators';
import { AppError } from '../common/errors/app-error';
import { StorageService } from './storage.service';

/**
 * What may be uploaded, and what that means for the client.
 *
 * The limit is part of the contract, not a surprise: the audition and the supporting
 * documents are the two things a teacher sends before any account exists, and both are
 * user-generated media that a public endpoint will happily receive.
 */
export const UPLOAD_RULES = {
  RECITATION_AUDIO: {
    extensions: ['webm', 'mp3', 'wav', 'm4a'],
    contentTypes: [
      'audio/webm',
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/mp4',
      'audio/m4a',
    ],
    maxBytes: 25 * 1024 * 1024,
  },
  APPLICATION_DOCUMENT: {
    extensions: ['pdf', 'jpg', 'jpeg', 'png'],
    contentTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maxBytes: 10 * 1024 * 1024,
  },
} as const;

const EXTENSION_BY_TYPE: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export type UploadKind = keyof typeof UPLOAD_RULES;

export class PresignUploadDto {
  @IsEnum({ RECITATION_AUDIO: 'RECITATION_AUDIO', APPLICATION_DOCUMENT: 'APPLICATION_DOCUMENT' })
  kind!: UploadKind;

  @IsString()
  @MaxLength(160)
  contentType!: string;

  @IsInt()
  @Min(1)
  size!: number;
}

/**
 * Direct-to-storage uploads (M34, §7.5).
 *
 * The alternative was what the web had to fall back on: a recorded audition inlined into
 * a JSON body as a data URL. That put ~1.4 MB of base64 through a 2 MB body limit, meant
 * documents could not be attached at all, and made the browser hold a whole recording in
 * memory to send it.
 *
 * With a presigned PUT the browser sends bytes straight to MinIO/S3: no size limit on the
 * API, no base64 tax, and the object is private until something reads it through a signed
 * GET. The endpoint is `@Public()` because an applicant has no account yet — which is why
 * the kind, the content type and the size are all checked here rather than trusted, and
 * why it is rate limited.
 */
@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Public()
  @Post('presign')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Presign a direct upload (M34, §7.5)',
    description:
      'Returns a signed PUT the browser can send the file to, plus the key to record in ' +
      'the application or profile. `audio/webm|mp3|wav|m4a` up to 25 MB for a recitation ' +
      'sample; `application/pdf`, `image/jpeg`, `image/png` up to 10 MB for a document.',
  })
  async presign(@Body() dto: PresignUploadDto) {
    const rule = UPLOAD_RULES[dto.kind as UploadKind];
    if (!rule) throw AppError.badRequest('Unknown upload kind', { field: 'kind' });

    const contentType = dto.contentType.toLowerCase().split(';')[0].trim();
    const allowed: readonly string[] = rule.contentTypes;
    if (!allowed.includes(contentType)) {
      throw AppError.badRequest(`Content type not accepted for ${dto.kind}`, {
        field: 'contentType',
        allowed: rule.contentTypes,
      });
    }

    // Checked here because the signed PUT goes straight to storage: the API never sees the
    // bytes, so this is the only place the declared size can be refused.
    if (dto.size > rule.maxBytes) {
      throw AppError.badRequest(
        `A ${dto.kind.replace('_', ' ').toLowerCase()} may be at most ${Math.floor(rule.maxBytes / 1024 / 1024)} MB`,
        { field: 'size', maxBytes: rule.maxBytes },
      );
    }

    const extension = EXTENSION_BY_TYPE[contentType] ?? 'bin';
    const key = this.storage.buildKey(
      dto.kind === 'RECITATION_AUDIO' ? 'recitations' : 'documents',
      `${new Date().getUTCFullYear()}`,
      `${randomUUID()}.${extension}`,
    );

    const url = await this.storage.signedUploadUrl(key, contentType, dto.size);
    return {
      key,
      url,
      method: 'PUT' as const,
      headers: { 'Content-Type': contentType, 'Content-Length': String(dto.size) },
      expiresInSeconds: this.storage.signedUploadTtlSeconds,
      maxBytes: rule.maxBytes,
    };
  }
}
