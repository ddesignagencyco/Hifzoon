import { EMAIL_LOGO_CID, EMAIL_LOGO_PNG_BASE64 } from './email-logo';

/**
 * Branded transactional email layout.
 *
 * Email clients are not browsers: the layout is table-based, every colour is inline and
 * the webfonts are only a progressive enhancement over Georgia / system sans. The output
 * is deliberately self-contained so Gmail, Apple Mail and Outlook all render the same
 * Hifzoon green, gold and cream shell around the plain-text copy from `resolve()`.
 */

type CtaKind =
  'join' | 'reset' | 'set-password' | 'billing' | 'pay' | 'review' | 'choose-times' | 'open';

type Tone = 'important' | 'action' | 'confirmed' | 'update';

interface EmailTemplateInput {
  template: string;
  locale: string;
  subject: string;
  body: string;
  data: Record<string, unknown>;
}

interface Copy {
  dir: 'ltr' | 'rtl';
  lang: string;
  font: string;
  tagline: string;
  tone: Record<Tone, string>;
  cta: Record<CtaKind, string>;
  help: string;
  reason: string;
}

const SUPPORT_EMAIL = 'info.hifzoon@gmail.com';

const COPY: Record<'en' | 'ur' | 'ar', Copy> = {
  en: {
    dir: 'ltr',
    lang: 'en',
    font: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
    tagline: 'Quran Academy',
    tone: {
      important: 'Important',
      action: 'Action needed',
      confirmed: 'Confirmed',
      update: 'Hifzoon update',
    },
    cta: {
      join: 'Join class',
      reset: 'Reset password',
      'set-password': 'Set your password',
      billing: 'Manage billing',
      pay: 'Update payment method',
      review: 'Open review',
      'choose-times': 'Choose weekly times',
      open: 'Open Hifzoon',
    },
    help: 'Need help? Reply to this email or contact',
    reason: 'You are receiving this email because of activity on your Hifzoon account.',
  },
  ur: {
    dir: 'rtl',
    lang: 'ur',
    font: "'Noto Nastaliq Urdu', 'Amiri', 'Segoe UI', Tahoma, Arial, sans-serif",
    tagline: 'قرآن اکیڈمی',
    tone: {
      important: 'اہم',
      action: 'کارروائی درکار',
      confirmed: 'تصدیق شدہ',
      update: 'ہفزون اپڈیٹ',
    },
    cta: {
      join: 'کلاس میں شامل ہوں',
      reset: 'پاس ورڈ ری سیٹ کریں',
      'set-password': 'اپنا پاس ورڈ بنائیں',
      billing: 'بلنگ دیکھیں',
      pay: 'ادائیگی اپ ڈیٹ کریں',
      review: 'جائزہ کھولیں',
      'choose-times': 'اوقات منتخب کریں',
      open: 'ہفزون کھولیں',
    },
    help: 'مدد چاہیے؟ اس ای میل کا جواب دیں یا رابطہ کریں',
    reason: 'یہ ای میل آپ کے ہفزون اکاؤنٹ کی سرگرمی کی وجہ سے بھیجی گئی ہے۔',
  },
  ar: {
    dir: 'rtl',
    lang: 'ar',
    font: "'Amiri', 'Noto Naskh Arabic', 'Segoe UI', Tahoma, Arial, sans-serif",
    tagline: 'أكاديمية القرآن',
    tone: {
      important: 'مهم',
      action: 'إجراء مطلوب',
      confirmed: 'تم التأكيد',
      update: 'تحديث هفزون',
    },
    cta: {
      join: 'انضم إلى الحصة',
      reset: 'إعادة تعيين كلمة المرور',
      'set-password': 'عيّن كلمة المرور',
      billing: 'إدارة الفواتير',
      pay: 'تحديث طريقة الدفع',
      review: 'فتح المراجعة',
      'choose-times': 'اختيار الأوقات',
      open: 'فتح هفزون',
    },
    help: 'تحتاج مساعدة؟ رد على هذا البريد أو تواصل مع',
    reason: 'تتلقى هذا البريد بسبب نشاط على حسابك في هفزون.',
  },
};

const CTA_BY_TEMPLATE: Record<string, { field: string; kind: CtaKind }> = {
  'class.reminder.day-before': { field: 'joinUrl', kind: 'join' },
  'class.reminder.15-min': { field: 'joinUrl', kind: 'join' },
  'trial.booked-by-academy': { field: 'joinUrl', kind: 'join' },
  'auth.password-reset': { field: 'resetUrl', kind: 'reset' },
  'teacher.account.ready': { field: 'setPasswordUrl', kind: 'set-password' },
  'billing.subscribed': { field: 'billingUrl', kind: 'billing' },
  'billing.plan-changed': { field: 'billingUrl', kind: 'billing' },
  'billing.plan-ending': { field: 'billingUrl', kind: 'billing' },
  'billing.plan-ended': { field: 'billingUrl', kind: 'billing' },
  'billing.times-needed': { field: 'billingUrl', kind: 'choose-times' },
  'billing.renewal-failed': { field: 'billingUrl', kind: 'pay' },
  'qa.review.posted': { field: 'url', kind: 'review' },
  'qa.review.replied': { field: 'url', kind: 'review' },
  'qa.low-rating': { field: 'url', kind: 'review' },
};

const TONE_BY_TEMPLATE: Record<string, Tone> = {
  'case.safeguarding-alert': 'important',
  'auth.account-locked': 'important',
  'billing.payment-failed': 'action',
  'billing.renewal-failed': 'action',
  'class.cancelled': 'action',
  'class.missed': 'action',
  'class.rescheduled': 'action',
  'billing.subscribed': 'confirmed',
  'trial.booked': 'confirmed',
  'trial.booked-by-academy': 'confirmed',
  'teacher.account.ready': 'confirmed',
};

const TONE_STYLE: Record<Tone, { background: string; color: string }> = {
  important: { background: '#fbece7', color: '#b4482d' },
  action: { background: '#fdf1e3', color: '#a95f14' },
  confirmed: { background: '#f0f6f3', color: '#1c4c3e' },
  update: { background: '#f6ecd9', color: '#8a642b' },
};

const THEME = {
  sand: '#f3eee4',
  cream: '#faf7f1',
  line: '#e6dfd1',
  green950: '#0a1f19',
  green900: '#0f2c24',
  green50: '#f0f6f3',
  gold: '#c49a55',
  ink: '#10201b',
  ink2: '#3c4a45',
  muted: '#6b7772',
};

const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;

/**
 * Returns the branded HTML and plain-text alternative for one notification.
 *
 * The plain-text body stays the source of truth: the URL is taken out of the paragraph
 * and promoted to a button so the same message works in an HTML client and a watch.
 */
/** Files every email carries: the inline logo the header shows by cid. */
export const EMAIL_ATTACHMENTS = [
  {
    filename: 'hifzoon-logo.png',
    content: Buffer.from(EMAIL_LOGO_PNG_BASE64, 'base64'),
    contentType: 'image/png',
    cid: EMAIL_LOGO_CID,
  },
];

export function renderEmail(input: EmailTemplateInput): { html: string; text: string } {
  const locale = normaliseLocale(input.locale);
  const copy = COPY[locale];
  const tone = TONE_BY_TEMPLATE[input.template] ?? 'update';
  const toneStyle = TONE_STYLE[tone];
  const cta = resolveCta(input);
  const code =
    input.template === 'consent.guardian-verification' ? stringValue(input.data.code) : null;
  const body = cta ? stripCallToAction(input.body, cta.url, input.template) : input.body.trim();
  const paragraphs = body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const preheader = summarise(input.body);
  const font = copy.font;

  const bodyHtml = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-family:${font};font-size:16px;line-height:1.65;color:${THEME.ink2};">${linkify(paragraph)}</p>`,
    )
    .join('');

  const codeHtml = code
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;">
        <tr>
          <td align="center" style="background:${THEME.green50};border:1px dashed ${THEME.gold};border-radius:12px;padding:18px 16px;">
            <div style="font-family:${font};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${THEME.muted};margin-bottom:8px;">${escapeHtml(copy.tone.confirmed)}</div>
            <div dir="ltr" style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:${THEME.green900};">${escapeHtml(code)}</div>
          </td>
        </tr>
      </table>`
    : '';

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
        <tr>
          <td align="center" bgcolor="${THEME.gold}" style="border-radius:999px;background:${THEME.gold};">
            <a href="${escapeAttribute(cta.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;font-family:${font};font-size:15px;font-weight:700;line-height:1.2;color:${THEME.green950};text-decoration:none;padding:15px 30px;border-radius:999px;">${escapeHtml(copy.cta[cta.kind])}</a>
          </td>
        </tr>
      </table>`
    : '';

  // The site's own logo, in the white tile it sits on in the site header, beside the name.
  // It is attached to the message (see EMAIL_ATTACHMENTS) and shown by cid, so it loads in
  // every inbox: a link to the site breaks whenever the site isn't public (local, staging).
  const logoHtml = `<td style="vertical-align:middle;width:60px;padding-${copy.dir === 'rtl' ? 'left' : 'right'}:14px;">
                    <span style="display:inline-block;background:#ffffff;border-radius:12px;padding:6px;line-height:0;">
                      <img src="cid:${EMAIL_LOGO_CID}" width="40" height="40" alt="Hifzoon" style="display:block;width:40px;height:40px;" />
                    </span>
                  </td>`;

  const html = `<!doctype html>
<html lang="${copy.lang}" dir="${copy.dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${escapeHtml(input.subject)}</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; background: ${THEME.sand}; }
    a { color: #143a2f; }
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; }
      .px { padding-left: 22px !important; padding-right: 22px !important; }
      .h1 { font-size: 24px !important; line-height: 1.25 !important; }
    }
  </style>
</head>
<body dir="${copy.dir}" style="margin:0;padding:0;background:${THEME.sand};">
  <div style="display:none;font-size:1px;color:${THEME.sand};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${THEME.sand};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${THEME.cream};border:1px solid ${THEME.line};border-radius:18px;overflow:hidden;">
          <tr>
            <td style="background:${THEME.green900};border-bottom:4px solid ${THEME.gold};padding:26px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  ${logoHtml}
                  <td style="vertical-align:middle;" align="${copy.dir === 'rtl' ? 'right' : 'left'}">
                    <span style="font-family:'Fraunces',Georgia,'Times New Roman',serif;font-size:29px;font-weight:600;letter-spacing:-0.02em;color:${THEME.cream};">Hifzoon</span>
                    <span style="display:block;margin-top:5px;font-family:${font};font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${THEME.gold};">${escapeHtml(copy.tagline)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:34px 32px 28px;" align="${copy.dir === 'rtl' ? 'right' : 'left'}">
              <span style="display:inline-block;margin-bottom:16px;background:${toneStyle.background};color:${toneStyle.color};font-family:${font};font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;padding:5px 11px;border-radius:999px;">${escapeHtml(copy.tone[tone])}</span>
              <h1 class="h1" style="margin:0 0 20px;font-family:${font};font-size:29px;font-weight:700;line-height:1.25;letter-spacing:-0.02em;color:${THEME.ink};">${escapeHtml(input.subject)}</h1>
              ${bodyHtml}
              ${codeHtml}
              ${ctaHtml}
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:0 32px 34px;">
              <div style="height:1px;background:${THEME.line};margin-bottom:22px;"></div>
              <p style="margin:0 0 8px;font-family:${font};font-size:12px;line-height:1.6;color:${THEME.muted};">${escapeHtml(copy.reason)}</p>
              <p style="margin:0;font-family:${font};font-size:12px;line-height:1.6;color:${THEME.muted};">${escapeHtml(copy.help)} <a href="mailto:${SUPPORT_EMAIL}" style="color:${THEME.green900};text-decoration:underline;">${SUPPORT_EMAIL}</a>.</p>
              <p style="margin:18px 0 0;font-family:'Fraunces',Georgia,'Times New Roman',serif;font-size:15px;color:${THEME.green900};">Hifzoon</p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-family:${font};font-size:11px;line-height:1.5;color:${THEME.muted};text-align:center;">&copy; ${new Date().getFullYear()} Hifzoon Quran Academy</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    input.subject,
    '',
    input.body,
    code && !input.body.includes(code) ? `\n${copy.tone.confirmed}: ${code}` : '',
    cta && !input.body.includes(cta.url) ? `\n${copy.cta[cta.kind]}: ${cta.url}` : '',
    '',
    '--',
    'Hifzoon Quran Academy',
    copy.reason,
    `${copy.help} ${SUPPORT_EMAIL}`,
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { html, text };
}

function resolveCta(input: EmailTemplateInput): { url: string; kind: CtaKind } | null {
  const mapped = CTA_BY_TEMPLATE[input.template];
  if (mapped) {
    const value = stringValue(input.data[mapped.field]);
    if (isHttpUrl(value)) return { url: value, kind: mapped.kind };
  }

  const match = input.body.match(URL_PATTERN);
  if (!match) return null;
  const url = match[0].replace(/[),.;!?]+$/, '');
  return isHttpUrl(url) ? { url, kind: 'open' } : null;
}

function stripCallToAction(body: string, url: string, template: string): string {
  const keepContext = template === 'auth.password-reset' || template === 'teacher.account.ready';
  const labels = [
    'Join',
    'Details',
    'Read the feedback and reply',
    'Review the class',
    'Set your password here',
    'Use this link within \\d+ minutes to choose a new password',
    'Manage it any time',
    'Please pay or update your card here',
    'Please choose the weekly times',
    'Keep the plan here',
    'You can start again any time',
  ];
  const label = labels.join('|');
  const pattern = new RegExp(`(?:${label})(?:\\s*\\([^)]*\\))?\\s*:?\\s*${escapeRegExp(url)}`, 'i');
  const withoutLink = keepContext
    ? body.replace(url, '')
    : body.replace(pattern, '').replace(url, '');
  return withoutLink
    .replace(/\bChanged your mind\?\s*$/i, '')
    .replace(/[ \t]+([.,;!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[:;,]+\s*$/, '.')
    .trim();
}

function linkify(paragraph: string): string {
  return escapeHtml(paragraph).replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#1c4c3e;text-decoration:underline;">${url}</a>`,
  );
}

function summarise(body: string): string {
  const oneLine = body.replace(URL_PATTERN, '').replace(/\s+/g, ' ').trim();
  return oneLine.length > 150 ? `${oneLine.slice(0, 147)}...` : oneLine;
}

function normaliseLocale(locale: string): keyof typeof COPY {
  const base = String(locale ?? 'en')
    .toLowerCase()
    .split(/[-_]/)[0];
  return base === 'ur' || base === 'ar' ? base : 'en';
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
