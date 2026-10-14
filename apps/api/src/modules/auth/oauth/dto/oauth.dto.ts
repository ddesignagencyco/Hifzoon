import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class OAuthStartDto {
  @ApiProperty({
    example: 'http://localhost:3000/auth/callback',
    description:
      'Must be registered with the provider and must belong to an origin in CORS_ORIGINS.',
  })
  @IsString()
  @MaxLength(512)
  redirectUri!: string;
}

export class OAuthCallbackDto {
  @ApiProperty({ description: 'The `code` the provider redirected back with' })
  @IsString()
  @MaxLength(4096)
  code!: string;

  @ApiProperty({ description: 'The `state` returned by /auth/oauth/:provider/start' })
  @IsString()
  @MaxLength(256)
  state!: string;

  @ApiProperty({ example: 'http://localhost:3000/auth/callback' })
  @IsString()
  @MaxLength(512)
  redirectUri!: string;

  @ApiPropertyOptional({
    description: 'Apple sends this as `id_token` in the form_post callback',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  id_token?: string;

  @ApiPropertyOptional({ description: 'Apple returns the user name once, on first sign-in' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  user?: string;
}

export class OAuthProviderParam {
  @ApiProperty({ enum: ['google', 'apple'] })
  @IsEnum(['google', 'apple'] as never)
  provider!: string;
}