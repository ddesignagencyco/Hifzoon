'use client';

import React, { useState } from 'react';
import { Alert, DataTable, EmptyState, Field, Modal, QueryState, TextArea, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useMyPermissions } from '@/hooks/usePermissions';
import { useClassChange, useSubstituteActions, useSubstituteCandidates } from '@/hooks/useSchedulingExtras';
import { MAX_OFFERED_AT_ONCE } from '@/lib/api/modules/scheduling-admin';

/** Only upcoming, still-scheduled classes can be changed. */
export function isChangeable(c: { status: string; startsAt: string }): boolean {
  return c.status === 'SCHEDULED' && new Date(c.startsAt).getTime() > Date.now();
}

/** Cancel / reschedule / substitute buttons for one upcoming class. */
export function ClassActions({ classId, label }: { classId: string; label: string }) {
  const { can } = useMyPermissions();
  const [mode, setMode] = useState<'cancel' | 'reschedule' | 'substitute' | null>(null);
  return (
    <span className="inline-flex gap-1">
      <UiButton size="sm" variant="ghost" onClick={() => setMode('reschedule')} aria-label={`Reschedule ${label}`}>Reschedule</UiButton>
      <UiButton size="sm" variant="ghost" onClick={() => setMode('cancel')} aria-label={`Cancel ${label}`}>Cancel</UiButton>
      {can('scheduling.substitute.manage') && <UiButton size="sm" variant="ghost" onClick={() => setMode('substitute')} aria-label={`Substitute teacher for ${label}`}>Substitute</UiButton>}
      {mode === 'cancel' && <CancelModal classId={classId} label={label} onClose={() => setMode(null)} />}
      {mode === 'reschedule' && <RescheduleModal classId={classId} label={label} onClose={() => setMode(null)} />}
      {mode === 'substitute' && <SubstituteModal classId={classId} label={label} onClose={() => setMode(null)} />}
    </span>
  );
}

function CancelModal({ classId, label, onClose }: { classId: string; label: string; onClose: () => void }) {
  const toast = useToast();
  const { cancel } = useClassChange();
  const [reason, setReason] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return toast.error('Give a reason.');
    cancel.mutate({ classId, reason: reason.trim() }, { onSuccess: () => { toast.success('Class cancelled'); onClose(); }, onError: (err) => toast.error(err) });
  };
  return (
    <Modal open onClose={() => (cancel.isPending ? undefined : onClose())} title="Cancel this class?" description={label} size="sm">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Cancel class">
        <Field label="Reason" htmlFor="cc-reason-cls" required><TextArea id="cc-reason-cls" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
        <div className="flex justify-end gap-2"><UiButton variant="secondary" onClick={onClose} disabled={cancel.isPending}>Keep class</UiButton><UiButton type="submit" variant="danger" loading={cancel.isPending}>Cancel class</UiButton></div>
      </form>
    </Modal>
  );
}

function RescheduleModal({ classId, label, onClose }: { classId: string; label: string; onClose: () => void }) {
  const toast = useToast();
  const { reschedule } = useClassChange();
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = new Date(when);
    if (!when || Number.isNaN(t.getTime()) || t.getTime() <= Date.now()) return toast.error('Choose a time in the future.');
    const d = duration.trim() === '' ? undefined : Number(duration);
    if (d !== undefined && (!Number.isInteger(d) || d < 15 || d > 240)) return toast.error('Length must be 15 to 240 minutes.');
    reschedule.mutate({ classId, newStartsAt: t.toISOString(), durationMinutes: d }, { onSuccess: () => { toast.success('Class rescheduled'); onClose(); }, onError: (err) => toast.error(err) });
  };
  return (
    <Modal open onClose={() => (reschedule.isPending ? undefined : onClose())} title="Reschedule class" description={label} size="sm">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Reschedule class">
        <Field label="New start (your time zone)" htmlFor="rs-when" required><TextInput id="rs-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} autoFocus /></Field>
        <Field label="Length in minutes (optional)" htmlFor="rs-dur"><TextInput id="rs-dur" type="number" min={15} max={240} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><UiButton variant="secondary" onClick={onClose} disabled={reschedule.isPending}>Cancel</UiButton><UiButton type="submit" loading={reschedule.isPending}>Reschedule</UiButton></div>
      </form>
    </Modal>
  );
}

function SubstituteModal({ classId, label, onClose }: { classId: string; label: string; onClose: () => void }) {
  const toast = useToast();
  const candidates = useSubstituteCandidates(classId);
  const { offer, assign } = useSubstituteActions(classId);
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_OFFERED_AT_ONCE ? p : [...p, id]));
  const busy = offer.isPending || assign.isPending;
  return (
    <Modal open onClose={() => (busy ? undefined : onClose())} title="Substitute teacher" description={label} size="md">
      <div className="space-y-3">
        <Alert tone="neutral">Offer the class to up to {MAX_OFFERED_AT_ONCE} teachers; the first to accept gets it. Or assign one directly. The family and both teachers are notified.</Alert>
        <QueryState query={candidates} isEmpty={(d) => d.candidates.length === 0} empty={<EmptyState title="No free teacher" description="No cleared teacher for this course is free at that time." />}>
          {(d) => (
            <DataTable paginate={false} rows={d.candidates} rowKey={(c) => c.teacherId}
              columns={[
                { key: 'p', header: 'Offer', render: (c) => <input type="checkbox" aria-label={`Offer to ${c.name}`} checked={picked.includes(c.teacherId)} disabled={c.offerStatus === 'PENDING'} onChange={() => toggle(c.teacherId)} /> },
                { key: 'n', header: 'Teacher', render: (c) => <span className="font-medium text-ink">{c.name}</span> },
                { key: 'r', header: 'Rating', className: 'tabular-nums', render: (c) => (c.ratingCount ? `${c.ratingAvg.toFixed(1)} (${c.ratingCount})` : '—') },
                { key: 's', header: 'Offer', render: (c) => c.offerStatus ?? '—' },
                { key: 'a', header: <span className="sr-only">Assign</span>, className: 'text-right', render: (c) => (
                  <UiButton size="sm" variant="secondary" disabled={busy} onClick={() => assign.mutate(c.teacherId, { onSuccess: () => { toast.success(`${c.name} assigned`); onClose(); }, onError: (e) => toast.error(e) })}>Assign now</UiButton>) },
              ]} />
          )}
        </QueryState>
        <div className="flex justify-end gap-2">
          <UiButton variant="secondary" onClick={onClose} disabled={busy}>Close</UiButton>
          <UiButton disabled={picked.length === 0} loading={offer.isPending} onClick={() => offer.mutate({ teacherIds: picked }, { onSuccess: () => { toast.success(`Offered to ${picked.length} teacher${picked.length === 1 ? '' : 's'}`); setPicked([]); }, onError: (e) => toast.error(e) })}>
            Send offer{picked.length > 1 ? 's' : ''}
          </UiButton>
        </div>
      </div>
    </Modal>
  );
}
