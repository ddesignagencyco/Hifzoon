import { Controller, Get, Headers, HttpCode, Post, Query, RawBodyRequest, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import { Public } from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import { AppConfigService } from '../../config/app-config.service';
import { WebhooksService } from './webhooks.service';

/**
 * Provider webhook endpoints (TRD section 5.1).
 *
 * `@Public()` because a provider carries no session; `@SkipThrottle()` because the
 * provider retries on a schedule we do not control and a 429 would look like a delivery
 * failure on their side. Authorisation is the HMAC signature the adapter verifies over
 * the raw body — hence `RawBodyRequest`, populated by the raw-body capture in `main.ts`.
 */
@ApiTags('webhooks')
@Controller('webhooks')
@SkipThrottle()
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('payments')
  @HttpCode(200)
  @ApiOperation({ summary: 'Payment provider webhook (signature verified, idempotent)' })
  payments(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    return this.webhooks.payments(req.rawBody, signature);
  }

  @Public()
  @Post('video')
  @HttpCode(200)
  @ApiOperation({ summary: 'Video provider webhook for recording lifecycle' })
  video(@Req() req: RawBodyRequest<Request>, @Headers('authorization') signature?: string) {
    return this.webhooks.video(req.rawBody, signature);
  }

  /**
   * WhatsApp delivery receipts (FR-NTF-03).
   *
   * Meta signs this with `X-Hub-Signature-256: sha256=<hmac of the raw body>` using the
   * app secret — not a bearer token, so the header is read here and handed to the
   * adapter for verification over the untouched bytes.
   *
   * This endpoint is the *only* evidence that a parent actually received a message about
   * their child's class: a 200 from the send API means accepted, not delivered.
   */
  @Public()
  @Post('whatsapp')
  @HttpCode(200)
  @ApiOperation({
    summary: 'WhatsApp delivery receipts (signature verified, monotonic)',
    description:
      'Reconciles delivery status against the notification row recorded at send time. ' +
      'Duplicate and out-of-order receipts are ignored rather than applied.',
  })
  whatsapp(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    return this.webhooks.whatsapp(req.rawBody, signature);
  }

  /**
   * Meta's subscription verification (Q17).
   *
   * When a webhook URL is registered, Meta GETs it once with `hub.mode=subscribe` and a
   * challenge token, and expects that token echoed back. Without a GET handler the URL
   * cannot be registered at all, so the whole WhatsApp adapter was unusable on a real
   * account no matter how correct the POST side was.
   */
  @Public()
  @Get('whatsapp')
  @ApiOperation({
    summary: 'Meta webhook subscription verification (echo hub.challenge)',
  })
  whatsappChallenge(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    const expected = this.config.value.WHATSAPP_VERIFY_TOKEN;
    // Only echo when the token matches, and only for a subscribe request; otherwise a
    // random caller could use this endpoint as an open relay.
    if (mode !== 'subscribe' || !expected || verifyToken !== expected || !challenge) {
      throw AppError.forbidden('WhatsApp webhook verification failed');
    }
    return challenge;
  }
}
