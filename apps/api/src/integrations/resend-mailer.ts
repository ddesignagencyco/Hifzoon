import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { ErrorCode } from '@hifzoon/shared';
import { AppError } from '../common/errors/app-error';
import { AppConfigService } from '../config/app-config.service';
import type { MailMessage, MailResult, Mailer } from './providers';

/** What Resend returns for an accepted message. */
const RESEND_RESPONSE = z.object({ id: z.string() });

/**
 * Resend transactional mail (FR-NTF-01, Q21).
 *
 * The API advertised `MAIL_PROVIDER=resend` and required the key, but no adapter existed:
 * selecting it silently fell back to the fake, so a deployment could be configured for
 * real delivery and deliver nothing. Everything that follows from "we think we sent an
 * email" — password reset, guardian verification, an invoice — depends on this actually
 * sending, so a non-2xx or an unexpected body is raised rather than swallowed.
 *
 * `idempotencyKey` is forwarded as Resend's idempotency header. That matters because
 * notifications are delivered by a retrying worker: a retried send must not become two
 * emails when the first one actually arrived.
 */
@Injectable()
export class ResendMailer implements Mailer {
  readonly name = 'resend';

  private readonly logger = new Logger(ResendMailer.name);

  constructor(private readonly config: AppConfigService) {}

  async send(message: MailMessage): Promise<MailResult> {
    const apiKey = this.config.value.RESEND_API_KEY;
    if (!apiKey) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        'MAIL_PROVIDER=resend requires RESEND_API_KEY',
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(message.idempotencyKey
          ? { 'Idempotency-Key': message.idempotencyKey }
          : {}),
      },
      body: JSON.stringify({
        from: this.config.value.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        headers: message.headers,
      }),
    });

    if (!response.ok) {
      // The body can hold the reason (bad address, unverified domain, rate limit); it is
      // logged rather than returned, because it can quote the recipient.
      const detail = await response.text().catch(() => '');
      this.logger.error(`Resend refused ${message.to}: ${response.status} ${detail}`);
      throw new AppError(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
        'The email provider rejected the message',
        { status: response.status },
      );
    }

    const parsed = RESEND_RESPONSE.safeParse(await response.json());
    if (!parsed.success) {
      // Accepted but unidentifiable: the worker's delivery receipt has nothing to point
      // at, so this is treated as a failure and retried rather than logged as sent.
      throw new AppError(ErrorCode.DEPENDENCY_UNAVAILABLE, 'Unrecognised response from Resend');
    }

    return { messageId: parsed.data.id, accepted: true };
  }
}