'use client';

import React, { useState } from 'react';
import { Alert, EmptyState, Field, Modal, QueryState, Select, StatusBadge, TextInput, UiButton, formatDate, humanize } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useEnrolmentAssessments } from '@/hooks/useAssessments';
import { useExamAdmin } from '@/hooks/useCourseExtras';
import { AssessmentType } from '@/lib/api/modules/assessments';
import { isUuid } from '@/lib/api/modules/courses-admin';

const TYPES: AssessmentType[] = ['LEVEL', 'MILESTONE_JUZ', 'IJAZAH'];

/** Assign an exam to an examiner for one enrolment; pending exams can be reassigned or withdrawn. */
export function ExamAssignModal({ enrolmentId, label, onClose }: { enrolmentId: string; label: string; onClose: () => void }) {
  const toast = useToast();
  const { assign, cancel } = useExamAdmin(enrolmentId);
  const existing = useEnrolmentAssessments(enrolmentId);
  const [examinerId, setExaminerId] = useState('');
  const [type, setType] = useState<AssessmentType>('LEVEL');
  const [when, setWhen] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isUuid(examinerId)) return toast.error('Paste the examiner’s account reference (from Users & search).');
    assign.mutate({ examinerId: examinerId.trim(), type, ...(when ? { scheduledFor: new Date(when).toISOString() } : {}) }, {
      onSuccess: () => { toast.success('Exam assigned'); setExaminerId(''); setWhen(''); },
      // 409 when a pending exam of this level and type already exists; 400 when the person is not an examiner.
      onError: (err) => toast.error(err),
    });
  };

  return (
    <Modal open onClose={() => (assign.isPending ? undefined : onClose())} title="Exams" description={label} size="md">
      <div className="space-y-5">
        <QueryState query={existing} isEmpty={() => false}>
          {(d) => {
            const pending = d.assessments.filter((a) => a.result === 'PENDING');
            return pending.length === 0 ? <EmptyState title="No exam waiting" /> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {pending.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>{humanize(a.type)} · {a.level.name} <StatusBadge status="PENDING" />{a.takenAt ? ` · ${formatDate(a.takenAt)}` : ''}</span>
                    <UiButton size="sm" variant="secondary" disabled={cancel.isPending} onClick={() => cancel.mutate(a.id, { onSuccess: () => toast.success('Exam withdrawn'), onError: (e) => toast.error(e) })}>Withdraw</UiButton>
                  </li>
                ))}
              </ul>
            );
          }}
        </QueryState>
        <form onSubmit={submit} noValidate className="space-y-3" aria-label="Assign an exam">
          <Alert tone="neutral">Created at the child&apos;s current level. The examiner must hold the Examiner role.</Alert>
          <Field label="Examiner account reference" htmlFor="exam-examiner" required hint="Copy the reference from the examiner's account in Users & search."><TextInput id="exam-examiner" value={examinerId} onChange={(e) => setExaminerId(e.target.value)} placeholder="xxxxxxxx-xxxx-…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Exam type" htmlFor="exam-type"><Select id="exam-type" value={type} onChange={(e) => setType(e.target.value as AssessmentType)}>{TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
            <Field label="Planned date (optional)" htmlFor="exam-when"><TextInput id="exam-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          </div>
          <div className="flex justify-end gap-2"><UiButton variant="secondary" onClick={onClose}>Close</UiButton><UiButton type="submit" loading={assign.isPending}>Assign exam</UiButton></div>
        </form>
      </div>
    </Modal>
  );
}
