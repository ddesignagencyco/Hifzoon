/**
 * ISO 3166-1 alpha-2 codes. Display names are resolved at runtime with
 * `Intl.DisplayNames`, so the list stays compact and localised.
 */
const CODES =
  'AE AF AL AM AO AR AT AU AZ BA BD BE BG BH BJ BN BO BR BW BY CA CH CI CL CM CN CO CR CY CZ DE DJ DK DZ EC EE EG ES ET FI FJ FR GB GE GH GM GN GR GT GY HK HR HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KM KR KW KZ LB LK LR LT LU LV LY MA MD ME MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NL NO NP NZ OM PA PE PH PK PL PS PT QA RO RS RU RW SA SD SE SG SI SK SL SN SO SR SS SY TD TG TH TJ TM TN TR TT TW TZ UA UG US UY UZ VE VN YE ZA ZM ZW';

export const COUNTRY_CODES: string[] = CODES.split(' ');

export function countryName(code: string, locale?: string): string {
  try {
    const lang = locale ?? (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en');
    const names = new Intl.DisplayNames([lang, 'en'], { type: 'region' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** `[{ code: 'PK', name: 'Pakistan' }, …]` sorted by display name. */
export function countryOptions(locale?: string): Array<{ code: string; name: string }> {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function isCountryCode(value: string | null | undefined): boolean {
  return !!value && COUNTRY_CODES.includes(value);
}
