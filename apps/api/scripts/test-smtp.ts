import '../src/config/load-env';
import { loadConfig } from '../src/config/env.schema';
import { SmtpMailer } from '../src/integrations/smtp-mailer';
import type { AppConfigService } from '../src/config/app-config.service';

/**
 * Sends one real message through the configured SMTP server.
 *
 *   npm run mail:test --workspace @hifzoon/api
 *   npm run mail:test --workspace @hifzoon/api -- --to someone@example.com
 *
 * This is the check that OTPs and notification email can actually leave the building.
 * It fails loudly on a missing password, a rejected login or a refused connection.
 */

const PLACEHOLDER_PASSWORDS = new Set([
  '',
  'PASTE_GMAIL_APP_PASSWORD_HERE',
  'your-app-password',
  'changeme',
]);

function argument(name: string): string | undefined {
  const prefixed = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (prefixed) return prefixed.slice(name.length + 3);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function bareAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.MAIL_PROVIDER !== 'smtp') {
    throw new Error(
      `MAIL_PROVIDER is "${config.MAIL_PROVIDER}"; set it to "smtp" in apps/api/.env`,
    );
  }
  if (!config.SMTP_HOST) {
    throw new Error('SMTP_HOST is not set in apps/api/.env');
  }
  if (!config.SMTP_USER) {
    throw new Error('SMTP_USER is not set in apps/api/.env');
  }
  if (!config.SMTP_PASSWORD || PLACEHOLDER_PASSWORDS.has(config.SMTP_PASSWORD)) {
    throw new Error(
      [
        'SMTP_PASSWORD is empty.',
        'For Gmail: enable 2-Step Verification, create an App Password at',
        'https://myaccount.google.com/apppasswords, then paste the 16-character password',
        '(no spaces) into SMTP_PASSWORD in apps/api/.env.',
      ].join(' '),
    );
  }

  const to = argument('to') ?? process.env.SMTP_TEST_TO ?? bareAddress(config.MAIL_FROM);
  const sentAt = new Date().toISOString();

  const mailer = new SmtpMailer({ value: config } as AppConfigService);
  const result = await mailer.send({
    to,
    subject: 'Hifzoon SMTP test',
    text: `SMTP is working. This message was sent by Hifzoon at ${sentAt}.`,
    html: `<p>SMTP is working.</p><p>This message was sent by Hifzoon at <strong>${sentAt}</strong>.</p>`,
  });

  console.log(
    `SMTP OK -> ${config.SMTP_HOST}:${config.SMTP_PORT} accepted the message for ${to} (id: ${result.messageId})`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`SMTP test failed: ${message}`);
  if (/invalid login|username and password not accepted|535/i.test(message)) {
    console.error(
      'Gmail rejected the credentials. SMTP_PASSWORD must be a Gmail App Password, not the account password.',
    );
  }
  process.exitCode = 1;
});
