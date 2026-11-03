import { renderEmail } from './email-templates';

const JOIN_URL = 'https://web.test/class/1?slot=am&ref=email';

function reminder(overrides: Partial<Parameters<typeof renderEmail>[0]> = {}) {
  return renderEmail({
    template: 'class.reminder.15-min',
    locale: 'en',
    subject: 'Class in 15 minutes: Maryam',
    body: 'Your class with Ustadh Bilal starts at 16:00. Join: https://web.test/class/1?slot=am&ref=email',
    data: { joinUrl: JOIN_URL },
    ...overrides,
  });
}

describe('renderEmail', () => {
  it('wraps the copy in the branded Hifzoon shell', () => {
    const { html } = reminder();

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('#0f2c24');
    expect(html).toContain('Hifzoon');
    expect(html).toContain('Class in 15 minutes: Maryam');
    expect(html).toContain('Join class');
  });

  it('turns the template URL into an escaped button and keeps it out of the paragraph', () => {
    const { html, text } = reminder();

    expect(html).toContain('href="https://web.test/class/1?slot=am&amp;ref=email"');
    expect(html).not.toContain('Join: https://web.test/class/1?slot=am&amp;ref=email');
    expect(text).toContain(`Join: ${JOIN_URL}`);
  });

  it('renders RTL copy for Urdu', () => {
    const { html } = reminder({
      locale: 'ur',
      subject: 'کلاس 15 منٹ میں: مریم',
      body: 'آپ کی کلاس 16:00 پر شروع ہوگی۔ شامل ہوں: https://web.test/class/1?slot=am&ref=email',
    });

    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ur"');
    expect(html).toContain('کلاس میں شامل ہوں');
    expect(html).toContain('ہفزون');
  });

  it('escapes subject and body instead of emitting markup', () => {
    const { html } = renderEmail({
      template: 'class.reminder.15-min',
      locale: 'en',
      subject: '<img src=x onerror=alert(1)>',
      body: '<script>alert(1)</script> Join: https://web.test/class/1',
      data: { joinUrl: 'https://web.test/class/1' },
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('keeps the expiry sentence for a password reset', () => {
    const { html } = renderEmail({
      template: 'auth.password-reset',
      locale: 'en',
      subject: 'Reset your Hifzoon password',
      body: 'Use this link within 30 minutes to choose a new password: https://web.test/reset/abc',
      data: { resetUrl: 'https://web.test/reset/abc' },
    });

    expect(html).toContain('Use this link within 30 minutes to choose a new password.');
    expect(html).toContain('Reset password');
    expect(html).not.toContain(': https://web.test/reset/abc');
  });

  it('shows a guardian verification code in its own code block', () => {
    const { html } = renderEmail({
      template: 'consent.guardian-verification',
      locale: 'en',
      subject: 'Confirm a guardian for the Rahman family',
      body: 'Ayesha asked to join the Rahman family as a guardian. If you recognise them, confirm this code: 482913.',
      data: { code: '482913' },
    });

    expect(html).toContain('letter-spacing:6px');
    expect(html).toContain('482913');
  });

  it('promotes a URL found in the body when the template has no mapped link', () => {
    const { html, text } = renderEmail({
      template: 'message.new',
      locale: 'en',
      subject: 'You have a new message on Hifzoon',
      body: 'Read it here: https://web.test/messages/42',
      data: {},
    });

    expect(html).toContain('Open Hifzoon');
    expect(html).toContain('href="https://web.test/messages/42"');
    expect(text).toContain('Read it here: https://web.test/messages/42');
  });
});
