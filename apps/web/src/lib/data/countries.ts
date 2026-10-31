/**
 * Countries, dial codes, currencies and timezones data module.
 * Backed by standard `countries-list` npm package and web Intl standards.
 */

import {
  countries,
  getCountryData,
  getCountryDataList,
  getEmojiFlag,
  type TCountryCode,
} from 'countries-list';

export interface CountryItem {
  code: string;
  name: string;
  native: string;
  flag: string;
  dialCode: string; // e.g. "+44"
  currency: string; // e.g. "GBP"
  continent: string;
}

export const COUNTRY_CODES: string[] = Object.keys(countries);

/**
 * Localized country display name using runtime Intl.DisplayNames,
 * falling back to countries-list official name.
 */
export function countryName(code: string, locale?: string): string {
  const upper = (code || '').toUpperCase();
  try {
    const lang = locale ?? (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en');
    const names = new Intl.DisplayNames([lang, 'en'], { type: 'region' });
    const resolved = names.of(upper);
    if (resolved) return resolved;
  } catch {
    // fall through
  }
  const data = getCountryData(upper as TCountryCode);
  return data?.name ?? upper;
}

/** `[{ code: 'PK', name: 'Pakistan' }, …]` sorted by display name. */
export function countryOptions(locale?: string): Array<{ code: string; name: string }> {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/** Validates whether a value is an ISO 3166-1 alpha-2 country code. */
export function isCountryCode(value: string | null | undefined): boolean {
  if (!value) return false;
  const upper = value.trim().toUpperCase();
  return upper in countries || COUNTRY_CODES.includes(upper);
}

/** Get structured country data for a 2-letter code */
export function getCountry(code: string | null | undefined): CountryItem | undefined {
  if (!code) return undefined;
  const upper = code.trim().toUpperCase();
  const data = getCountryData(upper as TCountryCode);
  if (!data) return undefined;
  const dial = data.phone && data.phone.length > 0 ? `+${data.phone[0]}` : '';
  const curr = data.currency && data.currency.length > 0 ? data.currency[0] : '';
  let flag = '🌐';
  try {
    flag = getEmojiFlag(upper as TCountryCode) || '🌐';
  } catch {
    flag = '🌐';
  }
  return {
    code: upper,
    name: data.name,
    native: data.native || data.name,
    flag,
    dialCode: dial,
    currency: curr,
    continent: data.continent,
  };
}

/** Returns all countries sorted alphabetically by English name. */
export function getAllCountries(): CountryItem[] {
  return getCountryDataList()
    .map((c) => {
      let flag = '🌐';
      try {
        flag = getEmojiFlag(c.iso2 as TCountryCode) || '🌐';
      } catch {
        flag = '🌐';
      }
      return {
        code: c.iso2,
        name: c.name,
        native: c.native || c.name,
        flag,
        dialCode: c.phone && c.phone.length > 0 ? `+${c.phone[0]}` : '',
        currency: c.currency && c.currency.length > 0 ? c.currency[0] : '',
        continent: c.continent,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Get international dialing prefix (e.g. "+44" for "GB", "+92" for "PK") */
export function getCallingCode(countryCode: string): string {
  const c = getCountry(countryCode);
  return c?.dialCode || '';
}

/** Look up country from calling code */
export function getCountryByDialCode(dialCode: string): CountryItem | undefined {
  const clean = dialCode.replace(/\D/g, '');
  if (!clean) return undefined;
  const target = `+${clean}`;
  const all = getAllCountries();
  return all.find((c) => c.dialCode === target);
}

export interface CurrencyItem {
  code: string;
  symbol: string;
  name: string;
  flag?: string;
}

/** The billing currencies the API accepts (Prisma `Currency`); nothing else can be saved. */
export const SUPPORTED_CURRENCIES: CurrencyItem[] = [
  { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧' },
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'AUD', symbol: 'AU$', name: 'Australian Dollar', flag: '🇦🇺' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', flag: '🇦🇪' },
  { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee', flag: '🇵🇰' },
]

export interface TimezoneItem {
  value: string;
  label: string;
  offset: string;
  region: string;
  isCommon?: boolean;
}

export const COMMON_TIMEZONES = [
  'Europe/London',
  'America/New_York',
  'America/Chicago',
  'America/Toronto',
  'America/Los_Angeles',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Kuala_Lumpur',
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Australia/Sydney',
  'UTC',
];

export function getTimeZoneOffset(tz: string): string {
  try {
    const d = new Date();
    const str = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).format(d);
    const match = str.match(/GMT([+-]\d{2}:\d{2})/);
    return match ? `UTC${match[1]}` : 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getAllTimezones(detected?: string): TimezoneItem[] {
  let list: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    list = intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : [];
  } catch {
    list = [];
  }
  if (!list || list.length === 0) {
    list = COMMON_TIMEZONES;
  }
  const set = new Set(list);
  if (detected) set.add(detected);
  set.add('UTC');

  const all = Array.from(set).map((tz) => {
    const offset = getTimeZoneOffset(tz);
    const region = tz.split('/')[0] || 'Other';
    const isCommon = COMMON_TIMEZONES.includes(tz);
    return {
      value: tz,
      label: `${tz.replace(/_/g, ' ')} (${offset})`,
      offset,
      region,
      isCommon,
    };
  });

  return all.sort((a, b) => {
    if (detected && a.value === detected) return -1;
    if (detected && b.value === detected) return 1;
    return a.value.localeCompare(b.value);
  });
}
