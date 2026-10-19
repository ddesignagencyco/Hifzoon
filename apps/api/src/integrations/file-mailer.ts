import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';

import type { MailMessage, MailResult, Mailer } from './providers';

/**
 * A mailer that writes each message to disk as an `.eml` file (Q21).
 *
 * Development and staging have no SMTP credentials and should not need any, but "log the
 * mail" is not good enough for the flows that only work if a message actually arrives: a
 * password-reset link, an emailed guardian-verification code. With this adapter the mail
 * lands in a directory a developer (or a CI job) can open, so those flows can be exercised
 * end to end without a vendor account.
 *
 * Filenames are timestamped and id-suffixed rather than derived from the recipient, so a
 * directory listing cannot quietly become a list of customers' email addresses.
 */
export class FileMailer implements Mailer {
  readonly name = 'file';

  private readonly logger = new Logger(FileMailer.name);

  constructor(
    private readonly directory: string,
    private readonly mailFrom: string,
  ) {}

  async send(message: MailMessage): Promise<MailResult> {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, this.filename());
    await writeFile(path, renderEml(message, this.mailFrom), 'utf8');
    this.logger.log(`Captured email to ${path} (to: ${message.to})`);
    return { messageId: `file-${randomUUID()}`, accepted: true };
  }

  private filename(): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${stamp}-${randomUUID().slice(0, 8)}.eml`;
  }
}

/** Minimal RFC 5322 rendering — enough for a mail client or a text editor to read. */
export function renderEml(message: MailMessage, mailFrom: string): string {
  const boundary = `----hifzoon-${randomUUID()}`;
  return [
    `From: ${mailFrom}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    ...(message.replyTo ? [`Reply-To: ${message.replyTo}`] : []),
    ...Object.entries(message.headers ?? {}).map(([key, value]) => `${key}: ${value}`),
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    message.text ?? stripHtml(message.html),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    message.html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** Resolves a possibly-relative capture directory against the process cwd. */
export function captureDirectory(configured: string | undefined): string {
  const value = configured && configured.trim().length > 0 ? configured : 'tmp/mail';
  return isAbsolute(value) ? value : join(process.cwd(), value);
}
