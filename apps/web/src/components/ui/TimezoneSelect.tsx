'use client';

import React, { useId, useMemo } from 'react';
import ReactSelect, { type SingleValue } from 'react-select';
import { cn } from '@/lib/utils';
import { getAllTimezones } from '@/lib/data/countries';
import { ChevronDown, Globe } from 'lucide-react';

export interface TimezoneOption {
  value: string;
  label: string;
  offset: string;
  isDetected: boolean;
}

export interface TimezoneSelectProps {
  id?: string;
  name?: string;
  value?: string | null;
  onChange?: (value: string, e?: React.ChangeEvent<HTMLSelectElement>) => void;
  detected?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  selectClassName?: string;
  error?: string | boolean;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  autoComplete?: string;
}

function resolveDetectedZone(explicitDetected?: string): string {
  if (explicitDetected) return explicitDetected;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Complete, standard IANA timezone selector covering all 400+ global timezones.
 * Formatted with current UTC offset and visitor detected zone prioritized.
 * Built with react-select for instant typeahead search and consistent 46px height.
 */
export function TimezoneSelect({
  id: explicitId,
  name,
  value,
  onChange,
  detected: explicitDetected,
  required = false,
  disabled = false,
  className,
  selectClassName,
  error,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: TimezoneSelectProps) {
  const instanceId = useId();
  const id = explicitId || instanceId;

  const detected = useMemo(() => resolveDetectedZone(explicitDetected), [explicitDetected]);
  const allTimezones = useMemo(() => getAllTimezones(detected), [detected]);

  const options: TimezoneOption[] = useMemo(() => {
    return allTimezones.map((tz) => {
      const isDetected = tz.value === detected;
      const label = `${tz.value.replace(/_/g, ' ')}${isDetected ? ' (detected)' : ''} [${tz.offset}]`;
      return {
        value: tz.value,
        label,
        offset: tz.offset,
        isDetected,
      };
    });
  }, [allTimezones, detected]);

  const selectedOption = useMemo(() => {
    const target = value ?? detected;
    return options.find((opt) => opt.value === target) ?? {
      value: target,
      label: target.replace(/_/g, ' '),
      offset: '',
      isDetected: false,
    };
  }, [value, detected, options]);

  const hasError = Boolean(error) || ariaInvalid === true || ariaInvalid === 'true';
  const portalTarget = typeof document === 'undefined' ? null : document.body;

  const handleChange = (selected: SingleValue<TimezoneOption>) => {
    const nextVal = selected?.value ?? detected;
    if (!onChange) return;
    const target = { value: nextVal, name: name ?? '', id } as unknown as HTMLSelectElement;
    onChange(nextVal, { target, currentTarget: target } as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <div className={cn('relative w-full', className)}>
      <ReactSelect<TimezoneOption, false>
        instanceId={instanceId}
        inputId={id}
        name={name}
        options={options}
        value={selectedOption}
        onChange={handleChange}
        isDisabled={disabled}
        required={required}
        isSearchable
        aria-label="Time zone"
        aria-invalid={hasError || undefined}
        aria-describedby={ariaDescribedBy}
        menuPortalTarget={portalTarget}
        menuPlacement="bottom"
        maxMenuHeight={260}
        noOptionsMessage={() => 'No matching timezone'}
        unstyled
        className="w-full"
        classNamePrefix="hz-tz-select"
        styles={{
          menuPortal: (base) => ({ ...base, zIndex: 40 }),
        }}
        components={{
          DropdownIndicator: () => (
            <ChevronDown className="w-4 h-4 text-muted shrink-0 mr-1" aria-hidden="true" />
          ),
          SingleValue: ({ data }) => (
            <div className="flex items-center gap-2 text-ink text-sm truncate leading-normal">
              <Globe className="w-4 h-4 text-muted/70 shrink-0" aria-hidden="true" />
              <span className="truncate font-medium">{data.value.replace(/_/g, ' ')}</span>
              {data.isDetected && (
                <span className="text-[11px] bg-sand/80 text-ink px-1.5 py-0.5 rounded font-medium shrink-0">
                  detected
                </span>
              )}
              {data.offset && (
                <span className="text-xs text-muted font-mono shrink-0">[{data.offset}]</span>
              )}
            </div>
          ),
          Option: ({ data, innerRef, innerProps, isFocused, isSelected }) => (
            <div
              ref={innerRef}
              {...innerProps}
              className={cn(
                'flex items-center gap-2 px-3.5 py-2 cursor-pointer text-xs sm:text-sm transition-colors',
                isSelected
                  ? 'bg-[#143a2f] text-white font-medium'
                  : isFocused
                    ? 'bg-[#f4efe6] text-ink'
                    : 'text-ink'
              )}
            >
              <span className="flex-1 truncate font-medium">
                {data.value.replace(/_/g, ' ')}
              </span>
              {data.isDetected && (
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide shrink-0',
                    isSelected ? 'bg-white/20 text-white' : 'bg-sand text-ink'
                  )}
                >
                  detected
                </span>
              )}
              {data.offset && (
                <span
                  className={cn(
                    'text-xs font-mono shrink-0',
                    isSelected ? 'text-white/80' : 'text-muted'
                  )}
                >
                  [{data.offset}]
                </span>
              )}
            </div>
          ),
        }}
        classNames={{
          control: ({ isFocused, isDisabled }) =>
            cn(
              'w-full h-[46px] min-h-[46px] max-h-[46px] px-3.5 rounded-full border bg-cream text-ink text-sm cursor-pointer transition-colors flex items-center',
              hasError
                ? 'border-red ring-1 ring-red/30'
                : isFocused
                  ? 'border-gold ring-2 ring-gold/40'
                  : 'border-line hover:border-gold/60',
              isDisabled && 'bg-sand cursor-not-allowed opacity-60',
              selectClassName
            ),
          valueContainer: () => 'grid grid-cols-1 items-center h-full flex-1 overflow-hidden py-0 my-0',
          singleValue: () => 'col-start-1 row-start-1 truncate text-ink',
          input: () => 'col-start-1 row-start-1 text-ink m-0 p-0 text-sm leading-normal',
          indicatorsContainer: () => 'gap-1 h-full flex items-center shrink-0',
          indicatorSeparator: () => 'hidden',
          menu: () =>
            'mt-1.5 rounded-2xl border border-line bg-white shadow-large py-1.5 text-sm overflow-hidden z-40',
          menuList: () => 'max-h-60 overflow-y-auto',
          noOptionsMessage: () => 'px-3.5 py-2 text-muted text-xs',
        }}
      />
    </div>
  );
}
