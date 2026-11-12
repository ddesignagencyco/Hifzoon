'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, Pencil, Power, RotateCcw } from 'lucide-react';
import { Badge, DataTable, EmptyState, Field, Modal, QueryState, TextArea, TextInput, UiButton, humanize } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminCourse } from '@/hooks/useCoursesAdmin';
import { useAdminCourseList, useCourseLifecycle } from '@/hooks/useCourseExtras';
import { AdminCourseRow } from '@/lib/api/modules/courses-extras';
import { ConfirmDialog } from '../system/shared';

/** Course list with lifecycle actions: edit, switch off/on, archive/restore. */
export function CourseLifecycleTable() {
  const router = useRouter();
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const query = useAdminCourseList(showArchived);
  const life = useCourseLifecycle();
  const [editing, setEditing] = useState<AdminCourseRow | null>(null);
  const [archiving, setArchiving] = useState<AdminCourseRow | null>(null);

  const run = (input: Parameters<typeof life.mutate>[0], ok: string) =>
    life.mutate(input, { onSuccess: () => toast.success(ok), onError: (e) => toast.error(e) });

  return (
    <div className="space-y-4">
      <label className="inline-flex items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
      </label>
      <QueryState query={query} empty={<EmptyState className="rounded-xl border border-line bg-white" title="No courses" />}>
        {(rows) => (
          <DataTable paginate={false} rows={rows} rowKey={(c) => c.id} onRowClick={(c) => router.push(`/admin/courses/${c.id}`)}
            columns={[
              { key: 'name', header: 'Course', render: (c) => (
                <div className="min-w-[160px]">
                  <Link href={`/admin/courses/${c.id}`} className="font-medium text-ink hover:text-green-700" onClick={(e) => e.stopPropagation()}>{c.name}</Link>
                  <p className="text-[11px] text-muted font-mono">{c.code}</p>
                </div>) },
              { key: 'type', header: 'Type', render: (c) => <Badge>{humanize(c.type)}</Badge> },
              { key: 'state', header: 'State', render: (c) => c.archived ? <Badge tone="neutral">Archived</Badge> : c.active ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Switched off</Badge> },
              { key: 'levels', header: 'Levels', className: 'tabular-nums', render: (c) => c.levels },
              { key: 'enr', header: 'Children', className: 'tabular-nums', render: (c) => `${c.liveEnrolments} live / ${c.enrolments}` },
              { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right whitespace-nowrap', render: (c) => (
                <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                  {c.archived ? (
                    <UiButton size="sm" variant="secondary" icon={<RotateCcw className="w-3.5 h-3.5" aria-hidden />} disabled={life.isPending} onClick={() => run({ kind: 'restore', id: c.id }, `${c.name} restored (switched off)`)}>Restore</UiButton>
                  ) : (
                    <>
                      <UiButton size="sm" variant="ghost" icon={<Pencil className="w-3.5 h-3.5" aria-hidden />} onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>Edit</UiButton>
                      <UiButton size="sm" variant="ghost" icon={<Power className="w-3.5 h-3.5" aria-hidden />} disabled={life.isPending} onClick={() => run({ kind: 'active', id: c.id, active: !c.active }, c.active ? `${c.name} switched off` : `${c.name} switched on`)}>{c.active ? 'Switch off' : 'Switch on'}</UiButton>
                      <UiButton size="sm" variant="ghost" icon={<Archive className="w-3.5 h-3.5" aria-hidden />} onClick={() => setArchiving(c)}>Archive</UiButton>
                    </>
                  )}
                </span>) },
            ]} />
        )}
      </QueryState>
      {editing && <EditCourseModal row={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={archiving !== null}
        title={`Archive ${archiving?.name ?? 'course'}?`}
        description={archiving && archiving.enrolments > 0
          ? `${archiving.liveEnrolments} child${archiving.liveEnrolments === 1 ? ' is' : 'ren are'} on this course. Archiving is refused while any child is enrolled; switch it off instead to stop new enrolments.`
          : 'It is hidden everywhere and can be restored later (it comes back switched off).'}
        confirmLabel="Archive"
        pending={life.isPending}
        onClose={() => setArchiving(null)}
        onConfirm={() => archiving && life.mutate({ kind: 'archive', id: archiving.id }, {
          onSuccess: () => { toast.success(`${archiving.name} archived`); setArchiving(null); },
          onError: (e) => { toast.error(e); setArchiving(null); },
        })}
      />
    </div>
  );
}

function EditCourseModal({ row, onClose }: { row: AdminCourseRow; onClose: () => void }) {
  const toast = useToast();
  const life = useCourseLifecycle();
  const detail = useAdminCourse(row.id);
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState<string | null>(null);
  const [locale, setLocale] = useState(row.locale);
  const desc = description ?? detail.data?.description ?? '';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error('Name must be at least 2 characters.');
    if (!desc.trim()) return toast.error('Add a description.');
    if (locale.length < 2 || locale.length > 5) return toast.error('Use a language code like en or ar.');
    life.mutate({ kind: 'update', id: row.id, body: { name: name.trim(), description: desc.trim(), locale } }, {
      onSuccess: () => { toast.success('Course updated'); onClose(); },
      onError: (err) => toast.error(err),
    });
  };
  return (
    <Modal open onClose={() => (life.isPending ? undefined : onClose())} title="Edit course" description={`${row.code} · code and type are fixed`} size="md">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Edit course">
        <Field label="Name" htmlFor="crs-name" required><TextInput id="crs-name" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Language" htmlFor="crs-locale"><TextInput id="crs-locale" value={locale} maxLength={5} onChange={(e) => setLocale(e.target.value)} /></Field>
        <Field label="Description" htmlFor="crs-desc" required><TextArea id="crs-desc" rows={5} value={desc} maxLength={4000} disabled={detail.isLoading} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <UiButton variant="secondary" onClick={onClose} disabled={life.isPending}>Cancel</UiButton>
          <UiButton type="submit" loading={life.isPending} disabled={detail.isLoading}>Save</UiButton>
        </div>
      </form>
    </Modal>
  );
}
