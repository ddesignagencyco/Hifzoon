'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import {
  Card, CardBody, CardHeader, Checkbox, DataTable, EmptyState, Field, Modal, PageHeader, QueryState, Select,
  StatTile, StatusBadge, TextArea, TextInput, UiButton, formatDateTime, humanize,
} from '@/components/ui/primitives';
import { TimezoneSelect } from '@/components/ui/TimezoneSelect';
import { BackLink } from '@/components/ui/BackLink';
import { useToast } from '@/components/ui/toast';
import { useStudentDetail, useUpdateStudent } from '@/hooks/useOpsAdmin';
import { useMyPermissions } from '@/hooks/usePermissions';
import { StudentDetail } from '@/lib/api/modules/ops-admin';

export function StudentDetailScreen({ studentId }: { studentId: string }) {
  const query = useStudentDetail(studentId);
  const { can } = useMyPermissions();
  const [editing, setEditing] = useState(false);
  return (
    <QueryState query={query}>
      {(s) => (
        <>
          <BackLink fallback="/admin/users" />
          <PageHeader
            eyebrow="Child"
            title={s.displayName}
            description={`Born ${s.birthYear} · ${s.language.toUpperCase()} · ${s.timeZone}`}
            actions={can('families.edit') ? (
              <UiButton variant="secondary" icon={<Pencil className="w-4 h-4" aria-hidden />} onClick={() => setEditing(true)}>Edit</UiButton>
            ) : undefined}
          />
          <p className="text-sm text-ink-2 mb-4">Family: <Link className="text-green-800 font-semibold hover:underline" href={`/admin/families/${s.family.id}`}>{s.family.name}</Link>{s.kidsMode ? ' · Kids mode on' : ''}</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {Object.entries(s.classCounts).map(([k, v]) => <StatTile key={k} label={humanize(k)} value={v} />)}
            {Object.keys(s.classCounts).length === 0 && <StatTile label="Classes" value={0} />}
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Enrolments" />
              <CardBody>
                <DataTable paginate={false} rows={s.enrolments} rowKey={(e) => e.id} empty={<EmptyState title="Not enrolled" />}
                  columns={[
                    { key: 'c', header: 'Course', render: (e) => e.course.name },
                    { key: 'l', header: 'Level', render: (e) => e.currentLevel?.name ?? '—' },
                    { key: 't', header: 'Teacher', render: (e) => e.teacher?.user.name ?? 'Unassigned' },
                    { key: 's', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
                  ]} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Recent classes" description="Latest ten" />
              <CardBody>
                <DataTable paginate={false} rows={s.recentClasses} rowKey={(c) => c.id} empty={<EmptyState title="No classes yet" />}
                  columns={[
                    { key: 'w', header: 'When', render: (c) => formatDateTime(c.startsAt) },
                    { key: 'c', header: 'Course', render: (c) => c.course.name },
                    { key: 't', header: 'Teacher', render: (c) => c.teacher.user.name },
                    { key: 'ty', header: 'Type', render: (c) => humanize(c.type) },
                    { key: 's', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
                  ]} />
              </CardBody>
            </Card>
            {s.notes && <Card><CardHeader title="Notes" /><CardBody><p className="text-sm text-ink-2 whitespace-pre-wrap">{s.notes}</p></CardBody></Card>}
          </div>
          {editing && <EditStudentModal student={s} onClose={() => setEditing(false)} />}
        </>
      )}
    </QueryState>
  );
}

function EditStudentModal({ student, onClose }: { student: StudentDetail; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateStudent(student.id, student.family.id);
  const [f, setF] = useState({
    displayName: student.displayName,
    birthYear: String(student.birthYear),
    gender: student.gender ?? '',
    language: student.language,
    timeZone: student.timeZone,
    kidsMode: student.kidsMode,
    notes: student.notes ?? '',
    mushafLayout: student.mushafLayout,
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const year = Number(f.birthYear);
    if (!f.displayName.trim()) return toast.error('A child needs a name.');
    if (!Number.isInteger(year) || year < new Date().getFullYear() - 90 || year > new Date().getFullYear()) return toast.error('Birth year is not plausible.');
    if (f.language.length < 2 || f.language.length > 5) return toast.error('Use a language code like en or ar.');
    update.mutate(
      {
        displayName: f.displayName.trim(), birthYear: year, language: f.language, timeZone: f.timeZone, kidsMode: f.kidsMode,
        notes: f.notes.trim() || null, mushafLayout: f.mushafLayout,
        ...(f.gender ? { gender: f.gender as 'MALE' | 'FEMALE' | 'OTHER' } : {}),
      },
      { onSuccess: () => { toast.success('Child updated'); onClose(); }, onError: (err) => toast.error(err) },
    );
  };

  return (
    <Modal open onClose={() => (update.isPending ? undefined : onClose())} title="Edit child" size="md">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Edit child">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="st-name" required><TextInput id="st-name" value={f.displayName} maxLength={120} onChange={(e) => set({ displayName: e.target.value })} autoFocus /></Field>
          <Field label="Birth year" htmlFor="st-year" required><TextInput id="st-year" inputMode="numeric" value={f.birthYear} onChange={(e) => set({ birthYear: e.target.value })} /></Field>
          <Field label="Gender" htmlFor="st-gender">
            <Select id="st-gender" value={f.gender} onChange={(e) => set({ gender: e.target.value })}>
              <option value="">Not set</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Language" htmlFor="st-lang"><TextInput id="st-lang" value={f.language} maxLength={5} onChange={(e) => set({ language: e.target.value })} /></Field>
          <Field label="Time zone" htmlFor="st-tz"><TimezoneSelect id="st-tz" value={f.timeZone} onChange={(v) => set({ timeZone: v })} /></Field>
          <Field label="Mushaf layout" htmlFor="st-mushaf">
            <Select id="st-mushaf" value={f.mushafLayout} onChange={(e) => set({ mushafLayout: e.target.value as StudentDetail['mushafLayout'] })}>
              <option value="MADANI_15">Madani 15-line</option><option value="INDOPAK_13">IndoPak 13-line</option><option value="INDOPAK_16">IndoPak 16-line</option>
            </Select>
          </Field>
        </div>
        <Checkbox id="st-kids" label="Kids mode" checked={f.kidsMode} onChange={(on) => set({ kidsMode: on })} />
        <Field label="Notes" htmlFor="st-notes" hint="The audit log records that notes changed, not their text."><TextArea id="st-notes" value={f.notes} maxLength={4000} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <UiButton variant="secondary" onClick={onClose} disabled={update.isPending}>Cancel</UiButton>
          <UiButton type="submit" loading={update.isPending}>Save</UiButton>
        </div>
      </form>
    </Modal>
  );
}
