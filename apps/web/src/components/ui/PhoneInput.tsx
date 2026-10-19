'use client';

import React, { useId, useMemo, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { getAllCountries, CountryItem, getCountry } from '@/lib/data/countries';
import { ChevronDown, Phone } from 'lucide-react';

export interface PhoneInputProps {
  id?: string;
  name?: string;
  value?: string;
  onChange?: (value: string, e?: React.ChangeEvent<HTMLInputElement>) => void;
  defaultCountry?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  error?: string | boolean;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  autoComplete?: string;
}

/**
 * Parses a combined international phone string into dial code and subscriber number.
 */
function parsePhoneNumber(raw: string | undefined, defaultCountry: string, countries: CountryItem[]) {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    const def = getCountry(defaultCountry) || countries.find((c) => c.code === 'GB') || countries[0];
    return { countryCode: def?.code || 'GB', dialCode: def?.dialCode || '+44', localNumber: '' };
  }

  if (trimmed.startsWith('+')) {
    // Sort dial codes by length descending (e.g. +966 before +96) to match longest prefix
    const sorted = [...countries]
      .filter((c) => c.dialCode)
      .sort((a, b) => b.dialCode.length - a.dialCode.length);

    for (const c of sorted) {
      if (trimmed.startsWith(c.dialCode)) {
        const local = trimmed.slice(c.dialCode.length).trim();
        return { countryCode: c.code, dialCode: c.dialCode, localNumber: local };
      }
    }
  }

  const def = getCountry(defaultCountry) || countries.find((c) => c.code === 'GB') || countries[0];
  return { countryCode: def?.code || 'GB', dialCode: def?.dialCode || '+44', localNumber: trimmed };
}

/**
 * International Phone / Mobile input with country calling code dropdown.
 * Backed by countries-list dataset.
 */
export function PhoneInput({
  id: explicitId,
  name,
  value,
  onChange,
  defaultCountry = 'GB',
  placeholder = '7700 900123',
  required = false,
  disabled = false,
  className,
  error,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  autoComplete = 'tel',
}: PhoneInputProps) {
  const generatedId = useId();
  const id = explicitId || generatedId;
  const countries = useMemo(() => getAllCountries(), []);

  // Filter countries with valid calling codes
  const countriesWithPhone = useMemo(
    () => countries.filter((c) => c.dialCode),
    [countries]
  );

  const parsed = useMemo(
    () => parsePhoneNumber(value, defaultCountry, countriesWithPhone),
    [value, defaultCountry, countriesWithPhone]
  );

  const [selectedCode, setSelectedCode] = useState(parsed.countryCode);
  const [localNumber, setLocalNumber] = useState(parsed.localNumber);

  useEffect(() => {
    setSelectedCode(parsed.countryCode);
    setLocalNumber(parsed.localNumber);
  }, [parsed.countryCode, parsed.localNumber]);

  const currentCountry = useMemo(
    () => countriesWithPhone.find((c) => c.code === selectedCode) || countriesWithPhone[0],
    [countriesWithPhone, selectedCode]
  );

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCode = e.target.value;
    setSelectedCode(newCode);
    const country = countriesWithPhone.find((c) => c.code === newCode);
    const dial = country?.dialCode || '+44';
    const combined = localNumber.trim() ? `${dial} ${localNumber.trim()}` : '';
    onChange?.(combined);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = e.target.value.replace(/[^\d\s()-]/g, '');
    setLocalNumber(clean);
    const dial = currentCountry?.dialCode || '+44';
    const combined = clean.trim() ? `${dial} ${clean.trim()}` : '';
    onChange?.(combined, e);
  };

  const hasError = Boolean(error) || ariaInvalid === true || ariaInvalid === 'true';

  return (
    <div className={cn('relative w-full', className)}>
      <div
        className={cn(
          'flex items-center rounded-full border bg-cream transition-all overflow-hidden',
          'focus-within:ring-2 focus-within:ring-gold focus-within:border-transparent',
          hasError ? 'border-red ring-1 ring-red/30' : 'border-line hover:border-gold/60',
          disabled && 'opacity-60 cursor-not-allowed'
        )}
      >
        {/* Calling code picker */}
        <div className="relative flex items-center shrink-0 border-r border-line/60 bg-sand/30 hover:bg-sand/60 transition-colors">
          <label htmlFor={`${id}-country`} className="sr-only">
            Country dial code
          </label>
          <div className="flex items-center gap-1.5 pl-3.5 pr-6 py-2.5 cursor-pointer pointer-events-none select-none text-xs sm:text-sm font-medium text-ink">
            <span className="text-base" aria-hidden="true">
              {currentCountry?.flag || '🌐'}
            </span>
            <span className="font-mono text-ink text-xs">{currentCountry?.dialCode || '+44'}</span>
          </div>

          <select
            id={`${id}-country`}
            value={selectedCode}
            onChange={handleCountryChange}
            disabled={disabled}
            aria-label="Country dial code"
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          >
            {countriesWithPhone.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name} ({c.dialCode})
              </option>
            ))}
          </select>

          <ChevronDown
            className="w-3.5 h-3.5 text-muted absolute right-2 pointer-events-none select-none"
            aria-hidden="true"
          />
        </div>

        {/* Local phone number input */}
        <div className="relative flex-1 flex items-center">
          <Phone
            className="w-3.5 h-3.5 text-muted/60 absolute left-3 pointer-events-none select-none"
            aria-hidden="true"
          />
          <input
            id={id}
            name={name}
            type="tel"
            value={localNumber}
            onChange={handleNumberChange}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            autoComplete={autoComplete}
            aria-invalid={hasError ? true : undefined}
            aria-describedby={ariaDescribedBy}
            className="w-full pl-8 pr-4 py-2.5 bg-transparent text-xs sm:text-sm text-ink placeholder:text-muted/60 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
