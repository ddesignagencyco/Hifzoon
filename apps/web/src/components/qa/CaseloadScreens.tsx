'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { DataTable, EmptyState, Field, PageHeader, QueryState, Select, UiButton, formatDate } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useCaseload, useMyCaseload, useSetCaseload } from '@/hooks/useQa';
import { useAssignableTeachers } from '@/hooks/useTeachers';
import { SupervisorRoleGate } from './SupervisorRoleGate';

/** The signed-in supervisor's own caseload. */
export function MyCaseload() {
  const query = useMyCaseload();
  return (
    <SupervisorRoleGate>
      <PageHeader eyebrow="Quality" title="My teachers" description="The teachers assigned to you. Your queue, scorecards and cases cover only these." />
      <QueryState query={query} empty={<EmptyState title="No teachers assigned yet" description="An admin assigns teachers to your caseload." />}>
        {(rows) => (
          <DataTable paginate={false} rows={rows} rowKey={(r) => r.teacherId}
            columns={[
              { key: 'n', header: 'Teacher', render: (r) => <Link className="font-medium text-green-800 hover:underline" href={`/supervisor/teachers/${r.teacherId}`}>{r.name}</Link> },
              { key: 'a', header: 'Assigned', render: (r) => formatDate(r.assignedAt) },
            ]} />
        )}
      </QueryState>
    </SupervisorRoleGate>
  );
}

/** Admin: manage one supervisor's caseload (shown in the Users drawer for supervisors). */
export function CaseloadEditor({ supervisorId }: { supervisorId: string }) {
  const toast = useToast();
  const query = useCaseload(supervisorId);
  const teachers = useAssignableTeachers();
  const set = useSetCaseload(supervisorId);
  const [pick, setPick] = useState('');
  const assigned = new Set((query.data ?? []).map((t) => t.teacherId));

  const run = (kind: 'assign' | 'unassign', teacherId: string, ok: string) =>
    set.mutate({ kind, teacherId }, { onSuccess: () => { toast.success(ok); if (kind === 'assign') setPick(''); }, onError: (e) => toast.error(e) });

  return (
    <section aria-labelledby="caseload-heading" className="space-y-3">
      <h3 id="caseload-heading" className="text-sm font-semibold text-ink font-sans">Supervisor caseload</h3>
      <p className="text-xs text-muted">A supervisor only sees the teachers listed here: their students, classes, lesson cards, reviews and messages.</p>
      <div className="flex gap-2 items-end">
        <Field label="Add a teacher" htmlFor="caseload-pick" className="flex-1">
          <Select id="caseload-pick" value={pick} searchable onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose…</option>
            {(teachers.data ?? []).filter((t) => !assigned.has(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <UiButton disabled={!pick} loading={set.isPending} onClick={() => run('assign', pick, 'Teacher assigned')}>Assign</UiButton>
      </div>
      <QueryState query={query} empty={<EmptyState title="No teachers assigned" />}>
        {(rows) => (
          <DataTable paginate={false} rows={rows} rowKey={(r) => r.teacherId}
            columns={[
              { key: 'n', header: 'Teacher', render: (r) => r.name },
              { key: 'a', header: <span className="sr-only">Remove</span>, className: 'text-right', render: (r) => (
                <UiButton size="sm" variant="secondary" icon={<Trash2 className="w-3.5 h-3.5" aria-hidden />} disabled={set.isPending} onClick={() => run('unassign', r.teacherId, 'Teacher removed')}>Remove</UiButton>
              ) },
            ]} />
        )}
      </QueryState>
    </section>
  );
}
