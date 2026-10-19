'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Field, Select, TextInput } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminEnrolments } from '@/hooks/useAdminScheduling';
import { useAdminSearch } from '@/hooks/useAdminConsole';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { isUuid } from '@/lib/api/modules/crm';
import type { StudentSearchHit } from '@/lib/api/modules/admin-console';

/** Toasts `message` once when a supporting lookup (e.g. a picker's option list) fails to load. */
export function useLoadErrorToast(isError: boolean, message: string) {
  const toast = useToast();
  useEffect(() => {
    if (isError) toast.error(message);
  }, [isError, message, toast]);
}

export interface PickedStudent {
  id: string;
  displayName: string;
  birthYear?: number;
  familyName?: string;
}

/**
 * Student chooser built only from real data:
 *  - students that hold any enrolment (`GET /courses/enrolments/list`), for every admin;
 *  - SUPER_ADMIN can also search all students (`/admin/console/search`);
 *  - anyone can paste a student id as a last resort.
 */
export function StudentPicker({
  value,
  onChange,
  id = 'student-picker',
  error,
}: {
  value: PickedStudent | null;
  onChange: (student: PickedStudent | null) => void;
  id?: string;
  error?: string | null;
}) {
  const { isSuperAdmin } = useAdminRoles();
  const enrolments = useAdminEnrolments();
  useLoadErrorToast(enrolments.isError, 'Could not load students.');
  const [term, setTerm] = useState('');
  const search = useAdminSearch(term, 'students', 20, isSuperAdmin);
  const [manualId, setManualId] = useState('');

  const options = useMemo(() => {
    const map = new Map<string, PickedStudent>();
    for (const hit of (search.data?.items ?? []) as StudentSearchHit[]) {
      map.set(hit.id, { id: hit.id, displayName: hit.displayName, birthYear: hit.birthYear, familyName: hit.family?.name });
    }
    for (const e of enrolments.data ?? []) {
      if (!map.has(e.student.id))
        map.set(e.student.id, { id: e.student.id, displayName: e.student.displayName, birthYear: e.student.birthYear });
    }
    if (value && !map.has(value.id)) map.set(value.id, value);
    const needle = term.trim().toLowerCase();
    return [...map.values()]
      .filter((s) => !needle || s.displayName.toLowerCase().includes(needle) || s.familyName?.toLowerCase().includes(needle) || s.id === value?.id)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [enrolments.data, search.data, term, value]);

  const loading = enrolments.isLoading || (isSuperAdmin && search.isFetching);

  return (
    <div className="space-y-3">
      <Field
        label={isSuperAdmin ? 'Find a student' : 'Filter students'}
        htmlFor={`${id}-search`}
        hint={
          isSuperAdmin
            ? 'Searches every student by name or guardian email (2+ characters).'
            : 'Lists students who hold an enrolment. Paste an id below for anyone else.'
        }
      >
        <TextInput
          id={`${id}-search`}
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Student or family name"
          autoComplete="off"
        />
      </Field>
      <Field label="Student" htmlFor={id} required error={error}>
        <Select
          id={id}
          value={value?.id ?? ''}
          onChange={(e) => onChange(options.find((o) => o.id === e.target.value) ?? null)}
          aria-busy={loading}
        >
          <option value="">{loading ? 'Loading students…' : options.length ? 'Select a student' : 'No students found'}</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
              {s.birthYear ? ` · born ${s.birthYear}` : ''}
              {s.familyName ? ` · ${s.familyName}` : ''}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Or paste a student id"
        htmlFor={`${id}-manual`}
        error={manualId && !isUuid(manualId) ? 'That is not a valid id.' : null}
      >
        <div className="flex gap-2">
          <TextInput
            id={`${id}-manual`}
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            autoComplete="off"
          />
          <button
            type="button"
            className="shrink-0 rounded-full border border-line px-3 text-xs font-semibold text-ink-2 hover:bg-sand disabled:opacity-50 cursor-pointer"
            disabled={!isUuid(manualId)}
            onClick={() => onChange({ id: manualId.trim(), displayName: `Student ${manualId.trim().slice(0, 8)}…` })}
          >
            Use id
          </button>
        </div>
      </Field>
    </div>
  );
}

export interface PickedTeacher {
  id: string;
  name: string;
}

/**
 * Teacher profile chooser: teachers seen on enrolments plus any extra options the caller
 * already has (e.g. matching suggestions), with a manual id fallback.
 */
export function TeacherPicker({
  value,
  onChange,
  extra = [],
  id = 'teacher-picker',
  label = 'Teacher',
  error,
  required,
}: {
  value: string;
  onChange: (teacher: PickedTeacher | null) => void;
  extra?: PickedTeacher[];
  id?: string;
  label?: string;
  error?: string | null;
  required?: boolean;
}) {
  const enrolments = useAdminEnrolments();
  const [manualId, setManualId] = useState('');

  const options = useMemo(() => {
    const map = new Map<string, PickedTeacher>();
    for (const t of extra) map.set(t.id, t);
    for (const e of enrolments.data ?? []) {
      if (e.teacher && !map.has(e.teacher.id)) map.set(e.teacher.id, { id: e.teacher.id, name: e.teacher.user.name });
    }
    if (value && !map.has(value)) map.set(value, { id: value, name: `Teacher ${value.slice(0, 8)}…` });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [enrolments.data, extra, value]);

  return (
    <div className="space-y-2">
      <Field label={label} htmlFor={id} required={required} error={error}>
        <Select id={id} value={value} onChange={(e) => onChange(options.find((o) => o.id === e.target.value) ?? null)}>
          <option value="">{enrolments.isLoading ? 'Loading teachers…' : 'Select a teacher'}</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex gap-2">
        <label htmlFor={`${id}-manual`} className="sr-only">
          Teacher profile id
        </label>
        <TextInput
          id={`${id}-manual`}
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
          placeholder="…or paste a teacher profile id"
          autoComplete="off"
        />
        <button
          type="button"
          className="shrink-0 rounded-full border border-line px-3 text-xs font-semibold text-ink-2 hover:bg-sand disabled:opacity-50 cursor-pointer"
          disabled={!isUuid(manualId)}
          onClick={() => onChange({ id: manualId.trim(), name: `Teacher ${manualId.trim().slice(0, 8)}…` })}
        >
          Use id
        </button>
      </div>
    </div>
  );
}
