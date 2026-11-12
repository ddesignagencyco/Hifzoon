'use client';

import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Alert, Badge, Card, DataTable, EmptyState, Field, Modal, PageHeader, QueryState, Select, TextInput, UiButton, formatDate } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useHolidays, useSaveHoliday } from '@/hooks/useSchedulingExtras';
import { useMyPermissions } from '@/hooks/usePermissions';
import { Holiday, HolidayType, validateHoliday } from '@/lib/api/modules/scheduling-admin';
import { ConfirmDialog } from '../system/shared';

const day = (v: string) => v.slice(0, 10);

/** Academy holidays (closures) and the Ramadan timetable. Each change reports how many classes were rebuilt. */
export function HolidaysManager() {
  const { can, isLoading } = useMyPermissions();
  const toast = useToast();
  const [past, setPast] = useState(false);
  const query = useHolidays(past ? undefined : new Date().toISOString().slice(0, 10));
  const save = useSaveHoliday();
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Holiday | null>(null);
  const manage = can('scheduling.holidays.manage');

  if (!isLoading && !manage) return <Card><EmptyState title="No access" description="You do not have the holidays permission." /></Card>;
  return (
    <>
      <PageHeader eyebrow="Academy admin" title="Holidays & Ramadan timetable" description="A holiday removes classes on those dates. A Ramadan window moves them later or earlier and can shorten them."
        actions={<UiButton icon={<Plus className="w-4 h-4" aria-hidden />} onClick={() => setEditing('new')}>New</UiButton>} />
      <label className="inline-flex items-center gap-2 text-xs text-ink-2 mb-3"><input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} /> Include past</label>
      <QueryState query={query} empty={<EmptyState title="Nothing planned" />}>
        {(rows) => (
          <DataTable paginate={false} rows={rows} rowKey={(h) => h.id}
            columns={[
              { key: 'n', header: 'Name', render: (h) => <span className="font-medium text-ink">{h.name}</span> },
              { key: 't', header: 'Type', render: (h) => h.type === 'HOLIDAY' ? <Badge tone="red">Closed</Badge> : <Badge tone="gold">Ramadan timetable</Badge> },
              { key: 'd', header: 'Dates', render: (h) => `${formatDate(h.startsOn)} – ${formatDate(h.endsOn)}` },
              { key: 'r', header: 'Rule', render: (h) => h.type === 'HOLIDAY' ? '—' : [h.shiftRule?.shiftMinutes ? `${h.shiftRule.shiftMinutes > 0 ? '+' : ''}${h.shiftRule.shiftMinutes} min` : null, h.shiftRule?.durationMinutes ? `${h.shiftRule.durationMinutes} min classes` : null].filter(Boolean).join(', ') || '—' },
              { key: 'a', header: <span className="sr-only">Actions</span>, className: 'text-right whitespace-nowrap', render: (h) => (
                <span className="inline-flex gap-1">
                  <UiButton size="sm" variant="ghost" icon={<Pencil className="w-3.5 h-3.5" aria-hidden />} onClick={() => setEditing(h)} aria-label={`Edit ${h.name}`}>Edit</UiButton>
                  <UiButton size="sm" variant="ghost" icon={<Trash2 className="w-3.5 h-3.5" aria-hidden />} onClick={() => setDeleting(h)} aria-label={`Delete ${h.name}`}>Delete</UiButton>
                </span>) },
            ]} />
        )}
      </QueryState>
      {editing && <HolidayModal holiday={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={deleting !== null} title={`Delete ${deleting?.name ?? ''}?`} description="Classes removed by it are brought back." confirmLabel="Delete" pending={save.isPending} onClose={() => setDeleting(null)}
        onConfirm={() => deleting && save.mutate({ kind: 'delete', id: deleting.id }, {
          onSuccess: (r) => { toast.success(`Deleted. ${(r as { classesRebuilt?: number })?.classesRebuilt ?? 0} classes rebuilt.`); setDeleting(null); },
          onError: (e) => { toast.error(e); setDeleting(null); } })} />
    </>
  );
}

function HolidayModal({ holiday, onClose }: { holiday: Holiday | null; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveHoliday();
  const [f, setF] = useState({
    name: holiday?.name ?? '', type: (holiday?.type ?? 'HOLIDAY') as HolidayType,
    startsOn: holiday ? day(holiday.startsOn) : '', endsOn: holiday ? day(holiday.endsOn) : '',
    shiftMinutes: holiday?.shiftRule?.shiftMinutes !== undefined ? String(holiday.shiftRule.shiftMinutes) : '',
    durationMinutes: holiday?.shiftRule?.durationMinutes !== undefined ? String(holiday.shiftRule.durationMinutes) : '',
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateHoliday(f);
    if (err) return toast.error(err);
    const body = {
      name: f.name.trim(), type: f.type, startsOn: f.startsOn, endsOn: f.endsOn,
      ...(f.type === 'RAMADAN_TIMETABLE' ? { shiftRule: {
        ...(f.shiftMinutes.trim() !== '' ? { shiftMinutes: Number(f.shiftMinutes) } : {}),
        ...(f.durationMinutes.trim() !== '' ? { durationMinutes: Number(f.durationMinutes) } : {}) } } : {}),
    };
    save.mutate(holiday ? { kind: 'update', id: holiday.id, body } : { kind: 'create', body }, {
      onSuccess: (r) => { toast.success(`Saved. ${(r as Holiday)?.classesRebuilt ?? 0} classes rebuilt.`); onClose(); },
      // 409: Ramadan windows cannot overlap.
      onError: (x) => toast.error(x),
    });
  };

  return (
    <Modal open onClose={() => (save.isPending ? undefined : onClose())} title={holiday ? 'Edit' : 'New holiday or timetable'} size="md">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Holiday">
        <Alert tone="neutral">Saving rebuilds the affected classes straight away. A closure wins over a Ramadan shift on the same date.</Alert>
        <Field label="Name" htmlFor="hol-name" required><TextInput id="hol-name" value={f.name} maxLength={160} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
        <Field label="Type" htmlFor="hol-type"><Select id="hol-type" value={f.type} onChange={(e) => set({ type: e.target.value as HolidayType })}><option value="HOLIDAY">Closed (no classes)</option><option value="RAMADAN_TIMETABLE">Ramadan timetable</option></Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="hol-from" required><TextInput id="hol-from" type="date" value={f.startsOn} onChange={(e) => set({ startsOn: e.target.value })} /></Field>
          <Field label="To (inclusive)" htmlFor="hol-to" required><TextInput id="hol-to" type="date" value={f.endsOn} onChange={(e) => set({ endsOn: e.target.value })} /></Field>
        </div>
        {f.type === 'RAMADAN_TIMETABLE' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shift (minutes, -360 to 360)" htmlFor="hol-shift" hint="Positive = later, negative = earlier."><TextInput id="hol-shift" type="number" value={f.shiftMinutes} onChange={(e) => set({ shiftMinutes: e.target.value })} /></Field>
            <Field label="Class length (10–180)" htmlFor="hol-dur" hint="Leave blank to keep the length."><TextInput id="hol-dur" type="number" value={f.durationMinutes} onChange={(e) => set({ durationMinutes: e.target.value })} /></Field>
          </div>
        )}
        <div className="flex justify-end gap-2"><UiButton variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</UiButton><UiButton type="submit" loading={save.isPending}>Save</UiButton></div>
      </form>
    </Modal>
  );
}
