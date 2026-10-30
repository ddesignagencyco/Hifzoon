import { http } from '../http';

export type SettingValue = string | number | boolean;
export type SettingType = 'string' | 'number' | 'boolean';

/** `GET /admin/settings` row (SettingsService.describe). `value` is absent when unset with no default. */
export interface SettingDescriptor {
  key: string;
  type: SettingType;
  value?: SettingValue;
}

export const settingsApi = {
  list: () => http.get<SettingDescriptor[]>('/admin/settings'),
  /** SUPER_ADMIN only. Returns the applied `{ key: value }` map. */
  update: (patch: Record<string, SettingValue>) =>
    http.patch<Record<string, unknown>>('/admin/settings', { patch }),
  /** SUPER_ADMIN only. Purges the Quran content cache (CR-11). */
  clearMushafCache: (expiredOnly = false) =>
    http.delete<{ deleted: number }>('/mushaf/cache', { query: expiredOnly ? { expiredOnly: 'true' } : undefined }),
};

/** Groups settings by the first dotted segment (`billing.invoice_due_days` → `billing`). */
export function groupSettings(settings: SettingDescriptor[]): Array<{ group: string; items: SettingDescriptor[] }> {
  const map = new Map<string, SettingDescriptor[]>();
  for (const s of settings) {
    const group = s.key.split('.')[0] ?? 'other';
    map.set(group, [...(map.get(group) ?? []), s]);
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }));
}

/**
 * The settings the platform actually reads, in plain words. Anything the API registers but
 * no code reads yet is left off the screen: changing it would do nothing, which is worse
 * than not showing it.
 */
export interface SettingInfo {
  section: SettingSection;
  label: string;
  help: string;
  unit?: string;
}

export const SETTING_SECTIONS = ['Trials', 'Classes', 'Billing', 'Quality & consent'] as const;
export type SettingSection = (typeof SETTING_SECTIONS)[number];

export const SETTING_CATALOGUE: Record<string, SettingInfo> = {
  'platform.trial.enabled': {
    section: 'Trials',
    label: 'Free trials can be booked',
    help: 'Turn off to stop new trial bookings on the website and in admin.',
  },
  'trial.default_duration_minutes': {
    section: 'Trials',
    label: 'Trial class length',
    help: 'How long each free trial class lasts.',
    unit: 'minutes',
  },
  'scheduling.cancellation_notice_hours': {
    section: 'Classes',
    label: 'Free cancellation notice',
    help: 'A class cancelled or moved at least this long before it starts gets a make-up credit. Later than that, it counts as taken.',
    unit: 'hours',
  },
  'billing.invoice_due_days': {
    section: 'Billing',
    label: 'Days to pay an invoice',
    help: 'For invoices the academy issues by hand. Card subscriptions are charged automatically by Stripe.',
    unit: 'days',
  },
  'billing.dunning_retry_days': {
    section: 'Billing',
    label: 'Payment retries before cancelling',
    help: 'Retries on day 1, 3 and 7 (up to 3) for academy-issued invoices; 0 cancels on the first failure. Card subscriptions are retried by Stripe.',
    unit: 'retries',
  },
  'qa.samples_per_teacher_per_month': {
    section: 'Quality & consent',
    label: 'Classes reviewed per teacher each month',
    help: 'How many recorded classes per teacher are picked for a supervisor review every month.',
    unit: 'classes',
  },
  'consent.policy_version': {
    section: 'Quality & consent',
    label: 'Privacy policy version',
    help: 'Saved with every consent a family gives. Change it when the privacy policy changes.',
  },
};

/** Settings shown on screen, by section, in the catalogue's order. */
export function groupKnownSettings(settings: SettingDescriptor[]) {
  const known = new Map(settings.filter((s) => SETTING_CATALOGUE[s.key]).map((s) => [s.key, s]));
  return SETTING_SECTIONS.map((section) => ({
    section,
    items: Object.entries(SETTING_CATALOGUE)
      .filter(([key, info]) => info.section === section && known.has(key))
      .map(([key]) => known.get(key) as SettingDescriptor),
  })).filter((g) => g.items.length > 0);
}

/** `billing.invoice_due_days` → `Invoice due days`; `platform.branding.name` → `Branding name`. */
export function settingLabel(key: string): string {
  if (SETTING_CATALOGUE[key]) return SETTING_CATALOGUE[key].label;
  const rest = key.split('.').slice(1).join(' ').replace(/_/g, ' ').trim();
  const text = rest || key;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Draft values are edited as strings (numbers/text) or booleans. */
export type SettingDraft = Record<string, string | boolean>;

export function toDraft(settings: SettingDescriptor[]): SettingDraft {
  const draft: SettingDraft = {};
  for (const s of settings) {
    if (s.type === 'boolean') draft[s.key] = s.value === true;
    else draft[s.key] = s.value === undefined || s.value === null ? '' : String(s.value);
  }
  return draft;
}

export interface SettingsDiff {
  patch: Record<string, SettingValue>;
  errors: Record<string, string>;
}

/**
 * Computes the minimal patch between the server copy and the draft, with the same type
 * rules as SettingsService.set (finite, non-negative numbers; strings ≤ 2000 chars).
 */
export function diffSettings(settings: SettingDescriptor[], draft: SettingDraft): SettingsDiff {
  const patch: Record<string, SettingValue> = {};
  const errors: Record<string, string> = {};
  for (const s of settings) {
    if (!(s.key in draft)) continue;
    const next = draft[s.key];
    if (s.type === 'boolean') {
      const current = s.value === true;
      if (next !== current) patch[s.key] = Boolean(next);
      continue;
    }
    const text = String(next);
    const currentText = s.value === undefined || s.value === null ? '' : String(s.value);
    if (s.type === 'number') {
      if (text.trim() === currentText) continue;
      if (text.trim() === '') {
        errors[s.key] = 'Enter a number.';
        continue;
      }
      const n = Number(text);
      if (!Number.isFinite(n)) errors[s.key] = 'Must be a finite number.';
      else if (n < 0) errors[s.key] = 'Cannot be negative.';
      else if (n !== s.value) patch[s.key] = n;
      continue;
    }
    if (text === currentText) continue;
    if (text.length > 2000) errors[s.key] = 'Must be at most 2000 characters.';
    else patch[s.key] = text;
  }
  return { patch, errors };
}
