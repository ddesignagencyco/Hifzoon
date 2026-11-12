'use client';

import React, { useState } from 'react';
import { Card, DataTable, EmptyState, Field, Modal, PageHeader, QueryState, Select, StatusBadge, TextArea, UiButton, formatDateTime } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useRespondRevisionRequest, useRevisionRequests } from '@/hooks/useRevisionRequests';
import { REVISION_MESSAGE_MAX, RevisionRequest, RevisionStatus, revisionReasonLabel, validateRevisionText } from '@/lib/api/modules/revision-requests';

/** Staff answer to family questions about lesson cards (a scoped supervisor sees only their teachers' cards). */
export function RevisionRequestsDesk() {
  const [status, setStatus] = useState<RevisionStatus | ''>('OPEN');
  const query = useRevisionRequests({ scope: 'all', status: status || undefined });
  const [answering, setAnswering] = useState<RevisionRequest | null>(null);
  return (
    <>
      <PageHeader eyebrow="Quality" title="Family questions on lesson cards" description="Answer a request, or see what the teacher already replied in Messages." />
      <Field label="Status" htmlFor="rr-status" className="w-48 mb-4">
        <Select id="rr-status" value={status} onChange={(e) => setStatus(e.target.value as RevisionStatus | '')}>
          <option value="">All</option><option value="OPEN">Open</option><option value="ANSWERED">Answered</option><option value="CLOSED">Closed</option>
        </Select>
      </Field>
      <QueryState query={query} empty={<Card><EmptyState title="Nothing to answer" /></Card>}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(r) => r.id}
            columns={[
              { key: 'd', header: 'Asked', sortValue: (r) => r.createdAt, render: (r) => formatDateTime(r.createdAt) },
              { key: 's', header: 'Child', render: (r) => r.student.displayName },
              { key: 't', header: 'Teacher', render: (r) => r.lessonCard.teacher.name },
              { key: 'r', header: 'Reason', render: (r) => revisionReasonLabel(r.reason) },
              { key: 'm', header: 'Question', render: (r) => <span className="line-clamp-2 max-w-sm">{r.message}</span> },
              { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'a', header: <span className="sr-only">Answer</span>, className: 'text-right', render: (r) => r.status === 'CLOSED' ? null : <UiButton size="sm" variant="secondary" onClick={() => setAnswering(r)}>{r.status === 'ANSWERED' ? 'View / amend' : 'Answer'}</UiButton> },
            ]} />
        )}
      </QueryState>
      {answering && <AnswerModal request={answering} onClose={() => setAnswering(null)} />}
    </>
  );
}

function AnswerModal({ request, onClose }: { request: RevisionRequest; onClose: () => void }) {
  const toast = useToast();
  const respond = useRespondRevisionRequest();
  const [text, setText] = useState(request.response ?? '');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateRevisionText(text, REVISION_MESSAGE_MAX, 'response');
    if (err) return toast.error(err);
    respond.mutate({ id: request.id, response: text }, { onSuccess: () => { toast.success('Answer sent'); onClose(); }, onError: (x) => toast.error(x) });
  };
  return (
    <Modal open onClose={() => (respond.isPending ? undefined : onClose())} title="Answer request" description={`${request.student.displayName} · ${revisionReasonLabel(request.reason)}`} size="md">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Answer request">
        <p className="rounded-xl bg-sand p-3 text-sm text-ink-2 whitespace-pre-wrap">{request.message}</p>
        <Field label="Your answer" htmlFor="rr-answer" required hint={`${text.length}/${REVISION_MESSAGE_MAX}`}><TextArea id="rr-answer" rows={5} maxLength={REVISION_MESSAGE_MAX} value={text} onChange={(e) => setText(e.target.value)} autoFocus /></Field>
        <div className="flex justify-end gap-2"><UiButton variant="secondary" onClick={onClose} disabled={respond.isPending}>Cancel</UiButton><UiButton type="submit" loading={respond.isPending}>Send answer</UiButton></div>
      </form>
    </Modal>
  );
}
