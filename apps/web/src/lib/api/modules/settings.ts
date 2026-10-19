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

/** `billing.invoice_due_days` → `Invoice due days`; `platform.branding.name` → `Branding name`. */
export function settingLabel(key: string): string {
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
