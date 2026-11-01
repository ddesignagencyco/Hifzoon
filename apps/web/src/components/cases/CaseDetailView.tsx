'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock, UserCheck } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  UiButton,
  formatDateTime,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useAddCaseNote, useAssignCase, useCase, useCases, useSetCaseSeverity, useTransitionCase } from '@/hooks/useCases';
import { CaseSeverityBadge } from './CaseSeverityBadge';
import { CASE_SEVERITIES, type CaseSeverity } from '@/lib/api/modules/cases';
import { isUuid } from '@/lib/api/modules/qa';
import { CaseDetail, NOTE_MAX, caseReference, formatMinutes } from '@/lib/api/modules/cases';
import { CopyReference } from '@/components/ui/CopyReference';
import { ApiClientError } from '@/lib/api/http';
import { CaseTypeBadge } from './CaseBoard';
import { CaseTransitionControl } from './CaseTransitionControl';

export function CaseDetailView({ id, backHref }: { id: string; backHref: string }) {
  const query = useCase(id);

  return (
    <>
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink mb-4">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Back to cases
      </Link>
      {query.isLoading ? (
        <LoadingState label="Opening case…" />
      ) : query.isError || !query.data ? (
        <Card>
          {query.error instanceof ApiClientError && query.error.status === 404 ? (
            <EmptyState title="Case not found" description="It may have been removed, or the link is wrong." />
          ) : (
            <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not open this case" />
          )}
        </Card>
      ) : (
        <CaseDetailBody record={query.data} />
      )}
    </>
  );
}

function CaseDetailBody({ record }: { record: CaseDetail }) {
  const toast = useToast();
  const transition = useTransitionCase(record.id);
  const { sla } = record;

  return (
    <>
      <PageHeader
        eyebrow={`Case ${caseReference(record.id)}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <CaseTypeBadge type={record.type} />
            <StatusBadge status={record.status} />
            <CaseSeverityBadge severity={record.severity} />
          </span>
        }
        description={`Opened by ${record.openedBy.name} · ${formatDateTime(record.createdAt)}`}
      />

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-line bg-sand/60 px-4 py-3 text-xs text-ink-2">
        <Lock className="w-4 h-4 mt-0.5 shrink-0 text-gold-600" aria-hidden />
        <p>Your access to this case has been recorded. Notes are append-only and cannot be edited or deleted.</p>
      </div>

      {record.status !== 'CLOSED' &&
        (sla.breached ? (
          <Alert tone="error" title="SLA breached" className="mb-4">
            Response was due {formatDateTime(sla.dueAt)} — {formatMinutes(sla.minutesRemaining)} overdue.
          </Alert>
        ) : (
          <Alert tone={sla.minutesRemaining <= 5 ? 'warning' : 'neutral'} title="Within SLA" className="mb-4">
            {formatMinutes(sla.minutesRemaining)} remaining (due {formatDateTime(sla.dueAt)}).
          </Alert>
        ))}

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader title="Summary" />
            <CardBody>
              <p className="text-sm text-ink whitespace-pre-wrap break-words">{record.summary}</p>
            </CardBody>
          </Card>
          <NotesCard record={record} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Status" description="Only the next steps this case can take are offered." />
            <CardBody>
              <CaseTransitionControl
                status={record.status}
                noteCount={record.notes.length}
                pending={transition.isPending}
                onTransition={(next) =>
                  transition.mutate(next, {
                    onSuccess: (updated) => toast.success(`Case moved to ${updated.status.toLowerCase()}.`),
                    onError: (err) => toast.error(err),
                  })
                }
              />
            </CardBody>
          </Card>
          <AssignCard record={record} />
          {record.status !== 'CLOSED' && <SeverityCard record={record} />}
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="space-y-2.5 text-xs">
                <Row label="Owner" value={record.owner?.name ?? 'Unassigned'} />
                <Row label="Opened by" value={record.openedBy.name} />
                <Row label="Alerted" value={formatDateTime(record.alertedAt)} />
                <Row label="Due" value={formatDateTime(record.dueAt)} />
                {record.closedAt && <Row label="Closed" value={formatDateTime(record.closedAt)} />}
                {record.class && (
                  <Row
                    label="Class"
                    value={`${record.class.course?.name ?? 'Class'} · ${formatDateTime(record.class.startsAt)}`}
                  />
                )}
                {record.subjectUserId && <Row label="Subject user" value={<CopyReference value={record.subjectUserId} label="subject user reference" />} />}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className="text-ink text-right min-w-0">{value}</dd>
    </div>
  );
}

function NotesCard({ record }: { record: CaseDetail }) {
  const toast = useToast();
  const addNote = useAddCaseNote(record.id);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = note.trim();
    const problem = !text ? 'Write a note first.' : text.length > NOTE_MAX ? `Notes cannot exceed ${NOTE_MAX} characters.` : null;
    setError(problem);
    if (problem) return toast.error(problem);
    addNote.mutate(text, {
      onSuccess: () => {
        setNote('');
        toast.success('Note added to the case record.');
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <Card>
      <CardHeader title="Timeline" description={`${record.notes.length} note${record.notes.length === 1 ? '' : 's'}, oldest first`} />
      <CardBody>
        {record.notes.length === 0 ? (
          <EmptyState title="No notes yet" description="Record what has been done. A case cannot be closed without a note." />
        ) : (
          <ol className="relative border-l border-line ml-2 space-y-5 mb-6">
            {record.notes.map((n) => (
              <li key={n.id} className="pl-5 relative">
                <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-gold" aria-hidden />
                <p className="text-[11px] text-muted">
                  <span className="font-semibold text-ink-2">{n.author.name}</span> · {formatDateTime(n.createdAt)}
                </p>
                <p className="text-sm text-ink whitespace-pre-wrap break-words mt-1">{n.note}</p>
              </li>
            ))}
          </ol>
        )}
        <form onSubmit={submit} className="space-y-3 border-t border-line pt-4">
          <Field label="Add a note" htmlFor="case-note" error={error} hint={`${note.trim().length}/${NOTE_MAX}`}>
            <TextArea id="case-note" rows={4} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <UiButton type="submit" loading={addNote.isPending} disabled={!note.trim()}>
              Add note
            </UiButton>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

/**
 * There is no endpoint that lists safeguarding staff, so candidates are the people
 * already visible on cases (owners, openers, note authors) plus "me"; any other user
 * can be assigned by id.
 */
/** M28 — change how serious the case is (audited). */
function SeverityCard({ record }: { record: CaseDetail }) {
  const toast = useToast();
  const setSeverity = useSetCaseSeverity(record.id);
  return (
    <Card>
      <CardHeader title="Severity" description="Decides the order on the case board." />
      <CardBody>
        <Select
          id="case-severity-edit"
          aria-label="Severity"
          value={record.severity ?? 'MEDIUM'}
          disabled={setSeverity.isPending}
          onChange={(e) =>
            setSeverity.mutate(e.target.value as CaseSeverity, {
              onSuccess: () => toast.success('Severity updated'),
              onError: (err) => toast.error(err),
            })
          }
        >
          {CASE_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>
      </CardBody>
    </Card>
  );
}

function AssignCard({ record }: { record: CaseDetail }) {
  const toast = useToast();
  const { currentUser } = useAuth();
  const assign = useAssignCase(record.id);
  // Recent cases, only to offer their owners/openers as reassignment candidates.
  const board = useCases({ limit: 100 });
  const [choice, setChoice] = useState('');
  const [manualId, setManualId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const people = new Map<string, string>();
    if (currentUser) people.set(currentUser.id, `${currentUser.name} (me)`);
    const add = (p: { id: string; name: string } | null | undefined) => {
      if (p && !people.has(p.id)) people.set(p.id, p.name);
    };
    add(record.owner);
    add(record.openedBy);
    record.notes.forEach((n) => add(n.author));
    board.data?.items.forEach((c) => {
      add(c.owner);
      add(c.openedBy);
    });
    return [...people.entries()].map(([id, name]) => ({ id, name }));
  }, [currentUser, record, board.data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const ownerId = choice === '__manual' ? manualId.trim() : choice;
    const problem = !isUuid(ownerId)
      ? choice === '__manual'
        ? 'Paste a valid user reference.'
        : 'Choose an owner.'
      : ownerId === record.ownerId
        ? 'That person already owns this case.'
        : null;
    setError(problem);
    if (problem) return toast.error(problem);
    assign.mutate(ownerId, {
      onSuccess: () => {
        toast.success('Case owner updated.');
        setChoice('');
        setManualId('');
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <Card>
      <CardHeader
        title="Owner"
        description={record.owner ? `Currently ${record.owner.name}` : 'Nobody owns this case yet.'}
        action={!record.owner ? <Badge tone="amber">Unassigned</Badge> : undefined}
      />
      <CardBody>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Assign to" htmlFor="case-owner-select" error={error}>
            <Select id="case-owner-select" value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Choose a person…</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__manual">Someone else (paste their user reference)</option>
            </Select>
          </Field>
          {choice === '__manual' && (
            <Field label="User reference" htmlFor="case-owner-manual" hint="An admin can copy it in Users & search → open the person → “Copy reference”.">
              <TextInput id="case-owner-manual" value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder="Paste user reference" />
            </Field>
          )}
          <UiButton type="submit" className="w-full" loading={assign.isPending} icon={<UserCheck className="w-4 h-4" />}>
            Assign owner
          </UiButton>
        </form>
      </CardBody>
    </Card>
  );
}
