'use client';

import React, { useState } from 'react';
import { CheckCircle2, Lock, Pencil, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks';
import { Role } from '@/lib/types';
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
  QueryState,
  TextArea,
  UiButton,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  useApproveAiDraft,
  useLessonCard,
  useLessonCardEditLog,
  useSaveAiDraft,
  useUpdateLessonCard,
} from '@/hooks/useLessonCards';
import { layoutLabel } from '@/lib/api/modules/mushaf';
import {
  AI_DRAFT_MAX,
  GRADE_LABELS,
  Grade,
  LessonCard,
  LessonEditLogEntry,
  MISTAKE_TYPE_LABELS,
  PORTION_KIND_LABELS,
  formatRange,
  hoursUntilLock,
  portionToDraft,
} from '@/lib/api/modules/lessons';
import { LessonCardForm } from './LessonCardForm';

const SUPERVISOR_ROLES: Role[] = [Role.SUPERVISOR, Role.SUPER_ADMIN];
const EDIT_LOG_ROLES: Role[] = [Role.TEACHER, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN];

/** Lesson card detail with role-gated edit (FR-REC-08), edit log and AI summary approval (FR-REC-05). */
export function LessonCardDetail({ lessonCardId }: { lessonCardId: string }) {
  const card = useLessonCard(lessonCardId);
  return (
    <>
      <PageHeader eyebrow="Lesson card" title={card.data ? `Lesson card — ${card.data.student.displayName}` : 'Lesson card'} />
      {card.isLoading ? (
        <LoadingState label="Loading the lesson card…" />
      ) : card.isError || !card.data ? (
        <Card>
          <ErrorState error={card.error} onRetry={() => card.refetch()} title="Could not load this lesson card" />
        </Card>
      ) : (
        <CardView card={card.data} />
      )}
    </>
  );
}

function CardView({ card }: { card: LessonCard }) {
  const { currentUser } = useAuth();
  const roles = (currentUser?.roles ?? []) as Role[];
  const isOwner = !!currentUser && card.teacher.id === currentUser.id;
  const isSupervisor = roles.some((r) => SUPERVISOR_ROLES.includes(r));
  const canEdit = (isOwner && !card.locked) || isSupervisor;
  const reasonMode = card.locked && isSupervisor && !isOwner ? 'required' : isSupervisor && card.locked ? 'optional' : 'hidden';
  const canSeeLog = roles.some((r) => EDIT_LOG_ROLES.includes(r));
  const [editing, setEditing] = useState(false);
  const update = useUpdateLessonCard(card.id);
  const toast = useToast();
  const lockHours = hoursUntilLock(card.submittedAt);

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
      <div className="space-y-6 min-w-0">
        <div className="flex flex-wrap gap-2" aria-label="Card status">
          {card.submittedAt && <Badge tone="green">Submitted {formatDateTime(card.submittedAt)}</Badge>}
          {card.sharedAt ? <Badge tone="green">Shared with family</Badge> : <Badge tone="gold">Not yet shared</Badge>}
          {card.locked ? (
            <Badge tone="red">
              <Lock className="w-3 h-3" aria-hidden />
              Locked
            </Badge>
          ) : (
            <Badge tone="neutral">Locks in about {lockHours}h</Badge>
          )}
        </div>

        {card.locked && isSupervisor && (
          <Alert tone="warning" title="Supervisor edit">
            This card is locked. Your changes are recorded in the edit log with before and after.
          </Alert>
        )}
        {card.locked && !isSupervisor && isOwner && (
          <Alert tone="neutral" title="Locked">
            Lesson cards lock 48 hours after submission. Ask a supervisor if something needs correcting.
          </Alert>
        )}

        <Card>
          <CardHeader
            title="What was covered"
            action={
              canEdit && !editing ? (
                <UiButton size="sm" variant="secondary" onClick={() => setEditing(true)} icon={<Pencil className="w-3.5 h-3.5" aria-hidden />}>
                  Edit
                </UiButton>
              ) : undefined
            }
          />
          <CardBody>
            {editing ? (
              <LessonCardForm
                idPrefix="edit-card"
                initial={{
                  homework: card.homework ?? '',
                  parentNote: card.parentNote ?? '',
                  portions: card.portions.map(portionToDraft),
                }}
                reasonMode={reasonMode}
                pending={update.isPending}
                submitLabel="Save changes"
                onCancel={() => setEditing(false)}
                onSubmit={(r) =>
                  update.mutate(
                    {
                      homework: r.homework ?? '',
                      parentNote: r.parentNote ?? '',
                      portions: r.portions,
                      ...(r.reason ? { reason: r.reason } : {}),
                    },
                    {
                      onSuccess: (res) => {
                        toast.success(res.loggedAsSupervisorEdit ? 'Saved and recorded in the edit log' : 'Lesson card updated');
                        setEditing(false);
                      },
                      onError: (e) => toast.error(e),
                    },
                  )
                }
              />
            ) : (
              <ReadOnlyCard card={card} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Mistakes" description="Logged during the class" />
          <CardBody>
            {card.mistakes.length === 0 ? (
              <EmptyState title="No mistakes recorded" />
            ) : (
              <ul className="divide-y divide-line">
                {card.mistakes.map((m) => (
                  <li key={m.id} className="py-2 flex justify-between gap-3 text-sm">
                    <span className="text-ink">{MISTAKE_TYPE_LABELS[m.type] ?? m.type}{m.tajweedRule ? ` · ${m.tajweedRule}` : ''}</span>
                    <span className="text-xs text-muted shrink-0">{m.surah}:{m.ayah} word {m.wordIndex}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {canSeeLog && <EditLog lessonCardId={card.id} />}
      </div>

      <div className="space-y-6 min-w-0">
        <Card>
          <CardHeader title="Class" />
          <CardBody>
            <dl className="space-y-1.5 text-xs">
              <Row label="Student" value={card.student.displayName} />
              <Row label="Teacher" value={card.teacher.name} />
              <Row label="Started" value={formatDateTime(card.class.startsAt)} />
              <Row label="Layout" value={layoutLabel(card.class.mushafLayout)} />
              <Row label="Recording" value={card.class.recording ? humanize(card.class.recording.status) : 'Not recorded'} />
            </dl>
          </CardBody>
        </Card>
        <AiSummary card={card} canWrite={isOwner} />
      </div>
    </div>
  );
}

function ReadOnlyCard({ card }: { card: LessonCard }) {
  return (
    <div className="space-y-4">
      {card.portions.length === 0 ? (
        <p className="text-xs text-muted">No portions recorded.</p>
      ) : (
        <ul className="space-y-2">
          {card.portions.map((p) => (
            <li key={p.id} className="rounded-xl bg-sand px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">{PORTION_KIND_LABELS[p.kind] ?? p.kind}</p>
                <p className="text-xs text-ink-2">{formatRange(p)}</p>
              </div>
              {p.grade && <Badge tone={p.grade === 'EXCELLENT' || p.grade === 'GOOD' ? 'green' : 'amber'}>{GRADE_LABELS[p.grade as Grade] ?? p.grade}</Badge>}
            </li>
          ))}
        </ul>
      )}
      <div>
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Homework</h4>
        <p className="text-sm text-ink whitespace-pre-wrap mt-1">{card.homework || '—'}</p>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Note for the family</h4>
        <p className="text-sm text-ink whitespace-pre-wrap mt-1">{card.parentNote || '—'}</p>
      </div>
    </div>
  );
}

/** FR-REC-05 — a summary draft never reaches the family until the teacher approves it. */
function AiSummary({ card, canWrite }: { card: LessonCard; canWrite: boolean }) {
  const save = useSaveAiDraft(card.id);
  const approve = useApproveAiDraft(card.id);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(card.aiSummaryDraft ?? '');
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setText(card.aiSummaryDraft ?? '');
    setError(null);
    setEditing(true);
  };

  const doSave = (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    const problem = !value
      ? 'The summary cannot be empty'
      : value.length > AI_DRAFT_MAX
        ? `Keep the summary under ${AI_DRAFT_MAX} characters`
        : null;
    setError(problem);
    if (problem) {
      toast.error(problem);
      return;
    }
    save.mutate(value, {
      onSuccess: () => {
        toast.success('Summary draft saved');
        setEditing(false);
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-gold-600" aria-hidden />
            Family summary
          </span>
        }
        description="Drafted summaries are sent only after you approve them."
      />
      <CardBody className="space-y-3">
        {card.summaryApprovedAt && (
          <p className="text-xs text-green-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" aria-hidden />
            Approved {formatDateTime(card.summaryApprovedAt)}
          </p>
        )}
        {editing ? (
          <form onSubmit={doSave} noValidate className="space-y-3">
            <Field label="Summary draft" htmlFor="ai-draft" error={error} hint={`${text.length}/${AI_DRAFT_MAX}`} required>
              <TextArea id="ai-draft" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!!error} />
            </Field>
            <div className="flex justify-end gap-2">
              <UiButton variant="ghost" onClick={() => setEditing(false)} disabled={save.isPending}>
                Cancel
              </UiButton>
              <UiButton type="submit" loading={save.isPending}>
                Save draft
              </UiButton>
            </div>
          </form>
        ) : card.aiSummaryDraft ? (
          <>
            <p className="text-sm text-ink whitespace-pre-wrap rounded-xl bg-sand px-3 py-2.5">{card.aiSummaryDraft}</p>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <UiButton size="sm" variant="secondary" onClick={startEditing} icon={<Pencil className="w-3.5 h-3.5" aria-hidden />}>
                  Edit
                </UiButton>
                {!card.summaryApprovedAt && (
                  <UiButton
                    size="sm"
                    variant="gold"
                    loading={approve.isPending}
                    onClick={() =>
                      approve.mutate(undefined, {
                        onSuccess: () => toast.success('Summary approved and queued for the family'),
                        onError: (err) => toast.error(err),
                      })
                    }
                  >
                    Approve &amp; send
                  </UiButton>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-muted">No summary draft exists for this card yet.</p>
            {canWrite && (
              <UiButton size="sm" variant="secondary" onClick={startEditing} icon={<Pencil className="w-3.5 h-3.5" aria-hidden />}>
                Write a summary
              </UiButton>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function describeSnapshot(s: LessonEditLogEntry['before']): string {
  if (!s) return '—';
  const portions = (s.portions ?? [])
    .map((p) => `${PORTION_KIND_LABELS[p.kind]?.split(' ')[0] ?? p.kind} ${formatRange(p)}${p.grade ? ` (${GRADE_LABELS[p.grade as Grade] ?? p.grade})` : ''}`)
    .join('; ');
  return [portions && `Portions: ${portions}`, `Homework: ${s.homework || '—'}`, `Note: ${s.parentNote || '—'}`]
    .filter(Boolean)
    .join('\n');
}

function EditLog({ lessonCardId }: { lessonCardId: string }) {
  const log = useLessonCardEditLog(lessonCardId);
  return (
    <Card>
      <CardHeader title="Edit log" description="Changes made after the 48-hour lock, with before and after." />
      <CardBody>
        <QueryState query={log} empty={<EmptyState title="No logged edits" description="Edits after the lock appear here." />}>
          {(rows) => (
            <ol className="space-y-4">
              {rows.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-line p-3 space-y-2">
                  <p className="text-sm text-ink">
                    <span className="font-semibold">{entry.editor.name}</span>{' '}
                    <span className="text-muted text-xs">· {formatDateTime(entry.editedAt)}</span>
                  </p>
                  {entry.reason && <p className="text-xs text-ink-2">Reason: {entry.reason}</p>}
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div>
                      <p className="text-[11px] font-semibold text-muted uppercase">Before</p>
                      <p className="text-xs text-ink-2 whitespace-pre-wrap">{describeSnapshot(entry.before)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-muted uppercase">After</p>
                      <p className="text-xs text-ink-2 whitespace-pre-wrap">{describeSnapshot(entry.after)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink text-right">{value}</dd>
    </div>
  );
}
