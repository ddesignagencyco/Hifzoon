'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useDebounced } from '@/hooks/useDebounced';
import { Field, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminEnrolments } from '@/hooks/useAdminScheduling';
import { useAdminSearch } from '@/hooks/useAdminConsole';
import { useTeachers } from '@/hooks/useTeachers';
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
  const enrolments = useAdminEnrolments();
  useLoadErrorToast(enrolments.isError, 'Could not load students.');
  const [term, setTerm] = useState('');
  const search = useAdminSearch(useDebounced(term), 'students', 20);

  const options = useMemo(() => {
    const map = new Map<string, PickedStudent>();
    for (const hit of (search.data?.items ?? []) as StudentSearchHit[]) {
      map.set(hit.id, { id: hit.id, displayName: hit.displayName, birthYear: hit.birthYear, familyName: hit.family?.name });
    }
    for (const e of enrolments.data ?? []) {
      if (!map.has(e.student.id))
        map.set(e.student.id, {
          id: e.student.id,
          displayName: e.student.displayName,
          birthYear: e.student.birthYear,
          familyName: e.student.family?.name,
        });
    }
    if (value && !map.has(value.id)) map.set(value.id, value);
    const needle = term.trim().toLowerCase();
    return [...map.values()]
      .filter((s) => !needle || s.displayName.toLowerCase().includes(needle) || s.familyName?.toLowerCase().includes(needle) || s.id === value?.id)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [enrolments.data, search.data, term, value]);

  const loading = enrolments.isLoading || search.isFetching;

  // One searchable dropdown: typing filters the list and, for a super admin, also searches
  // every student on the server. No ids to copy or paste.
  return (
    <Field
      label="Student"
      htmlFor={id}
      required
      error={error}
      hint="Type a student or family name, or a guardian’s email."
    >
      <Select
        id={id}
        value={value?.id ?? ''}
        searchable
        onInputChange={setTerm}
        noOptionsText={loading ? 'Searching…' : 'No students found'}
        onChange={(e) => onChange(options.find((o) => o.id === e.target.value) ?? null)}
        aria-busy={loading}
      >
        <option value="">{loading ? 'Loading students…' : 'Select a student'}</option>
        {options.map((s) => (
          <option
            key={s.id}
            value={s.id}
            data-description={[s.familyName, s.birthYear ? `born ${s.birthYear}` : null].filter(Boolean).join(' · ')}
          >
            {s.displayName}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export interface PickedTeacher {
  id: string;
  name: string;
}

/** Picker options keyed by teacher **profile** id; earlier sources win, sorted by name. */
export function mergeTeacherOptions(
  extra: readonly PickedTeacher[],
  directory: readonly { id: string; name: string }[],
  enrolments: readonly { teacher: { id: string; user: { name: string } } | null }[],
  value: string,
): PickedTeacher[] {
  const map = new Map<string, PickedTeacher>();
  for (const t of extra) map.set(t.id, t);
  for (const t of directory) if (!map.has(t.id)) map.set(t.id, { id: t.id, name: t.name });
  for (const e of enrolments) {
    if (e.teacher && !map.has(e.teacher.id)) map.set(e.teacher.id, { id: e.teacher.id, name: e.teacher.user.name });
  }
  if (value && !map.has(value)) map.set(value, { id: value, name: 'Selected teacher' });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Teacher profile chooser: any extra options the caller already has (e.g. matching
 * suggestions), cleared teachers from the public directory (`GET /teachers/public`, so a newly
 * hired teacher with no students yet can be found), and teachers seen on enrolments.
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
  const directory = useTeachers();

  const options = useMemo(
    () => mergeTeacherOptions(extra, directory.allTeachers, enrolments.data ?? [], value),
    [enrolments.data, directory.allTeachers, extra, value],
  );

  return (
    <Field label={label} htmlFor={id} required={required} error={error}>
      <Select
        id={id}
        value={value}
        searchable
        onChange={(e) => onChange(options.find((o) => o.id === e.target.value) ?? null)}
      >
        <option value="">{enrolments.isLoading && directory.isLoading ? 'Loading teachers…' : 'Select a teacher'}</option>
        {options.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
