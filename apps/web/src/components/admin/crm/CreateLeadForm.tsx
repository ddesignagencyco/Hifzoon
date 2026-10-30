'use client';

import React, { useState } from 'react';
import { Field, Select, TextArea, TextInput, UiButton } from '@/components/ui/primitives';
import { AddressFields } from '@/components/ui/AddressFields';
import { useAdminCourses } from '@/hooks/useAdminScheduling';
import { useToast } from '@/components/ui/toast';
import { useCreateLead } from '@/hooks/useCrm';
import {
  EMPTY_LEAD_FORM,
  LEAD_SOURCES,
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
  const courses = useAdminCourses();

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
        <AddressFields
          idPrefix="lead"
          value={{ country: values.country, region: values.region, city: values.city, postcode: values.postcode }}
          onChange={(addr) => setValues((v) => ({ ...v, ...addr }))}
          errors={{ country: errors.country, region: errors.region, city: errors.city, postcode: errors.postcode }}
        />
        <Field label="Child's age" htmlFor="lead-childAge" hint="3–18" error={errors.childAge}>
          <TextInput {...field('childAge')} type="number" inputMode="numeric" min={3} max={18} />
        </Field>
        <Field label="Course interest" htmlFor="lead-courseInterest" error={errors.courseInterest}>
          <Select
            id="lead-courseInterest"
            value={values.courseInterest}
            onChange={(e) => setValues((v) => ({ ...v, courseInterest: e.target.value }))}
          >
            <option value="">{courses.isLoading ? 'Loading courses…' : 'Not sure yet'}</option>
            {(courses.data ?? []).map((c) => (
              <option key={c.id} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source" htmlFor="lead-source" error={errors.source}>
          <Select id="lead-source" value={values.source || 'website'} onChange={(e) => setValues((v) => ({ ...v, source: e.target.value }))}>
            {LEAD_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
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
