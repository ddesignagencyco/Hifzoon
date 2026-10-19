import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import { ErrorCode } from '@hifzoon/shared';
import { AppError } from '../common/errors/app-error';
import { AppConfigService } from '../config/app-config.service';
import type { MailMessage, MailResult, Mailer } from './providers';

/**
 * SMTP mailer (Q21).
 *
 * This is what makes the MailHog service in docker-compose useful: it catches everything
 * on `MAIL_FROM` and serves it on its web UI, so password resets, guardian-verification
 * codes and invoice mail can be exercised end to end locally instead of being written to
 * `.eml` files nobody opens. Any SMTP server works — MailHog, a staging relay, a real
 * provider — because nothing here is MailHog-specific.
 *
 * Two details are deliberate:
 *
 * - `idempotencyKey` is forwarded as `Message-ID`. Notifications are delivered by a
 *   retrying worker, and a retried send must not become a second email when the first one
 *   actually arrived. A deterministic Message-ID gives receiving agents something to
 *   deduplicate on; SMTP has no idempotency header of its own.
 * - A transport failure raises rather than being swallowed. `NotificationsService` marks
 *   the row SENT off a returned id, so a silent success here would tell a parent their
 *   verification code was emailed when it was not.
 */
export class SmtpMailer implements Mailer {
  readonly name = 'smtp';

  private readonly logger = new Logger(SmtpMailer.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: AppConfigService) {}

  async send(message: MailMessage): Promise<MailResult> {
    const transporter = this.connection();

    const info = await transporter.sendMail({
      from: this.config.value.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      headers: {
        ...message.headers,
        ...(message.idempotencyKey ? { 'Message-ID': this.messageId(message.idempotencyKey) } : {}),
      },
    });

    const messageId = this.extractMessageId(info);
    if (!messageId) {
      // Accepted but unidentifiable: the worker's delivery receipt has nothing to point
      // at, so this is a failure and gets retried rather than recorded as sent.
      throw new AppError(ErrorCode.DEPENDENCY_UNAVAILABLE, 'SMTP server accepted the message without an id');
    }

    this.logger.log(`Mail accepted by ${this.config.value.SMTP_HOST} (to: ${message.to})`);
    return { messageId, accepted: true };
  }

  /**
   * Built on first use rather than in the constructor: the API and the worker both
   * construct this at boot, and an unreachable SMTP server should not decide whether the
   * process starts.
   */
  private connection(): Transporter {
    if (this.transporter) return this.transporter;

    const { SMTP_HOST: host, SMTP_PORT: port, SMTP_SECURE: secure } = this.config.value;
    if (!host) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'MAIL_PROVIDER=smtp requires SMTP_HOST');
    }

    const user = this.config.value.SMTP_USER;
    const password = this.config.value.SMTP_PASSWORD;
    // `tls.rejectUnauthorized: false` is a certificate-verification bypass. It is only
    // reachable via SMTP_ALLOW_UNTRUSTED, which no environment sets by default, and it is
    // logged loudly so an environment that turns it on cannot forget it has.
    const rejectUnauthorized = !this.config.value.SMTP_ALLOW_UNTRUSTED;
    if (!rejectUnauthorized) {
      this.logger.warn(`SMTP_ALLOW_UNTRUSTED is on: TLS certificates from ${host} are not verified`);
    }

    this.transporter = createTransport({
      host,
      port,
      secure,
      auth: user && password ? { user, pass: password } : undefined,
      tls: { rejectUnauthorized },
    });

    return this.transporter;
  }

  /** Nodemailer returns the Message-ID it generated, or the one we supplied. */
  private extractMessageId(info: unknown): string | null {
    const candidate = (info as { messageId?: unknown } | null)?.messageId;
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
  }

  /**
   * A stable, syntactically valid Message-ID. Nodemailer wraps whatever it is given in
   * angle brackets and appends its own domain, so only the local part is pinned here —
   * that is what has to be identical across retries for deduplication to work.
   */
  private messageId(idempotencyKey: string): string {
    const safe = idempotKeyToLocalPart(idempotencyKey);
    return `<${safe}@hifzoon>`;
  }
}

/** Keeps the local part to characters an RFC 5322 `dot-atom` allows. */
function idempotKeyToLocalPart(idempotencyKey: string): string {
  const cleaned = idempotencyKey.replace(/[^A-Za-z0-9._-]/g, '-');
  return cleaned.length > 64 ? cleaned.slice(0, 64) : cleaned;
}