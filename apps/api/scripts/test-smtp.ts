import '../src/config/load-env';
import { loadConfig } from '../src/config/env.schema';
import { SmtpMailer } from '../src/integrations/smtp-mailer';
import { renderEmail } from '../src/modules/notifications/email-templates';
import {
  NotificationsService,
  TEMPLATE,
  type TemplateKey,
} from '../src/modules/notifications/notifications.service';
import type { AppConfigService } from '../src/config/app-config.service';

/**
 * Sends one real branded notification through the configured SMTP server.
 *
 *   npm run mail:test --workspace @hifzoon/api
 *   npm run mail:test --workspace @hifzoon/api -- --to someone@example.com
 *   npm run mail:test --workspace @hifzoon/api -- --template consent.guardian-verification
 *   npm run mail:test --workspace @hifzoon/api -- --locale ur
 *
 * This is the check that OTPs and notification email can actually leave the building.
 * It fails loudly on a missing password, a rejected login or a refused connection.
 */

const SAMPLES: Partial<Record<TemplateKey, Record<string, string>>> = {
  [TEMPLATE.CLASS_REMINDER_15_MIN]: {
    studentName: 'Maryam',
    teacherName: 'Ustadh Bilal',
    localTime: '16:00',
    timeZone: 'Europe/London',
    joinUrl: 'https://meet.hifzoon.com/class/demo',
  },
  [TEMPLATE.CLASS_RESCHEDULED]: {
    studentName: 'Maryam',
    oldTime: '2026-11-03T16:00:00.000Z',
    newTime: '2026-11-03T17:30:00.000Z',
  },
  [TEMPLATE.TRIAL_BOOKED]: {
    startsAt: '2026-11-03T16:00:00.000Z',
  },
  [TEMPLATE.PASSWORD_RESET]: {
    resetUrl: 'https://app.hifzoon.com/reset/demo-token',
    ttlMinutes: '30',
  },
  [TEMPLATE.GUARDIAN_VERIFICATION]: {
    requesterName: 'Ayesha Khan',
    familyName: 'the Rahman family',
    code: '482913',
  },
  [TEMPLATE.BILLING_SUBSCRIBED]: {
    planName: 'Hifz Essentials',
    schedule: 'Tuesdays and Thursdays at 16:00',
    renewsOn: '3 December 2026',
    billingUrl: 'https://app.hifzoon.com/billing',
  },
  [TEMPLATE.NEW_MESSAGE]: {
    threadId: 'thread-demo',
  },
};

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
  const template = (argument('template') ?? TEMPLATE.CLASS_REMINDER_15_MIN) as TemplateKey;
  const locale = argument('locale') ?? 'en';
  const data = SAMPLES[template];

  if (!data) {
    throw new Error(
      `No sample data for "${template}". Try one of: ${Object.keys(SAMPLES).join(', ')}`,
    );
  }

  const notifications = new NotificationsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const copy = notifications.resolve(template, locale, data);
  const rendered = renderEmail({
    template,
    locale: copy.language,
    subject: copy.subject,
    body: copy.body,
    data,
  });

  const mailer = new SmtpMailer({ value: config } as AppConfigService);
  const result = await mailer.send({
    to,
    subject: copy.subject,
    text: rendered.text,
    html: rendered.html,
  });

  console.log(
    `SMTP OK -> ${config.SMTP_HOST}:${config.SMTP_PORT} accepted "${template}" (${copy.language}) for ${to} (id: ${result.messageId})`,
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
