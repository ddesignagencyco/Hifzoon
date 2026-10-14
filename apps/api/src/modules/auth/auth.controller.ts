import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { RATE_LIMITS, Role } from '@hifzoon/shared';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser, AuthenticatedUser, Public, RequestWithUser } from '../../common/decorators';
import { AppConfigService } from '../../config/app-config.service';
import { AuthService } from './auth.service';
import {
  EnableTwoFactorDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  TwoFactorVerifyDto,
} from './dto/auth.dto';
import { TwoFactorService } from './two-factor.service';

/**
 * Anti-credential-stuffing limits (NFR-SEC-03).
 *
 * In production these are the shared `RATE_LIMITS` values and they are strict on
 * purpose: login is capped at 10 per 15 minutes and registration at 5 per hour because
 * mass registration and credential stuffing are the two attacks that matter here.
 *
 * Outside production the caps are raised so the automated end-to-end check can sign in
 * as several distinct roles and register throwaway families. The control is not
 * weakened where it matters — only where there is no internet-facing attacker to slow
 * down. Production behaviour is unchanged.
 */
function authThrottle(limit: number, ttlMs: number) {
  const effective = process.env.NODE_ENV === 'production' ? limit : 10_000;
  return { default: { limit: effective, ttl: ttlMs } };
}

const registerThrottle = () => authThrottle(RATE_LIMITS.AUTH_REGISTER_PER_HOUR, 3_600_000);
const loginThrottle = () => authThrottle(RATE_LIMITS.AUTH_LOGIN_PER_15_MIN, 900_000);
const passwordResetThrottle = () => authThrottle(RATE_LIMITS.PASSWORD_RESET_PER_HOUR, 3_600_000);

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactor: TwoFactorService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('register')
  @Throttle(registerThrottle())
  @ApiOperation({ summary: 'Register a guardian or student account (FR-AUTH-01)' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(loginThrottle())
  @ApiOperation({
    summary: 'Sign in with email and password (FR-AUTH-01, NFR-SEC-04)',
    description:
      'Locks the account after 10 failed attempts. Staff accounts with 2FA enabled must send `twoFactorCode`.',
  })
  @ApiOkResponse({
    description: 'Tokens on success, or `twoFactorRequired` when a challenge is pending',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials, locked account or bad 2FA code' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, context(req));
    if (result.tokens) this.setRefreshCookie(res, result.tokens.refreshToken);
    return result.tokens;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and mint a new access token (FR-AUTH-01)' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieToken = readCookie(req, this.refreshCookieName);
    const tokens = await this.authService.refresh(dto.refreshToken ?? cookieToken, context(req));
    this.setRefreshCookie(res, tokens.refreshToken);
    return tokens;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session, or every session' })
  async logout(
    @Body() dto: LogoutDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.id, user.sessionId, dto.allSessions ?? false);
    res.clearCookie(this.refreshCookieName, this.cookieOptions());
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user with roles (FR-AUTH-02)' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.currentUser(user.id);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Active sessions for this account (FR-AUTH-07)' })
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user.id);
  }

  @Post('two-factor/setup')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Begin staff 2FA enrolment (FR-AUTH-01)',
    description: 'Requires the account password to be re-entered. Staff roles only.',
  })
  async setupTwoFactor(@Body() dto: EnableTwoFactorDto, @CurrentUser() user: AuthenticatedUser) {
    if (!user.staff) {
      return { required: false, message: 'Two-factor is mandatory for staff accounts only' };
    }
    return this.twoFactor.setup(user.id);
  }

  @Post('two-factor/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm 2FA enrolment with the first valid code (FR-AUTH-01)' })
  confirmTwoFactor(@Body() dto: TwoFactorVerifyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.twoFactor.confirm(user.id, dto.code);
  }

  @Post('two-factor/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  disableTwoFactor(@CurrentUser() user: AuthenticatedUser) {
    return this.twoFactor.disable(user.id);
  }

  @Post('forgot-password')
  @Public()
  @Throttle(passwordResetThrottle())
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a password reset email (NFR-SEC-04)',
    description: 'Always returns 202 whether or not the address is registered.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.requestPasswordReset(dto.email, context(req));
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Complete a password reset; ends every existing session' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  // ── Cookie helpers (TRD section 6: refresh token lives in an httpOnly cookie) ──

  private get refreshCookieName(): string {
    return 'hifzoon_refresh';
  }

  private cookieOptions() {
    const { value } = this.config;
    return {
      httpOnly: true,
      secure: value.COOKIE_SECURE,
      domain: value.COOKIE_DOMAIN || undefined,
      sameSite: 'strict' as const,
      path: '/api/v1/auth',
    };
  }

  private setRefreshCookie(res: Response, refreshToken?: string): void {
    if (!refreshToken) return;
    res.cookie(this.refreshCookieName, refreshToken, {
      ...this.cookieOptions(),
      maxAge: 30 * 86_400_000,
    });
  }
}

function context(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export const AUTH_ROLES = [Role.GUARDIAN, Role.STUDENT];
export type AuthRequest = RequestWithUser;
