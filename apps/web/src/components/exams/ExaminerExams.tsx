'use client';

import React, { useState } from 'react';
import { Card, CardBody, CardHeader, EmptyState, Field, Modal, PageHeader, QueryState, TextArea, TextInput, UiButton, formatDateTime, humanize } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useMyExams, useRecordExam } from '@/hooks/useCourseExtras';
import { MyExam } from '@/lib/api/modules/courses-extras';
import { previewScore } from '@/lib/api/modules/assessments';

/** Exams assigned to the signed-in examiner, with the level's rubric drawn from the list. */
export function ExaminerExams() {
  const query = useMyExams();
  const [open, setOpen] = useState<MyExam | null>(null);
  return (
    <>
      <PageHeader eyebrow="Examiner" title="My exams" description="Exams assigned to you that still need a result." />
      <QueryState query={query} empty={<EmptyState title="No exams assigned" description="When an admin assigns you an exam it appears here." />}>
        {(rows) => (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((x) => (
              <Card key={x.assessmentId}>
                <CardHeader title={x.student} description={`${x.course} · ${x.level.name} · ${humanize(x.type)}`} />
                <CardBody className="space-y-2">
                  <p className="text-xs text-muted">{x.scheduledFor ? `Planned ${formatDateTime(x.scheduledFor)}` : 'No date set'} · pass mark {x.level.passMark}</p>
                  <UiButton onClick={() => setOpen(x)}>Record result</UiButton>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
      {open && <ResultModal exam={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ResultModal({ exam, onClose }: { exam: MyExam; onClose: () => void }) {
  const toast = useToast();
  const record = useRecordExam();
  const keys = Object.keys(exam.rubric);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const preview = previewScore(exam.rubric, scores);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const out: Record<string, number> = {};
    for (const k of keys) {
      const n = Number(scores[k]);
      if (scores[k] === undefined || scores[k].trim() === '' || !Number.isFinite(n) || n < 0 || n > 100) return toast.error(`Score “${k}” from 0 to 100.`);
      out[k] = n;
    }
    record.mutate({ id: exam.assessmentId, rubricScores: out, ...(notes.trim() ? { notes: notes.trim() } : {}) }, {
      onSuccess: () => { toast.success('Result recorded'); onClose(); },
      // 409 when a result already exists.
      onError: (err) => toast.error(err),
    });
  };

  return (
    <Modal open onClose={() => (record.isPending ? undefined : onClose())} title="Record result" description={`${exam.student} · ${exam.level.name}`} size="md">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Exam result">
        {keys.map((k) => (
          <Field key={k} label={`${k} (weight ${exam.rubric[k]})`} htmlFor={`score-${k}`} required>
            <TextInput id={`score-${k}`} type="number" min={0} max={100} value={scores[k] ?? ''} onChange={(e) => setScores((s) => ({ ...s, [k]: e.target.value }))} />
          </Field>
        ))}
        <p className="text-sm text-ink-2">Weighted score: <strong>{preview ?? '—'}</strong> · pass mark {exam.level.passMark} <span className="text-xs text-muted">(the server records the final figure)</span></p>
        <Field label="Notes" htmlFor="exam-notes"><TextArea id="exam-notes" value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><UiButton variant="secondary" onClick={onClose} disabled={record.isPending}>Cancel</UiButton><UiButton type="submit" loading={record.isPending}>Submit result</UiButton></div>
      </form>
    </Modal>
  );
}
