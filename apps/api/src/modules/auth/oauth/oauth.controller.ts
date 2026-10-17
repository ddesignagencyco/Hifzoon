import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';

import { AuthenticatedUser, CurrentUser, Public } from '../../../common/decorators';
import { AppConfigService } from '../../../config/app-config.service';
import { respondWithTokens } from '../auth-cookie';
import { OAuthCallbackDto, OAuthStartDto } from './dto/oauth.dto';
import { OAuthService } from './oauth.service';

/**
 * Federated sign-in endpoints (FR-AUTH-01).
 *
 * The flow is deliberately two explicit steps rather than a redirect from the API:
 *
 *   1. `GET  /auth/oauth/:provider/start` → `{ authorizationUrl, state }`
 *   2. `POST /auth/oauth/:provider/callback` with `{ code, state, redirectUri }` → tokens
 *
 * The browser navigates to `authorizationUrl` itself. If the API issued the redirect the
 * user's `code` would pass through the API's access log on the way, and the frontend
 * could not contribute anything to the request — no PKCE verifier held client-side, no
 * device id, nothing.
 */
@ApiTags('auth')
@Controller('auth/oauth')
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Get('providers')
  @ApiOperation({
    summary: 'Which sign-in methods this deployment supports (FR-AUTH-01)',
    description:
      'A provider with no credentials is reported as `configured: false` rather than omitted, ' +
      'so the client hides the button instead of offering one that returns 501.',
  })
  providers() {
    return this.oauth.providers();
  }

  /**
   * Both steps accept an access token, and what it means differs:
   *   - anonymous → sign in with this provider;
   *   - authenticated → link the identity to *this* account, which is how a user with a
   *     password adds Google or Apple to their sign-in methods.
   */
  @Public()
  @Get(':provider/start')
  @ApiOperation({
    summary: 'Begin a Google or Apple sign-in (FR-AUTH-01)',
    description:
      'Returns a provider URL plus the `state` to send back to the callback. The state is ' +
      'single-use and expires after 10 minutes. Send an access token to link the identity ' +
      'to the signed-in account rather than sign in.',
  })
  start(
    @Param('provider') provider: string,
    @Query() dto: OAuthStartDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    return this.oauth.start(provider, {
      redirectUri: dto.redirectUri,
      linkToUserId: user?.id ?? null,
    });
  }

  @Public()
  @Post(':provider/callback')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: process.env.NODE_ENV === 'production' ? 20 : 10_000,
      ttl: 900_000,
    },
  })
  @ApiOperation({
    summary: 'Complete a Google or Apple sign-in (FR-AUTH-01)',
    description:
      'Returns the same tokens as `POST /auth/login`. Requires the `state` from `/start`. ' +
      'Send an access token to link this identity to the signed-in account instead.',
  })
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Tokens and the resolved user' })
  @ApiUnauthorizedResponse({ description: 'Expired or replayed `state`, or a disabled account' })
  async callback(
    @Param('provider') provider: string,
    @Body() dto: OAuthCallbackDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.oauth.callback(
      provider,
      { code: dto.code, state: dto.state, redirectUri: dto.redirectUri },
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        authenticatedUserId: user?.id,
      },
    );
    // Set exactly as for a password login, so the client has one refresh path no matter
    // how the user authenticated — and the token itself stays in the cookie (NFR-SEC-01).
    return respondWithTokens(res, this.config, tokens);
  }
}