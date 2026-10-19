import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LOGIN_SECURITY, Role } from '@hifzoon/shared';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Password policy lives in shared constants so the FE shows the same rule. */
export class RegisterDto {
  @ApiProperty({ example: 'parent@example.com' })
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: LOGIN_SECURITY.PASSWORD_MIN_LENGTH, writeOnly: true })
  @IsString()
  @MinLength(LOGIN_SECURITY.PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${LOGIN_SECURITY.PASSWORD_MIN_LENGTH} characters`,
  })
  password!: string;

  @ApiProperty({ example: 'Ayesha Khan' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: '+447700900123' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ example: 'Asia/Karachi' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;

  @ApiPropertyOptional({ enum: ['en', 'ur', 'ar', 'fr'], default: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  language?: string;

  @ApiPropertyOptional({ enum: Role, description: 'Defaults to GUARDIAN' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class LoginDto {
  @ApiProperty({ example: 'parent@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MaxLength(256)
  password!: string;

  @ApiPropertyOptional({ description: 'TOTP or recovery code when 2FA is enabled' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  twoFactorCode?: string;

  @ApiPropertyOptional({ description: 'Stable identifier for this device (FR-AUTH-07)' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

export class RefreshDto {
  @ApiPropertyOptional({ description: 'Falls back to the httpOnly refresh cookie' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class TwoFactorVerifyDto {
  @ApiProperty()
  @IsString()
  @MaxLength(32)
  code!: string;
}

export class EnableTwoFactorDto {
  @ApiProperty({ description: 'The account password, re-checked before 2FA can be enabled' })
  @IsString()
  @MaxLength(256)
  password!: string;
}

export class DisableTwoFactorDto {
  @ApiPropertyOptional({ description: 'The account password' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  password?: string;

  @ApiPropertyOptional({
    description: 'A TOTP or recovery code, as an alternative to the password',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;
}

export class LogoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiPropertyOptional({ description: 'Revoke every session for this user' })
  @IsOptional()
  allSessions?: boolean;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(256)
  token!: string;

  @ApiProperty({ minLength: LOGIN_SECURITY.PASSWORD_MIN_LENGTH, writeOnly: true })
  @IsString()
  @MinLength(LOGIN_SECURITY.PASSWORD_MIN_LENGTH)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MaxLength(256)
  currentPassword!: string;

  @ApiProperty({ minLength: LOGIN_SECURITY.PASSWORD_MIN_LENGTH, writeOnly: true })
  @IsString()
  @MinLength(LOGIN_SECURITY.PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${LOGIN_SECURITY.PASSWORD_MIN_LENGTH} characters`,
  })
  @MaxLength(256)
  newPassword!: string;
}
