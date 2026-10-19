import { AppError } from '../common/errors/app-error';
import type { AppConfigService } from '../config/app-config.service';
import type { MailMessage } from './providers';
import { SmtpMailer } from './smtp-mailer';

jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: jest.fn() })) }));

// The module is mocked above, so the transport factory can be asserted on directly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require('nodemailer') as { createTransport: jest.Mock };

type MailConfig = {
  MAIL_FROM: string;
  SMTP_HOST?: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_ALLOW_UNTRUSTED: boolean;
};

const MESSAGE: MailMessage = {
  to: 'parent@example.com',
  subject: 'Confirm a guardian for your family',
  html: '<p>Code 123456</p>',
  text: 'Code 123456',
};

function configWith(overrides: Partial<MailConfig> = {}): AppConfigService {
  const value = {
    MAIL_FROM: 'Hifzoon <no-reply@hifzoon.test>',
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    SMTP_SECURE: false,
    SMTP_USER: undefined,
    SMTP_PASSWORD: undefined,
    SMTP_ALLOW_UNTRUSTED: false,
    ...overrides,
  };
  return { value } as unknown as AppConfigService;
}

/** Replaces the transport nodemailer would otherwise build from env. */
function stubTransport(mailer: SmtpMailer, response: unknown): { sendMail: jest.Mock } {
  const sendMail = jest.fn().mockResolvedValue(response);
  (mailer as any).transporter = { sendMail };
  return { sendMail };
}

describe('SmtpMailer', () => {
  it('returns the message id the server reports', async () => {
    const mailer = new SmtpMailer(configWith());
    const { sendMail } = stubTransport(mailer, { messageId: '<abc@hifzoon>' });

    const result = await mailer.send(MESSAGE);

    expect(result).toEqual({ messageId: '<abc@hifzoon>', accepted: true });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Hifzoon <no-reply@hifzoon.test>',
        to: 'parent@example.com',
        subject: MESSAGE.subject,
      }),
    );
  });

  // The worker retries, and a retried send must not become a second email when the first
  // one arrived. SMTP has no idempotency header, so Message-ID is the deduplication key.
  it('pins a stable Message-ID to the idempotency key', async () => {
    const mailer = new SmtpMailer(configWith());
    const { sendMail } = stubTransport(mailer, { messageId: 'x' });

    await mailer.send({ ...MESSAGE, idempotencyKey: 'notification-42' });
    const first = sendMail.mock.calls[0][0].headers['Message-ID'];

    await mailer.send({ ...MESSAGE, idempotencyKey: 'notification-42' });
    const second = sendMail.mock.calls[1][0].headers['Message-ID'];

    expect(first).toBe(second);
    expect(first).toBe('<notification-42@hifzoon>');
  });

  it('leaves Message-ID to the server when there is no idempotency key', async () => {
    const mailer = new SmtpMailer(configWith());
    const { sendMail } = stubTransport(mailer, { messageId: 'x' });

    await mailer.send(MESSAGE);

    expect(sendMail.mock.calls[0][0].headers['Message-ID']).toBeUndefined();
  });

  // A retried send after a network failure has to keep its Message-ID, so anything that
  // cannot appear in a dot-atom local part is folded to a dash rather than dropped.
  it('sanitises an idempotency key that is not a valid local part', async () => {
    const mailer = new SmtpMailer(configWith());
    const { sendMail } = stubTransport(mailer, { messageId: 'x' });

    await mailer.send({ ...MESSAGE, idempotencyKey: 'a b/c@d#e' });

    expect(sendMail.mock.calls[0][0].headers['Message-ID']).toBe('<a-b-c-d-e@hifzoon>');
  });

  // NotificationsService marks the row SENT off a returned id. An accepted-but-unidentified
  // response would record a delivery that cannot be traced, so it is raised for a retry.
  it('raises when the server accepts the message without an id', async () => {
    const mailer = new SmtpMailer(configWith());
    stubTransport(mailer, { accepted: [] });

    await expect(mailer.send(MESSAGE)).rejects.toBeInstanceOf(AppError);
  });

  it('raises rather than reporting a transport failure as sent', async () => {
    const mailer = new SmtpMailer(configWith());
    (mailer as any).transporter = {
      sendMail: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };

    await expect(mailer.send(MESSAGE)).rejects.toThrow('ECONNREFUSED');
  });

  // An unreachable relay must not stop the process booting — the adapter is constructed at
  // boot in both the API and the worker, and connects on first use.
  it('does not connect while being constructed', () => {
    const mailer = new SmtpMailer(configWith({ SMTP_HOST: 'smtp.invalid' }));
    expect((mailer as any).transporter).toBeNull();
  });

  it('fails with a clear message when SMTP_HOST is missing', async () => {
    const mailer = new SmtpMailer(configWith({ SMTP_HOST: undefined }));

    await expect(mailer.send(MESSAGE)).rejects.toThrow('requires SMTP_HOST');
  });
});

describe('SmtpMailer connection options', () => {
  beforeEach(() => nodemailer.createTransport.mockClear());

  // A half-configured relay is worse than none: sending credentials with no password makes
  // some servers reject the session outright.
  it('omits auth when the password is missing', () => {
    new SmtpMailer(configWith({ SMTP_USER: 'user', SMTP_PASSWORD: undefined }))
      .send(MESSAGE)
      .catch(() => undefined);

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: undefined }),
    );
  });

  it('authenticates when both a user and a password are set', () => {
    new SmtpMailer(configWith({ SMTP_USER: 'user', SMTP_PASSWORD: 'secret' }))
      .send(MESSAGE)
      .catch(() => undefined);

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { user: 'user', pass: 'secret' } }),
    );
  });

  it('verifies TLS certificates by default', () => {
    new SmtpMailer(configWith()).send(MESSAGE).catch(() => undefined);

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ tls: { rejectUnauthorized: true } }),
    );
  });

  it('accepts self-signed certificates only when explicitly allowed', () => {
    new SmtpMailer(configWith({ SMTP_ALLOW_UNTRUSTED: true })).send(MESSAGE).catch(() => undefined);

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ tls: { rejectUnauthorized: false } }),
    );
  });
});
