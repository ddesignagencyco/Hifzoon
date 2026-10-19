'use client';

import React, { useMemo, useState } from 'react';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  QueryState,
  Select,
  TextInput,
} from '@/components/ui/primitives';
import { SupervisorRoleGate } from '@/components/qa/SupervisorRoleGate';
import { TeacherQaTable } from '@/components/qa/TeacherQaTable';
import { useTeacherQaRows } from '@/components/qa/useTeacherQaRows';
import { useSupervisedTeachers } from '@/hooks/useQa';
import { SCORECARD_MONTHS_MAX } from '@/lib/api/modules/qa';

export default function SupervisorTeachersPage() {
  return (
    <SupervisorRoleGate>
      <TeacherDirectory />
    </SupervisorRoleGate>
  );
}

function TeacherDirectory() {
  const teachers = useSupervisedTeachers();
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [months, setMonths] = useState(3);

  const subjects = useMemo(
    () => [...new Set((teachers.data ?? []).flatMap((t) => t.subjects))].sort(),
    [teachers.data],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (teachers.data ?? []).filter(
      (t) => (!q || t.user.name.toLowerCase().includes(q)) && (!subject || t.subjects.includes(subject)),
    );
  }, [teachers.data, search, subject]);
  const rows = useTeacherQaRows(filtered, months);

  return (
    <>
      <PageHeader
        eyebrow="Quality & supervision"
        title="Teachers & scorecards"
        description="Open a teacher for their full scorecard, family ratings, recent classes and QA sample."
      />
      <Alert tone="neutral" className="mb-4">
        Only teachers who have cleared hiring and safeguarding training (bookable teachers) are listed — the API
        exposes no wider staff directory to supervisors.
      </Alert>
      <Card>
        <CardHeader title="Teachers" description={teachers.data ? `${filtered.length} of ${teachers.data.length}` : undefined} />
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Field label="Search" htmlFor="teacher-search">
              <TextInput id="teacher-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Teacher name" />
            </Field>
            <Field label="Subject" htmlFor="teacher-subject">
              <Select id="teacher-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">All subjects</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="QA window" htmlFor="teacher-window">
              <Select id="teacher-window" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                {[1, 3, 6, 12, SCORECARD_MONTHS_MAX].map((m) => (
                  <option key={m} value={m}>
                    Last {m} month{m === 1 ? '' : 's'}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <QueryState query={teachers} empty={<EmptyState title="No bookable teachers yet" />}>
            {() => <TeacherQaTable rows={rows} emptyTitle="No teachers match these filters" />}
          </QueryState>
        </CardBody>
      </Card>
    </>
  );
}
