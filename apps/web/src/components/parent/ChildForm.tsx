'use client';

import React, { useMemo, useState } from 'react';
import { Alert, Checkbox, Field, Select, TextArea, TextInput, UiButton, TimezoneSelect } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAddStudent, useUpdateStudent } from '@/hooks/useFamily';
import {
  AddStudentResult,
  FamilyStudentSummary,
  Gender,
  isUnder13,
  LANGUAGE_OPTIONS,
  timeZoneOptions,
  UpdateStudentInput,
  validateStudentInput,
} from '@/lib/api/modules/families';

interface ChildFormState {
  displayName: string;
  birthYear: string;
  gender: Gender | '';
  language: string;
  timeZone: string;
  kidsMode: boolean;
  notes: string;
}

function initialState(student: FamilyStudentSummary | undefined, defaultTimeZone: string): ChildFormState {
  return {
    displayName: student?.displayName ?? '',
    birthYear: student ? String(student.birthYear) : '',
    gender: student?.gender ?? '',
    language: student?.language ?? 'en',
    timeZone: student?.timeZone ?? defaultTimeZone,
    kidsMode: student?.kidsMode ?? false,
    notes: '',
  };
}

function parseYear(value: string): number | null {
  if (!/^\d{4}$/.test(value.trim())) return null;
  return Number(value.trim());
}

/**
 * Add a child (FR-AUTH-03: no email, birth *year* only) or edit one.
 * `onAdded` receives the created student so the caller can run the CR-01 consent step.
 */
export function ChildForm({
  familyId,
  student,
  defaultTimeZone,
  onAdded,
  onSaved,
  onCancel,
}: {
  familyId: string;
  student?: FamilyStudentSummary;
  defaultTimeZone: string;
  onAdded?: (student: AddStudentResult) => void;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const add = useAddStudent(familyId);
  const update = useUpdateStudent(student?.id ?? '');
  const pending = add.isPending || update.isPending;
  const [state, setState] = useState<ChildFormState>(() => initialState(student, defaultTimeZone));
  const [errors, setErrors] = useState<ReturnType<typeof validateStudentInput>>({});
  const zones = useMemo(() => timeZoneOptions(state.timeZone), [state.timeZone]);
  const set = <K extends keyof ChildFormState>(key: K, value: ChildFormState[K]) => setState((s) => ({ ...s, [key]: value }));

  const year = parseYear(state.birthYear);
  const under13 = year !== null && isUnder13(year);
  const idp = student ? `edit-child-${student.id}` : 'new-child';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateStudentInput({
      displayName: state.displayName,
      birthYear: year,
      gender: state.gender,
      language: state.language,
      timeZone: state.timeZone,
      notes: state.notes,
    });
    setErrors(found);
    if (Object.keys(found).length > 0) return toast.error(Object.values(found).find(Boolean) ?? 'Please fix the highlighted fields');

    const base = {
      displayName: state.displayName.trim(),
      birthYear: year as number,
      gender: state.gender as Gender,
      language: state.language,
      timeZone: state.timeZone,
      kidsMode: state.kidsMode,
      ...(state.notes.trim() ? { notes: state.notes.trim() } : {}),
    };

    if (student) {
      const patch: UpdateStudentInput = {};
      if (base.displayName !== student.displayName) patch.displayName = base.displayName;
      if (base.birthYear !== student.birthYear) patch.birthYear = base.birthYear;
      if (base.gender !== student.gender) patch.gender = base.gender;
      if (base.language !== student.language) patch.language = base.language;
      if (base.timeZone !== student.timeZone) patch.timeZone = base.timeZone;
      if (base.kidsMode !== student.kidsMode) patch.kidsMode = base.kidsMode;
      if (base.notes) patch.notes = base.notes;
      if (Object.keys(patch).length === 0) {
        toast.success('Nothing to change.');
        onSaved?.();
        return;
      }
      update.mutate(patch, {
        onSuccess: () => {
          toast.success(`${base.displayName}’s details saved.`);
          onSaved?.();
        },
        onError: (err) => toast.error(err),
      });
      return;
    }

    add.mutate(base, {
      onSuccess: (created) => {
        toast.success(`${created.displayName} added to your family.`);
        onAdded?.(created);
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label={student ? 'Edit child' : 'Add a child'}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Child’s name" htmlFor={`${idp}-name`} required error={errors.displayName} hint="First name or nickname">
          <TextInput
            id={`${idp}-name`}
            value={state.displayName}
            maxLength={120}
            onChange={(e) => set('displayName', e.target.value)}
            aria-invalid={Boolean(errors.displayName)}
          />
        </Field>
        <Field
          label="Birth year"
          htmlFor={`${idp}-year`}
          required
          error={errors.birthYear}
          hint="Year only — we never collect a full date of birth"
        >
          <TextInput
            id={`${idp}-year`}
            inputMode="numeric"
            value={state.birthYear}
            maxLength={4}
            onChange={(e) => set('birthYear', e.target.value.replace(/\D/g, ''))}
            aria-invalid={Boolean(errors.birthYear)}
          />
        </Field>
        <Field label="Gender" htmlFor={`${idp}-gender`} required error={errors.gender}>
          <Select
            id={`${idp}-gender`}
            value={state.gender}
            onChange={(e) => set('gender', e.target.value as Gender | '')}
            aria-invalid={Boolean(errors.gender)}
          >
            <option value="">Select…</option>
            <option value="FEMALE">Girl / female</option>
            <option value="MALE">Boy / male</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="Preferred language" htmlFor={`${idp}-lang`} error={errors.language}>
          <Select id={`${idp}-lang`} value={state.language} onChange={(e) => set('language', e.target.value)}>
            {!LANGUAGE_OPTIONS.some((l) => l.value === state.language) && (
              <option value={state.language}>{state.language}</option>
            )}
            {LANGUAGE_OPTIONS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Time zone" htmlFor={`${idp}-tz`} error={errors.timeZone} hint="Used for class times and reminders">
        <TimezoneSelect
          id={`${idp}-tz`}
          value={state.timeZone}
          onChange={(val) => set('timeZone', val)}
          error={errors.timeZone}
          aria-invalid={Boolean(errors.timeZone)}
        />
      </Field>
      <Checkbox
        id={`${idp}-kids`}
        checked={state.kidsMode}
        onChange={(v) => set('kidsMode', v)}
        label="Kids mode"
        description="A simpler, child-friendly experience for younger learners."
      />
      <Field
        label="Notes for the teacher"
        htmlFor={`${idp}-notes`}
        error={errors.notes}
        hint={student ? 'Leave blank to keep any existing notes.' : 'Optional — learning needs, prior study, etc.'}
      >
        <TextArea
          id={`${idp}-notes`}
          value={state.notes}
          maxLength={1000}
          onChange={(e) => set('notes', e.target.value)}
        />
      </Field>

      {!student && under13 && (
        <Alert tone="warning" title="Parental consent needed (under 13)">
          Children under 13 can’t take part until you record consent for lesson records. You’ll be asked straight after
          adding them.
        </Alert>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <UiButton variant="secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </UiButton>
        )}
        <UiButton type="submit" loading={pending}>
          {student ? 'Save changes' : 'Add child'}
        </UiButton>
      </div>
    </form>
  );
}
