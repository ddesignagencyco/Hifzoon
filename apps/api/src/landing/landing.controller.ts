import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '../common/decorators';
import { AppConfigService } from '../config/app-config.service';
import { LANDING_CSP, renderLandingPage } from './landing.page';

/**
 * The API's public front door. Served at `/` (excluded from the global `/api/v1`
 * prefix in `main.ts`) so hitting the bare Render URL shows a branded live-status
 * page instead of a 404.
 */
@ApiExcludeController()
@Controller()
export class LandingController {
  constructor(private readonly config: AppConfigService) {}

  @Public()
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  // The landing page inlines its CSS and its small health-check script, so it needs a
  // policy of its own; every other route keeps the strict JSON-only policy from helmet.
  @Header('Content-Security-Policy', LANDING_CSP)
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  root(@Res() res: Response): void {
    res.send(
      renderLandingPage({
        webUrl: this.config.value.APP_WEB_URL,
        apiDocsUrl: '/api/docs',
      }),
    );
  }
}
