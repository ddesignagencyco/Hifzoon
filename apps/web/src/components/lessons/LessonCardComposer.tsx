'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  LoadingState,
  PageHeader,
  formatDateTime,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useLessonCardPrefill, useSubmitLessonCard } from '@/hooks/useLessonCards';
import { ApiClientError } from '@/lib/api/http';
import { layoutLabel } from '@/lib/api/modules/mushaf';
import {
  LessonCardDraft,
  LessonCardPrefill,
  MISTAKE_TYPE_LABELS,
  emptyPortion,
  lessonCardSubmittableAt,
  mistakeWhere,
  portionToDraft,
} from '@/lib/api/modules/lessons';
import { DuaCategory, useDuaCollection } from '@/lib/api/modules/duas';
import { boardForCourse, boardLessonTitle } from '@/lib/data/lesson-boards';
import { LessonCardForm } from './LessonCardForm';
import { useAssignPractice } from '@/hooks/usePractice';
import type { AssignPracticeInput } from '@/lib/api/modules/practice';
import {
  LessonCardPractice,
  PracticeDraft,
  initialPracticeDraft,
  practicePayload,
} from './LessonCardPractice';

/**
 * Titles of the Qaida/Duas board lessons the class went through, in the order shown. Taken from
 * the prefilled portions' labels, so the intro, the homework and the portion list always agree;
 * the coverage is only a fallback for an API that sends no labels.
 */
function boardLessonTitles(prefill: LessonCardPrefill, duas: DuaCategory[] | undefined): string[] {
  const labels = prefill.portions.map((p) => p.label).filter((t): t is string => Boolean(t));
  if (labels.length) return labels;
  return (prefill.coverage?.lessons ?? [])
    .map((l) => boardLessonTitle(l.board, l.lesson, duas))
    .filter((t): t is string => Boolean(t));
}

function rangeText(p: LessonCardPrefill['portions'][number]): string | null {
  if (!p.fromSurah || !p.fromAyah) return null;
  if (!p.toSurah || !p.toAyah) return `Surah ${p.fromSurah}:${p.fromAyah}`;
  return p.fromSurah === p.toSurah
    ? `Surah ${p.fromSurah}:${p.fromAyah}–${p.toAyah}`
    : `Surah ${p.fromSurah}:${p.fromAyah} – ${p.toSurah}:${p.toAyah}`;
}

/**
 * The card starts from what the class did: the portions the API worked out from the pages,
 * highlights and mistakes, and homework to revise today's lesson. The teacher edits it.
 */
function initialDraft(
  prefill: LessonCardPrefill,
  duas: DuaCategory[] | undefined,
): LessonCardDraft {
  const board = boardForCourse(prefill.course.type);
  if (board) {
    const titles = boardLessonTitles(prefill, duas);
    return {
      // Chapter titles can hold commas, so the list is split with semicolons.
      homework: titles.length ? `Revise: ${titles.join('; ')}.` : '',
      parentNote: '',
      portions:
        prefill.portions.length > 0
          ? prefill.portions.map(portionToDraft)
          : [emptyPortion('OTHER')],
    };
  }
  const sabaq = prefill.portions.find((p) => p.kind === 'SABAQ');
  const sabaqText = sabaq ? rangeText(sabaq) : null;
  return {
    homework: sabaqText ? `Revise today's lesson, ${sabaqText}, before the next class.` : '',
    parentNote: '',
    portions:
      prefill.portions.length > 0 ? prefill.portions.map(portionToDraft) : [emptyPortion('SABAQ')],
  };
}

function prefillDescription(
  prefill: LessonCardPrefill,
  duas: DuaCategory[] | undefined,
): string | undefined {
  const titles = boardLessonTitles(prefill, duas);
  if (titles.length)
    return `Filled in from the ${titles.length === 1 ? 'lesson' : `${titles.length} lessons`} shown in class (${titles.join('; ')}). Check them, grade them and confirm.`;
  if (prefill.portions.length > 0) {
    return 'Filled in from the pages, highlights and mistakes of this class, and the last lesson card. Check the ranges, grade them and confirm.';
  }
  return undefined;
}

function existingCardId(error: unknown): string | null {
  if (
    error instanceof ApiClientError &&
    error.status === 409 &&
    error.details &&
    typeof error.details === 'object'
  ) {
    const id = (error.details as { lessonCardId?: unknown }).lessonCardId;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

/**
 * The API refuses a card until 10 minutes before the class ends (`assertClassFinished`), so
 * until then the teacher drafts but the submit waits, with the time it opens. Re-checked on a
 * timer so the button unlocks on its own while the form is open.
 */
function useSubmitBlockedHint(data: LessonCardPrefill | undefined): string | undefined {
  const at = data ? lessonCardSubmittableAt(data) : null;
  const [now, setNow] = useState(() => Date.now());
  const wait = at === null ? 0 : at - now;
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(wait, 60_000));
    return () => clearTimeout(timer);
  }, [wait]);
  if (at === null || wait <= 0) return undefined;
  const time = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `You can submit from ${time} (10 minutes before the class ends). You can fill in the card now and submit it then.`;
}

/** End-of-class lesson card (FR-REC-03/04): prefilled from the class, confirmed by the teacher. */
export function LessonCardComposer({
  classId,
  embedded = false,
  onSubmitted,
  onViewCard,
}: {
  classId: string;
  /** Inside the classroom's modal: no page header or back link, and the submit stays pinned. */
  embedded?: boolean;
  /** Called with the last card submitted (instead of opening its page). */
  onSubmitted?: (card: { id: string }) => void;
  /** Open a submitted card here (instead of navigating to its page). */
  onViewCard?: (lessonCardId: string) => void;
}) {
  // Circle classes: one card per student, chosen here (undefined: the next one to write).
  const [studentId, setStudentId] = useState<string | undefined>(undefined);
  const prefill = useLessonCardPrefill(classId, studentId);
  const submit = useSubmitLessonCard(classId);
  // Duas board lessons are Hisn al-Muslim chapters, which come from the API.
  const isDuas = boardForCourse(prefill.data?.course.type) === 'DUAS';
  const duaCollection = useDuaCollection(isDuas);
  const duas = duaCollection.data?.categories;
  const toast = useToast();
  const router = useRouter();
  const submitBlockedHint = useSubmitBlockedHint(prefill.data);
  const assignPractice = useAssignPractice();
  // Optional practice set with the card; started again for each student's card.
  const [practice, setPractice] = useState<{ key: string; draft: PracticeDraft } | null>(null);

  const back = (
    <Link
      href={`/teacher/classroom/${encodeURIComponent(classId)}`}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink"
    >
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
      Back to the classroom
    </Link>
  );

  const header = embedded ? null : (
    <PageHeader
      eyebrow="End of class"
      title="Lesson card"
      description="Confirm what was covered. The family is notified once it is submitted, and the card locks 48 hours later."
      actions={back}
    />
  );

  // A cached prefill from an earlier visit may predate lessons opened since: wait for this
  // visit's answer, or the form would keep the old portions under a newer description.
  if (
    prefill.isLoading ||
    (prefill.isFetching && !prefill.isFetchedAfterMount) ||
    (isDuas && duaCollection.isLoading)
  )
    return (
      <>
        {header}
        <LoadingState label="Preparing the lesson card…" />
      </>
    );

  if (prefill.isError) {
    const cardId = existingCardId(prefill.error);
    return (
      <>
        {header}
        {cardId ? (
          <Alert tone="success" title="This lesson card has already been submitted">
            {onViewCard ? (
              <button type="button" onClick={() => onViewCard(cardId)} className="underline font-semibold cursor-pointer">
                Open the submitted card
              </button>
            ) : (
              <Link
                href={`/teacher/lesson-cards/${encodeURIComponent(cardId)}`}
                className="underline font-semibold"
              >
                Open the submitted card
              </Link>
            )}
          </Alert>
        ) : (
          <Card>
            <ErrorState
              error={prefill.error}
              onRetry={() => prefill.refetch()}
              title="Could not prepare the lesson card"
            />
          </Card>
        )}
      </>
    );
  }

  const data = prefill.data;
  if (!data)
    return (
      <>
        {header}
        <LoadingState />
      </>
    );

  const practiceKey = `${data.primaryStudentId ?? 'card'}:${data.portions.map((p) => p.label ?? p.kind).join('|')}`;
  const practiceDraft =
    practice && practice.key === practiceKey ? practice.draft : initialPracticeDraft(data);

  return (
    <>
      {header}
      <div
        className={
          embedded
            ? 'grid gap-4'
            : 'grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start'
        }
      >
        <Card className={embedded ? 'border-0 shadow-none [&>*]:px-0' : undefined}>
          <CardHeader title="Card" description={prefillDescription(data, duas)} />
          <CardBody>
            {data.students.length === 0 ? (
              <Alert tone="warning" title="No students in this class">
                A lesson card needs a student to be written for.
              </Alert>
            ) : (
              <>
                {data.students.length > 1 && (
                  <div
                    className="mb-4 flex flex-wrap items-center gap-2"
                    role="group"
                    aria-label="Whose card"
                  >
                    <span className="text-xs font-semibold text-ink-2">Card for</span>
                    {data.students.map((s) => {
                      const done = Boolean(s.lessonCardId);
                      const active = s.id === data.primaryStudentId;
                      return done && onViewCard ? (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onViewCard(s.lessonCardId as string)}
                          className="inline-flex h-8 items-center rounded-full border border-green-700/30 bg-green-50 px-3 text-xs font-semibold text-green-800 cursor-pointer"
                        >
                          {s.displayName} ✓
                        </button>
                      ) : done ? (
                        <Link
                          key={s.id}
                          href={`/teacher/lesson-cards/${encodeURIComponent(s.lessonCardId as string)}`}
                          className="inline-flex h-8 items-center rounded-full border border-green-700/30 bg-green-50 px-3 text-xs font-semibold text-green-800"
                        >
                          {s.displayName} ✓
                        </Link>
                      ) : (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setStudentId(s.id)}
                          className={
                            active
                              ? 'inline-flex h-8 items-center rounded-full bg-green-800 px-3 text-xs font-semibold text-white'
                              : 'inline-flex h-8 items-center rounded-full border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-sand'
                          }
                        >
                          {s.displayName}
                        </button>
                      );
                    })}
                  </div>
                )}
                <LessonCardForm
                  key={`${data.primaryStudentId ?? 'card'}:${data.portions.map((p) => p.label ?? p.kind).join('|')}`}
                  initial={initialDraft(data, duas)}
                  showQuranRange={!boardForCourse(data.course.type)}
                  pending={submit.isPending}
                  submitBlockedHint={submitBlockedHint}
                  stickyActions={embedded}
                  extra={
                    <LessonCardPractice
                      prefill={data}
                      value={practiceDraft}
                      onChange={(draft) => setPractice({ key: practiceKey, draft })}
                    />
                  }
                  submitLabel={
                    data.students.length > 1
                      ? `Submit ${data.students.find((s) => s.id === data.primaryStudentId)?.displayName ?? 'this'}'s card`
                      : 'Submit lesson card'
                  }
                  onSubmit={(body) => {
                    const practiceToSet = practicePayload(practiceDraft, data, data.primaryStudentId);
                    if (practiceToSet && 'error' in practiceToSet) {
                      toast.error(practiceToSet.error);
                      return;
                    }
                    submit.mutate(
                      {
                        ...body,
                        ...(data.primaryStudentId ? { studentId: data.primaryStudentId } : {}),
                      },
                      {
                        onSuccess: async (card) => {
                          const remaining = data.students.filter(
                            (s) => !s.lessonCardId && s.id !== data.primaryStudentId,
                          );
                          toast.success('Lesson card submitted — the family will be notified');
                          if (practiceToSet) {
                            // The card is in; a refused practice is reported, never a lost card.
                            // Board bodies carry board/boardLesson/label (the practice module's board fields).
                            await assignPractice
                              .mutateAsync(practiceToSet.body as AssignPracticeInput)
                              .then(
                                () => toast.success('Practice set before the next class'),
                                (e) => toast.error(`The card was submitted, but the practice was not set: ${e instanceof Error ? e.message : String(e)}`),
                              );
                          }
                          // A circle class: go straight on to the next child's card.
                          if (remaining.length > 0) {
                            setStudentId(remaining[0].id);
                            return;
                          }
                          if (onSubmitted) onSubmitted(card);
                          else router.push(`/teacher/lesson-cards/${encodeURIComponent(card.id)}`);
                        },
                        onError: (e) => toast.error(e),
                      },
                    );
                  }}
                />
              </>
            )}
          </CardBody>
        </Card>

        <Card className={embedded ? 'order-first bg-cream shadow-none' : undefined}>
          <CardHeader title="From the class" />
          <CardBody className="space-y-4 text-sm">
            <dl className="space-y-1.5 text-xs">
              <Row label="Course" value={data.course.name} />
              <Row label="Teacher" value={data.teacherName} />
              <Row label="Class" value={formatDateTime(data.classStartedAt)} />
              {/* Qaida and Duas classes read from a board, not the Mushaf. */}
              {!boardForCourse(data.course.type) && (
                <>
                  <Row label="Layout" value={layoutLabel(data.mushafLayout)} />
                  <Row
                    label="Last page shown"
                    value={data.pagesShown ? String(data.pagesShown.lastPage) : 'None recorded'}
                  />
                </>
              )}
            </dl>
            {data.students.map((s) => {
              const minutes = data.attendance.find((a) => a.studentId === s.id)?.minutesPresent;
              return (
                <div key={s.id} className="rounded-xl bg-sand px-3 py-2.5">
                  <p className="text-sm font-semibold text-ink">{s.displayName}</p>
                  <p className="text-[11px] text-muted">
                    {minutes === undefined
                      ? 'No attendance recorded'
                      : `${minutes} minutes present`}{' '}
                    · {s.mistakes.length} mistake{s.mistakes.length === 1 ? '' : 's'}
                  </p>
                  {s.mistakes.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {s.mistakes.map((m) => (
                        <li key={m.id} className="text-[11px] text-ink-2">
                          {mistakeWhere(m)} — {MISTAKE_TYPE_LABELS[m.type] ?? m.type}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {data.students.length > 1 && (
              <p className="text-[11px] text-muted">
                This card is recorded against {data.students[0].displayName}, the first student in
                the class.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
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
