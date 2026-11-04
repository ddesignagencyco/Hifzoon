'use client';

import React, { useId, useMemo, useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { getAllCountries, CountryItem, getCountry } from '@/lib/data/countries';
import { ChevronDown, Phone, Search, Check } from 'lucide-react';

export interface PhoneInputProps {
  id?: string;
  name?: string;
  value?: string;
  onChange?: (value: string, e?: React.ChangeEvent<HTMLInputElement>) => void;
  country?: string;
  onCountryChange?: (countryCode: string) => void;
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

/** Formats subscriber digits dynamically based on dial code */
export function formatPhoneNumber(digitsOnly: string, dialCode: string): string {
  const digits = digitsOnly.replace(/\D/g, '');
  if (!digits) return '';

  // North America (+1: US, CA, etc.)
  if (dialCode === '+1') {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)} ${digits.slice(10)}`;
  }

  // UK (+44)
  if (dialCode === '+44') {
    if (digits.length <= 4) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`;
  }

  // Pakistan (+92)
  if (dialCode === '+92') {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
  }

  // UAE (+971), Saudi Arabia (+966)
  if (dialCode === '+971' || dialCode === '+966') {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
    return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 9)}`;
  }

  // Standard international grouping (groups of 3-4 digits)
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)} ${digits.slice(10, 14)}`;
}

/**
 * Parses a combined international phone string into dial code and subscriber number.
 */
function parsePhoneNumber(raw: string | undefined, defaultCountry: string, countries: CountryItem[]) {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    const def = getCountry(defaultCountry) || countries.find((c) => c.code === defaultCountry.toUpperCase()) || countries[0];
    return { countryCode: def?.code || 'US', dialCode: def?.dialCode || '+1', localNumber: '' };
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

  const def = getCountry(defaultCountry) || countries.find((c) => c.code === defaultCountry.toUpperCase()) || countries[0];
  return { countryCode: def?.code || 'US', dialCode: def?.dialCode || '+1', localNumber: trimmed };
}

/**
 * International Phone / Mobile input with custom searchable country picker & live number formatter.
 */
export function PhoneInput({
  id: explicitId,
  name,
  value,
  onChange,
  country: controlledCountry,
  onCountryChange,
  defaultCountry = 'US',
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const countries = useMemo(() => getAllCountries(), []);
  const countriesWithPhone = useMemo(() => countries.filter((c) => Boolean(c.dialCode)), [countries]);

  const parsed = useMemo(
    () => parsePhoneNumber(value, controlledCountry || defaultCountry, countriesWithPhone),
    [value, controlledCountry, defaultCountry, countriesWithPhone]
  );

  const [selectedCode, setSelectedCode] = useState(controlledCountry || parsed.countryCode);
  const currentCountry = useMemo(
    () => countriesWithPhone.find((c) => c.code === selectedCode) || countriesWithPhone[0],
    [countriesWithPhone, selectedCode]
  );

  const initialFormatted = useMemo(() => {
    const dial = currentCountry?.dialCode || '+1';
    return formatPhoneNumber(parsed.localNumber, dial);
  }, [parsed.localNumber, currentCountry]);

  const [localNumber, setLocalNumber] = useState(initialFormatted);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync external value / controlled country changes
  useEffect(() => {
    if (controlledCountry && controlledCountry !== selectedCode) {
      setSelectedCode(controlledCountry);
    }
  }, [controlledCountry, selectedCode]);

  useEffect(() => {
    const dial = currentCountry?.dialCode || '+1';
    const formatted = formatPhoneNumber(parsed.localNumber, dial);
    setLocalNumber(formatted);
  }, [parsed.localNumber, currentCountry]);

  // Click outside listener for custom dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Auto focus search
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filter countries for dropdown search
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) return countriesWithPhone;
    const q = searchQuery.toLowerCase().trim();
    return countriesWithPhone.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.dialCode.toLowerCase().includes(q)
    );
  }, [countriesWithPhone, searchQuery]);

  const handleSelectCountry = (country: CountryItem) => {
    setSelectedCode(country.code);
    onCountryChange?.(country.code);
    setIsOpen(false);
    setSearchQuery('');

    // Re-format current local digits with new country dial code
    const rawDigits = localNumber.replace(/\D/g, '');
    const formatted = formatPhoneNumber(rawDigits, country.dialCode);
    setLocalNumber(formatted);
    const combined = rawDigits ? `${country.dialCode} ${formatted}` : '';
    onChange?.(combined);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value;
    const rawDigits = rawInput.replace(/\D/g, '');
    const dial = currentCountry?.dialCode || '+1';
    const formatted = formatPhoneNumber(rawDigits, dial);

    setLocalNumber(formatted);
    const combined = rawDigits ? `${dial} ${formatted}` : '';
    onChange?.(combined, e);
  };

  const hasError = Boolean(error) || ariaInvalid === true || ariaInvalid === 'true';

  return (
    <div className={cn('relative w-full', className)} ref={dropdownRef}>
      <div
        className={cn(
          'flex items-center rounded-full border bg-cream transition-all',
          'focus-within:ring-2 focus-within:ring-gold focus-within:border-transparent',
          hasError ? 'border-red ring-1 ring-red/30' : 'border-line hover:border-gold/60',
          disabled && 'opacity-60 cursor-not-allowed'
        )}
      >
        {/* Country Code Trigger Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          className={cn(
            'relative flex items-center gap-1.5 pl-3.5 pr-2.5 py-2.5 shrink-0 border-r border-line/60 bg-sand/30 hover:bg-sand/60 transition-colors select-none text-xs sm:text-sm font-medium text-ink cursor-pointer focus:outline-none',
            disabled && 'cursor-not-allowed hover:bg-sand/30'
          )}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={`Select country code, currently ${currentCountry?.name} (${currentCountry?.dialCode})`}
        >
          <span className="text-base select-none leading-none" aria-hidden="true">
            {currentCountry?.flag || '🌐'}
          </span>
          <span className="text-xs font-semibold text-ink/90">{currentCountry?.code}</span>
          <span className="font-mono text-ink/80 text-xs">{currentCountry?.dialCode || '+1'}</span>
          <ChevronDown
            className={cn('w-3.5 h-3.5 text-muted transition-transform duration-200', isOpen && 'rotate-180')}
            aria-hidden="true"
          />
        </button>

        {/* Local Phone Number Input */}
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

      {/* Custom Searchable Country Popover Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-72 sm:w-80 rounded-2xl border border-line bg-cream shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          {/* Search Header */}
          <div className="p-2.5 border-b border-line bg-sand/20">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-muted absolute left-3 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search country or dial code..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-line bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>
          </div>

          {/* Scrollable Country List */}
          <div className="max-h-60 overflow-y-auto p-1.5 divide-y divide-line/20">
            {filteredCountries.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted">No countries found</div>
            ) : (
              filteredCountries.map((c) => {
                const isSelected = c.code === selectedCode;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleSelectCountry(c)}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-xl transition-colors cursor-pointer text-left',
                      isSelected ? 'bg-sand text-ink font-semibold' : 'text-ink hover:bg-sand/40'
                    )}
                  >
                    <div className="flex items-center gap-2.5 truncate min-w-0">
                      <span className="text-base leading-none shrink-0" aria-hidden="true">
                        {c.flag}
                      </span>
                      <span className="truncate">{c.name}</span>
                      <span className="text-[10px] font-mono text-muted uppercase shrink-0">({c.code})</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs font-medium text-ink-2 bg-sand/60 px-1.5 py-0.5 rounded">
                        {c.dialCode}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-green-800 shrink-0" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
