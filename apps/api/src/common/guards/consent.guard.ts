import { ExecutionContext, Injectable } from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConsentPurpose, REQUIRED_CHILD_CONSENTS } from '@hifzoon/shared';
import { Request } from 'express';

import { ConsentService } from '../../modules/consent/consent.service';
import { AppError } from '../errors/app-error';

/**
 * Gating guard for consent-bound endpoints (FR-AUTH-04, FR-AIC-09, FR-CLS-12).
 *
 * Applied with `@RequiresConsent(ConsentPurpose.AI_VOICE)`. The student is taken
 * from the route (`studentId` param) or the signed-in user. Under-13 students may
 * only use the platform at all while DATA_COLLECTION consent stands (CR-01), which
 * is enforced for every guarded route regardless of the purpose requested.
 */
export const REQUIRES_CONSENT_KEY = 'hifzoon:requiresConsent';
export const RequiresConsent = (...purposes: ConsentPurpose[]) =>
  SetMetadata(REQUIRES_CONSENT_KEY, purposes);

@Injectable()
export class ConsentGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly consentService: ConsentService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ConsentPurpose[] | undefined>(
      REQUIRES_CONSENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const params = (request.params ?? {}) as Record<string, string>;
    const body = (request.body ?? {}) as Record<string, string>;

    const studentId = params.studentId ?? body.studentId;
    if (!studentId) {
      throw AppError.badRequest('studentId is required to evaluate consent');
    }

    const purposes = [...REQUIRED_CHILD_CONSENTS, ...required];
    const missing = await this.consentService.findMissingPurposes(studentId, purposes);
    if (missing.length > 0) {
      throw new AppError(
        'CONSENT_REQUIRED',
        `Guardian consent is required for: ${missing.join(', ')}`,
        { studentId, missing },
      );
    }
    return true;
  }
}
