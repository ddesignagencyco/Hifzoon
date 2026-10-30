'use client';

import React, { useState } from 'react';
import { CASE_SEVERITIES, type CaseSeverity } from '@/lib/api/modules/cases';
import { Field, Select, TextArea, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useOpenCase } from '@/hooks/useCases';
import {
  CaseRecord,
  CaseType,
  DEFAULT_SLA_MINUTES,
  OpenCaseInput,
  SLA_SERVICE_MAX,
  SUMMARY_MAX,
  caseReference,
  validateOpenCase,
} from '@/lib/api/modules/cases';

/** `POST /cases` form. Fields and limits mirror the zod `openCaseBody`. */
export function CaseCreateForm({ onCreated, onCancel }: { onCreated: (c: CaseRecord) => void; onCancel?: () => void }) {
  const toast = useToast();
  const openCase = useOpenCase();
  const [form, setForm] = useState({
    type: 'SAFEGUARDING' as CaseType,
    summary: '',
    subjectUserId: '',
    classId: '',
    ownerId: '',
    slaMinutes: String(DEFAULT_SLA_MINUTES),
    severity: '' as CaseSeverity | '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const sla = form.slaMinutes.trim() === '' ? undefined : Number(form.slaMinutes);
    const body: OpenCaseInput = {
      type: form.type,
      summary: form.summary.trim(),
      ...(form.subjectUserId.trim() ? { subjectUserId: form.subjectUserId.trim() } : {}),
      ...(form.classId.trim() ? { classId: form.classId.trim() } : {}),
      ...(form.ownerId.trim() ? { ownerId: form.ownerId.trim() } : {}),
      ...(sla !== undefined ? { slaMinutes: sla } : {}),
      ...(form.severity ? { severity: form.severity } : {}),
    };
    const found = validateOpenCase(body);
    setErrors(found);
    const firstError = Object.values(found)[0];
    if (firstError) return toast.error(firstError);
    openCase.mutate(body, {
      onSuccess: (created) => {
        toast.success(`Case ${caseReference(created.id)} opened — the safeguarding lead has been alerted.`);
        onCreated(created);
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Type" htmlFor="case-type" required error={errors.type}>
          <Select id="case-type" value={form.type} onChange={(e) => set('type')(e.target.value)}>
            <option value="SAFEGUARDING">Safeguarding concern</option>
            <option value="COMPLAINT">Complaint</option>
          </Select>
        </Field>
        <Field label="Severity" htmlFor="case-severity" hint="Left empty: safeguarding starts High, a complaint Medium.">
          <Select id="case-severity" value={form.severity} onChange={(e) => set('severity')(e.target.value)}>
            <option value="">Default for the type</option>
            {CASE_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Response SLA (minutes)"
          htmlFor="case-sla"
          error={errors.slaMinutes}
          hint={`Defaults to ${DEFAULT_SLA_MINUTES} minutes. Max ${SLA_SERVICE_MAX} (1 week).`}
        >
          <TextInput
            id="case-sla"
            type="number"
            inputMode="numeric"
            min={1}
            max={SLA_SERVICE_MAX}
            value={form.slaMinutes}
            onChange={(e) => set('slaMinutes')(e.target.value)}
          />
        </Field>
      </div>
      <Field
        label="Summary"
        htmlFor="case-summary"
        required
        error={errors.summary}
        hint={`${form.summary.trim().length}/${SUMMARY_MAX} — facts only: what was seen or reported, when, by whom.`}
      >
        <TextArea
          id="case-summary"
          rows={5}
          maxLength={SUMMARY_MAX}
          value={form.summary}
          onChange={(e) => set('summary')(e.target.value)}
        />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Class reference (optional)" htmlFor="case-class" error={errors.classId} hint="Admins: Users & search → “Copy reference” on the class.">
          <TextInput id="case-class" value={form.classId} onChange={(e) => set('classId')(e.target.value)} placeholder="Paste class reference" />
        </Field>
        <Field label="Person concerned — user reference (optional)" htmlFor="case-subject" error={errors.subjectUserId} hint="Admins: Users & search → open the person → “Copy reference”.">
          <TextInput
            id="case-subject"
            value={form.subjectUserId}
            onChange={(e) => set('subjectUserId')(e.target.value)}
            placeholder="Paste user reference"
          />
        </Field>
      </div>
      <Field label="Owner — user reference (optional)" htmlFor="case-owner" error={errors.ownerId} hint="Leave blank to assign later from the case page.">
        <TextInput id="case-owner" value={form.ownerId} onChange={(e) => set('ownerId')(e.target.value)} placeholder="Paste user reference" />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <UiButton variant="secondary" onClick={onCancel} disabled={openCase.isPending}>
            Cancel
          </UiButton>
        )}
        <UiButton type="submit" loading={openCase.isPending}>
          Open case
        </UiButton>
      </div>
    </form>
  );
}
