'use client';

import React, { useId, useMemo, useState } from 'react';
import ReactSelect, { type GroupBase, type SingleValue } from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  /** A second, quieter line in the menu (e.g. the family name). Set with `data-description`. */
  description?: string;
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
  /** Direct options array or `<option>` / `<optgroup>` children. */
  options?: OptionOrGroup[];
  children?: React.ReactNode;
  placeholder?: string;
  /** Type-to-filter. Defaults to on when there are more than 8 options. */
  searchable?: boolean;
  /** `pill` matches the rounded public-site inputs (46px height); `default` matches portal forms. */
  appearance?: 'default' | 'pill';
  size?: 'sm' | 'md';
  /** Extra classes for the visible control (e.g. left padding for an icon overlay). */
  controlClassName?: string;
  /** Called as the user types, e.g. to search the server for more options. */
  onInputChange?: (text: string) => void;
  /** Shown when typing matches nothing. */
  noOptionsText?: string;
  /** Lets the user keep what they typed when it isn't in the list (e.g. a small town). */
  allowCustom?: boolean;
};

/** Plain text of an option label (handles fragments, numbers and nested elements). */
function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

type OptionProps = {
  value?: string | number;
  children?: React.ReactNode;
  disabled?: boolean;
  label?: string;
  'data-description'?: string;
};

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
      out.push({
        value: String(props.value ?? label),
        label,
        description: props['data-description'] || undefined,
        isDisabled: Boolean(props.disabled),
      });
    }
  });
  return out;
}

/** An empty-value option worded as a prompt ("Select a student") is a placeholder, not a choice. */
const PROMPT = /^(select|choose|pick)/i;
const isPrompt = (o: OptionOrGroup): o is SelectOption => 'value' in o && o.value === '' && PROMPT.test(o.label);

/**
 * Menu order and placeholder: a prompt option leaves the menu and becomes the placeholder;
 * an "All …" choice (the empty filter) always comes first.
 */
function arrange(options: OptionOrGroup[]): { options: OptionOrGroup[]; prompt?: string } {
  const prompt = options.find(isPrompt);
  const rest = options.filter((o) => !isPrompt(o));
  const allIndex = rest.findIndex((o) => 'value' in o && o.value === '' && /^all/i.test(o.label));
  if (allIndex > 0) rest.unshift(...rest.splice(allIndex, 1));
  return { options: rest, prompt: prompt?.label };
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
  options: explicitOptions,
  children,
  disabled,
  required,
  className,
  placeholder,
  searchable,
  appearance = 'default',
  size = 'md',
  controlClassName,
  onInputChange,
  noOptionsText,
  allowCustom = false,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  autoFocus,
}: SelectProps) {
  const instanceId = useId();
  const arranged = useMemo(() => arrange(explicitOptions ?? parseOptions(children)), [explicitOptions, children]);
  const options = arranged.options;
  const flat = useMemo(() => flatten(options), [options]);
  const [uncontrolled, setUncontrolled] = useState<string | undefined>(
    defaultValue !== undefined ? String(defaultValue) : undefined,
  );

  // Portal the menu to <body> so it is never clipped by cards, tables or dialogs.
  const portalTarget = typeof document === 'undefined' ? null : document.body;

  const current = value !== undefined && value !== null ? String(value) : uncontrolled;
  const selected =
    current === undefined || current === ''
      ? (flat.find((o) => o.value === current) ?? null)
      : (flat.find((o) => o.value === current) ?? (allowCustom ? { value: current, label: current } : null));
  const invalid = ariaInvalid === true || ariaInvalid === 'true';

  const handleChange = (option: SingleValue<SelectOption>) => {
    const next = option?.value ?? '';
    if (value === undefined) setUncontrolled(next);
    if (!onChange) return;
    const target = { value: next, name: name ?? '', id: id ?? '' };
    onChange({ target, currentTarget: target } as unknown as React.ChangeEvent<HTMLSelectElement>);
  };

  const Control = (allowCustom ? CreatableSelect : ReactSelect) as typeof ReactSelect;
  return (
    <Control<SelectOption, false>
      {...(allowCustom
        ? {
            onCreateOption: (text: string) => handleChange({ value: text.trim(), label: text.trim() }),
            formatCreateLabel: (text: string) => `Use “${text}”`,
            createOptionPosition: 'first',
          }
        : {})}
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
      placeholder={placeholder ?? arranged.prompt ?? 'Select…'}
      formatOptionLabel={(option, meta) =>
        meta.context === 'menu' ? (
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate">{option.label}</span>
              {option.description && <span className="block truncate text-xs text-muted">{option.description}</span>}
            </span>
            {meta.selectValue.some((v) => v.value === option.value) && <Check className="h-4 w-4 shrink-0 text-green-700" aria-hidden />}
          </span>
        ) : (
          option.label
        )
      }
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-invalid={invalid || undefined}
      aria-describedby={ariaDescribedBy}
      menuPortalTarget={portalTarget}
      menuPlacement="bottom"
      maxMenuHeight={260}
      noOptionsMessage={() => noOptionsText ?? 'No matches'}
      filterOption={(candidate, input) => {
        const needle = input.trim().toLowerCase();
        if (!needle) return true;
        const { label, description } = candidate.data;
        return label.toLowerCase().includes(needle) || Boolean(description?.toLowerCase().includes(needle));
      }}
      onInputChange={(text, meta) => {
        if (meta.action === 'input-change') onInputChange?.(text);
      }}
      unstyled
      className={cn('w-full', className)}
      classNamePrefix="hz-select"
      styles={{
        // Above dialogs (Modal is z-50) so a select inside a modal opens on top; below toasts (z-60).
          menuPortal: (base) => ({ ...base, zIndex: 55 }),
      }}
      classNames={{
        control: ({ isFocused, isDisabled }) =>
          cn(
            'border text-ink cursor-pointer transition-colors flex items-center',
            appearance === 'pill'
              ? 'rounded-full bg-cream px-4 h-[46px] min-h-[46px] max-h-[46px] text-sm'
              : size === 'sm'
                ? 'rounded-lg bg-white px-2.5 h-8 min-h-8 text-xs'
                : 'rounded-xl bg-white px-3 h-10 min-h-10 text-sm',
            invalid
              ? 'border-red ring-1 ring-red/30'
              : isFocused
                ? 'border-gold ring-2 ring-gold/40'
                : 'border-line hover:border-gold/60',
            // Inside a <Field error=…> the whole control turns red, like inputs do.
            'group-data-[invalid=true]/field:border-red',
            isDisabled && 'bg-sand cursor-not-allowed opacity-70',
            controlClassName,
          ),
        valueContainer: () => 'grid grid-cols-1 items-center h-full flex-1 overflow-hidden py-0 my-0',
        placeholder: () => '[grid-area:1/1/2/3] text-muted/70 truncate leading-normal',
        singleValue: () => '[grid-area:1/1/2/3] text-ink truncate leading-normal',
        input: () => '[grid-area:1/1/2/3] text-ink m-0 p-0 leading-normal',
        indicatorsContainer: () => 'gap-1 h-full flex items-center shrink-0',
        indicatorSeparator: () => 'hidden',
        dropdownIndicator: ({ isFocused }) =>
          cn('p-0.5 transition-colors flex items-center justify-center', isFocused ? 'text-ink' : 'text-muted'),
        // shadcn/ui select look: a light popover, rounded items, a check on the chosen one.
        menu: () => 'mt-1 rounded-lg border border-line bg-white p-1 text-sm shadow-md overflow-hidden z-40',
        menuList: () => 'max-h-64 overflow-y-auto',
        groupHeading: () => 'px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted',
        option: ({ isFocused, isSelected, isDisabled }) =>
          cn(
            'rounded-md px-2 py-1.5 cursor-pointer text-sm text-ink transition-colors',
            isFocused ? 'bg-sand' : 'bg-transparent',
            isSelected && 'font-medium',
            isDisabled && 'opacity-50 cursor-not-allowed',
          ),
        noOptionsMessage: () => 'px-2 py-1.5 text-muted',
      }}
    />
  );
}
