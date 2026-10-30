'use client';

import React, { useId, useMemo } from 'react';
import ReactSelect, { type SingleValue, components } from 'react-select';
import { cn } from '@/lib/utils';
import { getAllCountries } from '@/lib/data/countries';
import { ChevronDown, Globe } from 'lucide-react';

export interface CountryOption {
  value: string;
  label: string;
  name: string;
  dialCode: string;
}

export interface CountrySelectProps {
  /** `pill` matches the public-site inputs; `default` matches portal forms. */
  appearance?: 'default' | 'pill';
  id?: string;
  name?: string;
  value?: string | null;
  onChange?: (value: string, e?: React.ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  selectClassName?: string;
  error?: string | boolean;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  autoComplete?: string;
}

/**
 * Modern, accessible country selector dropdown with styled ISO codes and dial codes.
 * Built with react-select for search filtering, exact 46px height, and zero header overlap.
 */
export function CountrySelect({
  appearance = 'default',
  id: explicitId,
  name,
  value,
  onChange,
  placeholder = 'Choose a country…',
  required = false,
  disabled = false,
  className,
  selectClassName,
  error,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: CountrySelectProps) {
  const instanceId = useId();
  const id = explicitId || instanceId;

  const options: CountryOption[] = useMemo(() => {
    return getAllCountries().map((c) => ({
      value: c.code,
      label: `${c.name} (${c.code}) ${c.dialCode}`,
      name: c.name,
      dialCode: c.dialCode,
    }));
  }, []);

  const selectedOption = useMemo(() => {
    if (!value) return null;
    return options.find((opt) => opt.value.toUpperCase() === value.toUpperCase()) ?? null;
  }, [value, options]);

  const hasError = Boolean(error) || ariaInvalid === true || ariaInvalid === 'true';

  const handleChange = (selected: SingleValue<CountryOption>) => {
    const nextVal = selected?.value ?? '';
    if (!onChange) return;
    const target = { value: nextVal, name: name ?? '', id } as unknown as HTMLSelectElement;
    onChange(nextVal, { target, currentTarget: target } as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <div className={cn('relative w-full', className)}>
      <ReactSelect<CountryOption, false>
        instanceId={instanceId}
        inputId={id}
        name={name}
        options={options}
        value={selectedOption}
        onChange={handleChange}
        isDisabled={disabled}
        required={required}
        isSearchable
        placeholder={placeholder}
        aria-label="Country of residence"
        aria-invalid={hasError || undefined}
        aria-describedby={ariaDescribedBy}
        menuPlacement="bottom"
        maxMenuHeight={260}
        noOptionsMessage={() => 'No countries found'}
        unstyled
        className="w-full"
        classNamePrefix="hz-country-select"
        components={{
          DropdownIndicator: () => (
            <ChevronDown className="w-4 h-4 text-muted shrink-0 mr-1" aria-hidden="true" />
          ),
          Placeholder: (props) => (
            <components.Placeholder {...props}>
              <span className="flex items-center gap-2 text-muted/70 text-sm truncate select-none">
                <Globe className="w-4 h-4 text-muted/60 shrink-0" aria-hidden="true" />
                <span>{props.children}</span>
              </span>
            </components.Placeholder>
          ),
          SingleValue: (props) => (
            <components.SingleValue {...props}>
              <span className="flex items-center gap-2 text-ink text-sm truncate leading-normal">
                <span className="inline-flex items-center justify-center min-w-[28px] h-[20px] px-1 rounded bg-[#f0f6f3] text-[#143a2f] text-[10px] font-mono font-bold border border-[#143a2f]/20 shrink-0 select-none">
                  {props.data.value}
                </span>
                <span className="truncate font-medium">{props.data.name}</span>
              </span>
            </components.SingleValue>
          ),
          Option: (props) => (
            <components.Option {...props}>
              <div
                className={cn(
                  'flex items-center gap-2.5 px-3.5 py-2 cursor-pointer text-xs sm:text-sm transition-colors',
                  props.isSelected
                    ? 'bg-sand text-ink font-medium'
                    : props.isFocused
                      ? 'bg-[#f4efe6] text-ink'
                      : 'text-ink'
                )}
              >
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-[28px] h-[20px] px-1 rounded text-[10px] font-mono font-bold shrink-0 select-none',
                    props.isSelected
                      ? 'bg-white text-[#143a2f] border border-[#143a2f]/20'
                      : 'bg-[#f0f6f3] text-[#143a2f] border border-[#143a2f]/20'
                  )}
                >
                  {props.data.value}
                </span>
                <span className="flex-1 truncate font-medium">{props.data.name}</span>
                {props.data.dialCode && (
                  <span
                    className={cn(
                      'text-xs font-mono shrink-0',
                      props.isSelected ? 'text-muted' : 'text-muted'
                    )}
                  >
                    {props.data.dialCode}
                  </span>
                )}
              </div>
            </components.Option>
          ),
        }}
        classNames={{
          control: ({ isFocused, isDisabled }) =>
            cn(
              appearance === 'pill'
                ? 'w-full h-[46px] min-h-[46px] max-h-[46px] px-3.5 rounded-full border bg-cream text-ink text-sm cursor-pointer transition-colors flex items-center'
                : 'w-full h-10 min-h-10 px-3 rounded-xl border bg-white text-ink text-sm cursor-pointer transition-colors flex items-center',
              hasError
                ? 'border-red ring-1 ring-red/30'
                : isFocused
                  ? 'border-gold ring-2 ring-gold/40'
                  : 'border-line hover:border-gold/60',
              isDisabled && 'bg-sand cursor-not-allowed opacity-60',
              selectClassName
            ),
          valueContainer: () => 'grid grid-cols-1 items-center h-full flex-1 overflow-hidden py-0 my-0',
          placeholder: () => '[grid-area:1/1/2/3] flex items-center m-0 p-0 truncate text-muted/70',
          singleValue: () => '[grid-area:1/1/2/3] flex items-center m-0 p-0 truncate text-ink',
          input: () => '[grid-area:1/1/2/3] m-0 p-0 text-ink text-sm leading-normal',
          indicatorsContainer: () => 'gap-1 h-full flex items-center shrink-0',
          indicatorSeparator: () => 'hidden',
          menu: () =>
            'mt-1 rounded-lg border border-line bg-white p-1 shadow-md text-sm overflow-hidden z-40',
          menuList: () => 'max-h-60 overflow-y-auto',
          noOptionsMessage: () => 'px-3.5 py-2 text-muted text-xs',
        }}
      />
    </div>
  );
}
