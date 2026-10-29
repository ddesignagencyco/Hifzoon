'use client';

import React, { useState } from 'react';
import { Field, TextArea, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useCreateLead } from '@/hooks/useCrm';
import {
  EMPTY_LEAD_FORM,
  Lead,
  LeadFormErrors,
  LeadFormValues,
  toCreateLeadInput,
  validateLeadForm,
} from '@/lib/api/modules/crm';

/**
 * Create-lead form (`POST /admin/crm/leads`). Validates to `createLeadBody`; the backend
 * assigns the caller as owner and creates the first follow-up task.
 */
export function CreateLeadForm({ onCreated, onCancel }: { onCreated?: (lead: Lead) => void; onCancel?: () => void }) {
  const createLead = useCreateLead();
  const toast = useToast();
  const [values, setValues] = useState<LeadFormValues>(EMPTY_LEAD_FORM);
  const [errors, setErrors] = useState<LeadFormErrors>({});

  const set = (key: keyof LeadFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateLeadForm(values);
    setErrors(found);
    const firstError = Object.values(found).find(Boolean);
    if (firstError) return toast.error(firstError);
    createLead.mutate(toCreateLeadInput(values), {
      onSuccess: (lead) => {
        toast.success(`Lead created for ${lead.contactName}`);
        setValues(EMPTY_LEAD_FORM);
        onCreated?.(lead);
      },
      onError: (err) => toast.error(err),
    });
  };

  const field = (key: keyof LeadFormValues) => ({
    id: `lead-${key}`,
    value: values[key],
    onChange: set(key),
    'aria-invalid': Boolean(errors[key]) || undefined,
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Create lead">
      <Field label="Contact name" htmlFor="lead-contactName" required error={errors.contactName}>
        <TextInput {...field('contactName')} maxLength={160} autoComplete="name" />
      </Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Email" htmlFor="lead-email" error={errors.email}>
          <TextInput {...field('email')} type="email" autoComplete="email" />
        </Field>
        <Field label="Phone" htmlFor="lead-phone" error={errors.phone}>
          <TextInput {...field('phone')} type="tel" autoComplete="tel" />
        </Field>
        <Field label="Country" htmlFor="lead-country" hint="2-letter code, e.g. US" error={errors.country}>
          <TextInput {...field('country')} maxLength={2} />
        </Field>
        <Field label="Region / state" htmlFor="lead-region" error={errors.region}>
          <TextInput {...field('region')} maxLength={120} placeholder="e.g. Punjab, Texas" />
        </Field>
        <Field label="City" htmlFor="lead-city" error={errors.city}>
          <TextInput {...field('city')} maxLength={120} autoComplete="address-level2" />
        </Field>
        <Field label="Postcode" htmlFor="lead-postcode" error={errors.postcode}>
          <TextInput {...field('postcode')} maxLength={20} autoComplete="postal-code" />
        </Field>
        <Field label="Child's age" htmlFor="lead-childAge" hint="3–18" error={errors.childAge}>
          <TextInput {...field('childAge')} type="number" inputMode="numeric" min={3} max={18} />
        </Field>
        <Field label="Course interest" htmlFor="lead-courseInterest" error={errors.courseInterest}>
          <TextInput {...field('courseInterest')} maxLength={60} placeholder="e.g. HIFZ" />
        </Field>
        <Field label="Source" htmlFor="lead-source" hint="Defaults to “website”" error={errors.source}>
          <TextInput {...field('source')} maxLength={60} placeholder="e.g. referral, whatsapp" />
        </Field>
      </div>
      <Field label="Notes" htmlFor="lead-notes" error={errors.notes}>
        <TextArea {...field('notes')} maxLength={4000} />
      </Field>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <UiButton variant="secondary" onClick={onCancel} disabled={createLead.isPending}>
            Cancel
          </UiButton>
        )}
        <UiButton type="submit" loading={createLead.isPending}>
          Create lead
        </UiButton>
      </div>
    </form>
  );
}
