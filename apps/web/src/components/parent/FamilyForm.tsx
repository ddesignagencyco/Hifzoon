'use client';

import React, { useMemo, useState } from 'react';
import { Field, Select, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useCreateFamily, useUpdateFamily } from '@/hooks/useFamily';
import {
  browserTimeZone,
  CreateFamilyInput,
  CURRENCIES,
  Currency,
  FamilyDetail,
  timeZoneOptions,
  validateFamilyInput,
} from '@/lib/api/modules/families';

interface FormState {
  name: string;
  country: string;
  currency: Currency;
  billingName: string;
  timeZone: string;
}

function toInput(state: FormState): CreateFamilyInput {
  return {
    name: state.name.trim(),
    ...(state.country.trim() ? { country: state.country.trim().toUpperCase() } : {}),
    currency: state.currency,
    ...(state.billingName.trim() ? { billingName: state.billingName.trim() } : {}),
    ...(state.timeZone ? { timeZone: state.timeZone } : {}),
  };
}

/** Create (no `family`) or edit a family account (CreateFamilyDto / UpdateFamilyDto). */
export function FamilyForm({
  family,
  onDone,
  submitLabel,
}: {
  family?: FamilyDetail;
  onDone?: (familyId: string) => void;
  submitLabel?: string;
}) {
  const toast = useToast();
  const create = useCreateFamily();
  const update = useUpdateFamily(family?.id ?? '');
  const mutation = family ? update : create;
  const [state, setState] = useState<FormState>(() => ({
    name: family?.name ?? '',
    country: family?.country ?? '',
    currency: family?.currency ?? 'USD',
    billingName: family?.billingName ?? '',
    timeZone: family?.timeZone ?? browserTimeZone(),
  }));
  const [errors, setErrors] = useState<ReturnType<typeof validateFamilyInput>>({});
  const zones = useMemo(() => timeZoneOptions(state.timeZone), [state.timeZone]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((s) => ({ ...s, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = toInput(state);
    const found = validateFamilyInput(input);
    setErrors(found);
    if (Object.keys(found).length > 0) return toast.error(Object.values(found).find(Boolean) ?? 'Please fix the highlighted fields');
    mutation.mutate(input, {
      onSuccess: (result) => {
        toast.success(family ? 'Family details saved.' : 'Family account created.');
        onDone?.(result.id);
      },
      onError: (err) => toast.error(err),
    });
  };

  const idp = family ? 'edit-family' : 'new-family';
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Family name" htmlFor={`${idp}-name`} required error={errors.name}>
        <TextInput
          id={`${idp}-name`}
          value={state.name}
          maxLength={160}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Khan Family"
          aria-invalid={Boolean(errors.name)}
        />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Country code" htmlFor={`${idp}-country`} hint="Two letters, e.g. GB, US, PK" error={errors.country}>
          <TextInput
            id={`${idp}-country`}
            value={state.country}
            maxLength={2}
            onChange={(e) => set('country', e.target.value.toUpperCase())}
            aria-invalid={Boolean(errors.country)}
            autoComplete="country"
          />
        </Field>
        <Field label="Billing currency" htmlFor={`${idp}-currency`} error={errors.currency}>
          <Select id={`${idp}-currency`} value={state.currency} onChange={(e) => set('currency', e.target.value as Currency)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Billing name" htmlFor={`${idp}-billing`} hint="Defaults to your account name" error={errors.billingName}>
        <TextInput
          id={`${idp}-billing`}
          value={state.billingName}
          maxLength={160}
          onChange={(e) => set('billingName', e.target.value)}
          autoComplete="name"
        />
      </Field>
      <Field label="Family time zone" htmlFor={`${idp}-tz`} hint="Class times are shown in this zone" error={errors.timeZone}>
        <Select id={`${idp}-tz`} value={state.timeZone} onChange={(e) => set('timeZone', e.target.value)}>
          {zones.map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end">
        <UiButton type="submit" loading={mutation.isPending}>
          {submitLabel ?? (family ? 'Save family details' : 'Create family')}
        </UiButton>
      </div>
    </form>
  );
}
