'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, ClipboardList } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  LoadingState,
  ErrorState,
  Modal,
  PageHeader,
  QueryState,
  StatusBadge,
  TextInput,
  UiButton,
  formatDate,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { ChildMistakes } from '@/components/parent/ChildLessons';
import { useTeacherEnrolments, useTeacherIdentity } from '@/hooks/useTeacher';
import { HifzPageMap } from '@/components/hifz/HifzPageMap';
import {
  useSetTeacherLessonPosition,
  useTeacherLessonCard,
  useTeacherNextLesson,
  useTeacherStudentLessonCards,
} from '@/hooks/useTeacherStudents';
import { formatPortionRange, LessonPortion, TeacherEnrolment } from '@/lib/api/modules/enrolments-teacher';

/** `/teacher/students/[studentId]` — enrolments, next lesson, lesson position and lesson card history. */
export function StudentDetailScreen({ studentId }: { studentId: string }) {
  const { userId } = useTeacherIdentity();
  const enrolments = useTeacherEnrolments(userId, studentId);
  const cards = useTeacherStudentLessonCards(studentId);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const name = enrolments.data?.[0]?.student.displayName ?? cards.data?.[0]?.student.displayName;

  return (
    <>
      <Link href="/teacher/students" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink mb-3">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Students
      </Link>
      <PageHeader title={name ?? 'Student'} description="Lesson plan position, lesson cards and mistake history." />

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6 items-start">
        <section aria-labelledby="enrolments-heading" className="space-y-4">
          <h2 id="enrolments-heading" className="sr-only">Enrolments</h2>
          <QueryState
            query={{ ...enrolments, isLoading: !userId || enrolments.isLoading }}
            loadingLabel="Loading enrolments…"
            empty={
              <Card>
                <EmptyState title="Not one of your students" description="You have no enrolment with this student, so their lesson plan is not shown." />
              </Card>
            }
          >
            {(rows) => (
              <>
                {rows.map((e) => (
                  <EnrolmentCard key={e.id} enrolment={e} />
                ))}
              </>
            )}
          </QueryState>
        </section>

        <Card>
          <CardHeader
            title="Lesson cards"
            description="Cards that have been shared with the family, newest first."
          />
          <CardBody>
            <QueryState
              query={cards}
              loadingLabel="Loading lesson cards…"
              empty={<EmptyState icon={<ClipboardList className="w-5 h-5" aria-hidden />} title="No shared lesson cards yet" />}
            >
              {(list) => (
                <ul className="divide-y divide-line/60">
                  {list.map((card) => (
                    <li key={card.id} className="py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <p className="text-sm font-semibold text-ink">{formatDate(card.submittedAt)}</p>
                        <p className="text-[11px] text-muted">by {card.teacher.name}</p>
                        <PortionBadges portions={card.portions} />
                        {card.homework && <p className="text-xs text-ink-2 line-clamp-2">Homework: {card.homework}</p>}
                      </div>
                      <UiButton variant="secondary" size="sm" onClick={() => setOpenCard(card.id)} aria-label={`Open lesson card from ${formatDate(card.submittedAt)}`}>
                        Open
                      </UiButton>
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </CardBody>
        </Card>
      </div>

      {/* Hifz page map (`GET /hifz/students/:id/pages`); the teacher may set it up. */}
      <div className="mt-6">
        <HifzPageMap studentId={studentId} canInitialize />
      </div>

      {/* Full history across classes (`GET /students/:id/mistakes`), filterable by type and date. */}
      <Card className="mt-6">
        <CardHeader title="Mistake history" description="Every mistake marked in class, newest first. Use it to plan revision." />
        <CardBody>
          <ChildMistakes studentId={studentId} />
        </CardBody>
      </Card>

      {openCard && <LessonCardModal id={openCard} onClose={() => setOpenCard(null)} />}
    </>
  );
}

function PortionBadges({ portions }: { portions: Array<Omit<LessonPortion, 'id'>> }) {
  if (portions.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {portions.map((p, i) => (
        <li key={i}>
          <Badge>
            {humanize(p.kind)} {formatPortionRange(p)}
            {p.grade && <span className="text-muted">· {humanize(p.grade)}</span>}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function EnrolmentCard({ enrolment }: { enrolment: TeacherEnrolment }) {
  const next = useTeacherNextLesson(enrolment.id);
  return (
    <Card>
      <CardHeader
        title={enrolment.course.name}
        description={`${enrolment.currentLevel?.name ?? 'No level'} · started ${formatDate(enrolment.startedAt)}`}
        action={<StatusBadge status={enrolment.status} />}
      />
      <CardBody className="space-y-4">
        {enrolment.pausedUntil && <Alert tone="warning">Paused until {formatDate(enrolment.pausedUntil)}.</Alert>}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted font-sans mb-2">Next lesson</h3>
          {next.isLoading ? (
            <LoadingState className="py-4" />
          ) : next.isError ? (
            <ErrorState error={next.error} onRetry={() => next.refetch()} className="py-4" />
          ) : next.data?.lesson ? (
            <div className="rounded-xl bg-sand p-3 space-y-1.5">
              <p className="text-sm font-semibold text-ink flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-gold-600" aria-hidden />
                {next.data.lesson.title}
              </p>
              <p className="text-[11px] text-muted">
                {next.data.level?.name ?? 'Level'} · lesson {next.data.lesson.position}
              </p>
              <StringList value={next.data.lesson.objectives} label="Objectives" />
              <MaterialsList value={next.data.lesson.materials} />
              {next.data.lesson.teacherNotes && <p className="text-xs text-ink-2">Notes: {next.data.lesson.teacherNotes}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted">No lesson plan entry at position {enrolment.currentLessonPosition}.</p>
          )}
        </div>
        <LessonPositionForm
          enrolmentId={enrolment.id}
          current={enrolment.currentLessonPosition}
          suggested={next.data?.suggestedAdvance ?? null}
        />
      </CardBody>
    </Card>
  );
}

function StringList({ value, label }: { value: unknown; label: string }) {
  const items = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-ink-2">{label}</p>
      <ul className="list-disc pl-4 text-xs text-ink-2">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function MaterialsList({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return <StringList value={value} label="Materials" />;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === 'string' || typeof v === 'number');
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-ink-2">Materials</p>
      <ul className="text-xs text-ink-2">
        {entries.map(([k, v]) => (
          <li key={k}>
            {humanize(k)}: {String(v)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LessonPositionForm({
  enrolmentId,
  current,
  suggested,
}: {
  enrolmentId: string;
  current: number;
  suggested: number | null;
}) {
  const toast = useToast();
  const mutation = useSetTeacherLessonPosition();
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState<string | null>(null);
  const inputId = `position-${enrolmentId}`;

  const save = (position: number) => {
    if (!Number.isInteger(position) || position < 1) {
      const problem = 'Lesson position must be a whole number of 1 or more.';
      setError(problem);
      toast.error(problem);
      return;
    }
    setError(null);
    mutation.mutate(
      { enrolmentId, position },
      {
        onSuccess: (result) => {
          setValue(String(result.currentLessonPosition));
          toast.success(
            result.currentLessonPosition === position
              ? `Lesson position set to ${position}.`
              : `Lesson position set to ${result.currentLessonPosition} (the furthest the plan allows).`,
          );
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save(Number(value));
      }}
      className="flex flex-wrap items-end gap-2 pt-3 border-t border-line"
    >
      <Field label="Lesson position" htmlFor={inputId} error={error} className="w-32">
        <TextInput
          id={inputId}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={Boolean(error)}
        />
      </Field>
      <UiButton type="submit" variant="secondary" loading={mutation.isPending} disabled={Number(value) === current}>
        Update
      </UiButton>
      {suggested !== null && suggested !== current && (
        <UiButton variant="primary" onClick={() => save(suggested)} disabled={mutation.isPending}>
          Advance to {suggested}
        </UiButton>
      )}
    </form>
  );
}

function LessonCardModal({ id, onClose }: { id: string; onClose: () => void }) {
  const card = useTeacherLessonCard(id);
  return (
    <Modal open onClose={onClose} size="lg" title="Lesson card" description={card.data ? formatDateTime(card.data.class?.startsAt ?? card.data.submittedAt) : undefined}>
      <QueryState query={card} isEmpty={() => false}>
        {(c) => (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              {c.locked ? <Badge tone="neutral">Locked</Badge> : <Badge tone="gold">Editable</Badge>}
              {c.sharedAt && <Badge tone="green">Shared {formatDate(c.sharedAt)}</Badge>}
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted font-sans mb-1.5">Portions</h3>
              {c.portions.length ? <PortionBadges portions={c.portions} /> : <p className="text-muted">None recorded.</p>}
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted font-sans mb-1.5">Mistakes</h3>
              {c.mistakes.length === 0 ? (
                <p className="text-muted">No mistakes marked.</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {c.mistakes.map((m) => (
                    <li key={m.id} className="py-1.5 flex justify-between gap-3">
                      <span className="text-ink">{humanize(m.type)}{m.tajweedRule ? ` · ${humanize(m.tajweedRule)}` : ''}</span>
                      <span className="text-xs text-muted tabular-nums">
                        {m.surah}:{m.ayah}
                        {m.wordIndex != null ? ` · word ${m.wordIndex}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {c.homework && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted font-sans mb-1">Homework</h3>
                <p className="text-ink-2 whitespace-pre-line">{c.homework}</p>
              </div>
            )}
            {c.parentNote && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted font-sans mb-1">Note to parent</h3>
                <p className="text-ink-2 whitespace-pre-line">{c.parentNote}</p>
              </div>
            )}
            {c.aiSummaryDraft && (
              <Alert tone={c.summaryApprovedAt ? 'success' : 'warning'} title={c.summaryApprovedAt ? 'Summary (approved)' : 'AI summary draft (not approved)'}>
                <span className="whitespace-pre-line">{c.aiSummaryDraft}</span>
              </Alert>
            )}
          </div>
        )}
      </QueryState>
    </Modal>
  );
}
