'use client';

import React, { useId, useMemo } from 'react';
import ReactSelect, { type SingleValue, components } from 'react-select';
import { cn } from '@/lib/utils';
import { SUPPORTED_CURRENCIES } from '@/lib/data/countries';
import { ChevronDown, Coins } from 'lucide-react';

export interface CurrencyOption {
  value: string;
  label: string;
  code: string;
  symbol: string;
  name: string;
  flag?: string;
}

export interface CurrencySelectProps {
  /** `pill` matches the public-site inputs; `default` matches portal forms. */
  appearance?: 'default' | 'pill';
  id?: string;
  name?: string;
  value?: string | null;
  onChange?: (value: string, e?: React.ChangeEvent<HTMLSelectElement>) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  selectClassName?: string;
  error?: string | boolean;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
}

/**
 * Currency selector dropdown showing currency symbol, ISO code, name, and regional flag.
 * Built with react-select for consistent styling and uniform 46px height across the site.
 */
export function CurrencySelect({
  appearance = 'default',
  id: explicitId,
  name,
  value,
  onChange,
  required = false,
  disabled = false,
  className,
  selectClassName,
  error,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: CurrencySelectProps) {
  const instanceId = useId();
  const id = explicitId || instanceId;

  const options: CurrencyOption[] = useMemo(() => {
    return SUPPORTED_CURRENCIES.map((c) => ({
      value: c.code,
      label: `${c.flag ? `${c.flag} ` : ''}${c.code} (${c.symbol}) — ${c.name}`,
      code: c.code,
      symbol: c.symbol,
      name: c.name,
      flag: c.flag,
    }));
  }, []);

  const selectedOption = useMemo(() => {
    const target = value ?? 'USD';
    return options.find((opt) => opt.value === target) ?? {
      value: target,
      label: target,
      code: target,
      symbol: '$',
      name: target,
    };
  }, [value, options]);

  const hasError = Boolean(error) || ariaInvalid === true || ariaInvalid === 'true';
  const portalTarget = typeof document === 'undefined' ? null : document.body;

  const handleChange = (selected: SingleValue<CurrencyOption>) => {
    const nextVal = selected?.value ?? 'USD';
    if (!onChange) return;
    const target = { value: nextVal, name: name ?? '', id } as unknown as HTMLSelectElement;
    onChange(nextVal, { target, currentTarget: target } as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <div className={cn('relative w-full', className)}>
      <ReactSelect<CurrencyOption, false>
        instanceId={instanceId}
        inputId={id}
        name={name}
        options={options}
        value={selectedOption}
        onChange={handleChange}
        isDisabled={disabled}
        required={required}
        isSearchable={false}
        aria-label="Billing currency"
        aria-invalid={hasError || undefined}
        aria-describedby={ariaDescribedBy}
        menuPortalTarget={portalTarget}
        menuPlacement="bottom"
        maxMenuHeight={260}
        unstyled
        className="w-full"
        classNamePrefix="hz-currency-select"
        styles={{
          // Above dialogs (Modal is z-50) so a select inside a modal opens on top; below toasts (z-60).
          menuPortal: (base) => ({ ...base, zIndex: 55 }),
        }}
        components={{
          DropdownIndicator: () => (
            <ChevronDown className="w-4 h-4 text-muted shrink-0 mr-1" aria-hidden="true" />
          ),
          // Wrap react-select's own SingleValue so it keeps its grid cell and classNames.
          SingleValue: (props) => (
            <components.SingleValue {...props}>
              <span className="flex items-center gap-2 text-ink text-sm leading-normal min-w-0">
                {props.data.flag ? (
                  <span className="text-base select-none shrink-0" aria-hidden="true">
                    {props.data.flag}
                  </span>
                ) : (
                  <Coins className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
                )}
                <span className="font-semibold">{props.data.code}</span>
                <span className="text-xs text-muted font-normal">({props.data.symbol})</span>
              </span>
            </components.SingleValue>
          ),
          Option: ({ data, innerRef, innerProps, isFocused, isSelected }) => (
            <div
              ref={innerRef}
              {...innerProps}
              className={cn(
                'flex items-center gap-2.5 px-3.5 py-2 cursor-pointer text-xs sm:text-sm transition-colors',
                isSelected
                  ? 'bg-sand text-ink font-medium'
                  : isFocused
                    ? 'bg-[#f4efe6] text-ink'
                    : 'text-ink'
              )}
            >
              {data.flag && (
                <span className="text-base select-none shrink-0" aria-hidden="true">
                  {data.flag}
                </span>
              )}
              <span className="font-semibold shrink-0">{data.code}</span>
              <span className={cn('text-xs shrink-0', isSelected ? 'text-muted' : 'text-muted')}>
                ({data.symbol})
              </span>
              <span className={cn('flex-1 truncate text-xs', isSelected ? 'text-muted' : 'text-muted')}>
                — {data.name}
              </span>
            </div>
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
          singleValue: () => '[grid-area:1/1/2/3] flex items-center m-0 p-0 truncate text-ink',
          input: () => '[grid-area:1/1/2/3] text-ink m-0 p-0 text-sm leading-normal',
          indicatorsContainer: () => 'gap-1 h-full flex items-center shrink-0',
          indicatorSeparator: () => 'hidden',
          menu: () =>
            'mt-1 rounded-lg border border-line bg-white p-1 shadow-md text-sm overflow-hidden z-40 min-w-[240px]',
          menuList: () => 'max-h-60 overflow-y-auto',
        }}
      />
    </div>
  );
}
