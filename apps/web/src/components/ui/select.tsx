'use client';

import React, { useId, useMemo, useState } from 'react';
import ReactSelect, { type GroupBase, type SingleValue } from 'react-select';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  isDisabled?: boolean;
}

type OptionOrGroup = SelectOption | GroupBase<SelectOption>;

export type SelectProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'value' | 'defaultValue' | 'children' | 'size'
> & {
  value?: string | number | null;
  defaultValue?: string | number;
  /** Same contract as a native select: handlers read `e.target.value` (and `e.target.name`). */
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  /** `<option>` / `<optgroup>` children, exactly as with a native select. */
  children?: React.ReactNode;
  placeholder?: string;
  /** Type-to-filter. Defaults to on when there are more than 8 options. */
  searchable?: boolean;
  /** `pill` matches the rounded public-site inputs; `default` matches portal forms. */
  appearance?: 'default' | 'pill';
  size?: 'sm' | 'md';
  /** Extra classes for the visible control (e.g. left padding for an icon overlay). */
  controlClassName?: string;
};

/** Plain text of an option label (handles fragments, numbers and nested elements). */
function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

type OptionProps = { value?: string | number; children?: React.ReactNode; disabled?: boolean; label?: string };

function parseOptions(children: React.ReactNode): OptionOrGroup[] {
  const out: OptionOrGroup[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      out.push(...parseOptions((child.props as { children?: React.ReactNode }).children));
      return;
    }
    const props = child.props as OptionProps;
    if (child.type === 'optgroup') {
      out.push({
        label: props.label ?? '',
        options: parseOptions(props.children).filter((o): o is SelectOption => 'value' in o),
      });
    } else if (child.type === 'option') {
      const label = textOf(props.children);
      out.push({ value: String(props.value ?? label), label, isDisabled: Boolean(props.disabled) });
    }
  });
  return out;
}

function flatten(options: OptionOrGroup[]): SelectOption[] {
  return options.flatMap((o) => ('options' in o ? [...o.options] : [o]));
}

/**
 * The site's select control: an accessible, keyboard-friendly React select (react-select)
 * styled with the design tokens. A drop-in replacement for `<select>` — same `<option>`
 * children and `onChange(e)` with `e.target.value` — so forms need no rewiring.
 */
export function Select({
  id,
  name,
  value,
  defaultValue,
  onChange,
  children,
  disabled,
  required,
  className,
  placeholder,
  searchable,
  appearance = 'default',
  size = 'md',
  controlClassName,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  autoFocus,
}: SelectProps) {
  const instanceId = useId();
  const options = useMemo(() => parseOptions(children), [children]);
  const flat = useMemo(() => flatten(options), [options]);
  const [uncontrolled, setUncontrolled] = useState<string | undefined>(
    defaultValue !== undefined ? String(defaultValue) : undefined,
  );

  // Portal the menu to <body> so it is never clipped by cards, tables or dialogs. The menu is
  // closed on the server and first client render, so reading `document` here is hydration-safe.
  const portalTarget = typeof document === 'undefined' ? null : document.body;

  const current = value !== undefined && value !== null ? String(value) : uncontrolled;
  const selected = current === undefined ? null : (flat.find((o) => o.value === current) ?? null);
  const invalid = ariaInvalid === true || ariaInvalid === 'true';

  const handleChange = (option: SingleValue<SelectOption>) => {
    const next = option?.value ?? '';
    if (value === undefined) setUncontrolled(next);
    if (!onChange) return;
    const target = { value: next, name: name ?? '', id: id ?? '' };
    onChange({ target, currentTarget: target } as unknown as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <ReactSelect<SelectOption, false>
      instanceId={instanceId}
      inputId={id}
      name={name}
      options={options}
      value={selected}
      onChange={handleChange}
      isDisabled={disabled}
      required={required}
      autoFocus={autoFocus}
      isSearchable={searchable ?? flat.length > 8}
      placeholder={placeholder ?? 'Select…'}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-invalid={invalid || undefined}
      aria-describedby={ariaDescribedBy}
      menuPortalTarget={portalTarget}
      menuPlacement="auto"
      noOptionsMessage={() => 'No matches'}
      unstyled
      className={cn('w-full', className)}
      classNamePrefix="hz-select"
      styles={{ menuPortal: (base) => ({ ...base, zIndex: 70 }) }}
      classNames={{
        control: ({ isFocused, isDisabled }) =>
          cn(
            'border text-ink cursor-pointer transition-colors',
            appearance === 'pill' ? 'rounded-full bg-cream px-4' : 'rounded-xl bg-white px-3',
            size === 'sm' ? 'min-h-8 text-xs' : 'min-h-10 text-sm',
            invalid ? 'border-red' : isFocused ? 'border-gold ring-2 ring-gold/40' : 'border-line hover:border-gold/60',
            // Inside a <Field error=…> the whole control turns red, like inputs do.
            'group-data-[invalid=true]/field:border-red',
            isDisabled && 'bg-sand cursor-not-allowed opacity-70',
            controlClassName,
          ),
        valueContainer: () => (size === 'sm' ? 'gap-1 py-0.5' : 'gap-1 py-1.5'),
        placeholder: () => 'text-muted/70',
        singleValue: () => 'text-ink',
        input: () => 'text-ink',
        indicatorsContainer: () => 'gap-1',
        indicatorSeparator: () => 'hidden',
        dropdownIndicator: ({ isFocused }) => cn('p-1 transition-colors', isFocused ? 'text-ink' : 'text-muted'),
        menu: () => 'mt-1 rounded-xl border border-line bg-white shadow-large py-1 text-sm overflow-hidden',
        menuList: () => 'max-h-64',
        groupHeading: () => 'px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted',
        option: ({ isFocused, isSelected, isDisabled }) =>
          cn(
            'px-3 py-2 cursor-pointer',
            isSelected ? 'bg-green-800 text-white' : isFocused ? 'bg-sand text-ink' : 'text-ink',
            isDisabled && 'opacity-50 cursor-not-allowed',
          ),
        noOptionsMessage: () => 'px-3 py-2 text-muted',
      }}
    />
  );
}
