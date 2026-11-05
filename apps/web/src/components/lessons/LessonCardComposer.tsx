'use client';

import React, { useState } from 'react';
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
  mistakeWhere,
  portionToDraft,
} from '@/lib/api/modules/lessons';
import { boardForCourse, DUA_LESSONS, QAIDA_LESSONS } from '@/lib/data/lesson-boards';
import { LessonCardForm } from './LessonCardForm';

/** Titles of the Qaida/Duas board lessons the class went through, in the order shown. */
function boardLessonTitles(prefill: LessonCardPrefill): string[] {
  return (prefill.coverage?.lessons ?? [])
    .map((l) => (l.board === 'QAIDA' ? QAIDA_LESSONS : DUA_LESSONS)[l.lesson - 1]?.title)
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
function initialDraft(prefill: LessonCardPrefill): LessonCardDraft {
  const board = boardForCourse(prefill.course.type);
  if (board) {
    const titles = boardLessonTitles(prefill);
    return {
      homework: titles.length ? `Revise: ${titles.join(', ')}.` : '',
      parentNote: '',
      portions: prefill.portions.length > 0 ? prefill.portions.map(portionToDraft) : [emptyPortion('OTHER')],
    };
  }
  const sabaq = prefill.portions.find((p) => p.kind === 'SABAQ');
  const sabaqText = sabaq ? rangeText(sabaq) : null;
  return {
    homework: sabaqText ? `Revise today's lesson, ${sabaqText}, before the next class.` : '',
    parentNote: '',
    portions: prefill.portions.length > 0 ? prefill.portions.map(portionToDraft) : [emptyPortion('SABAQ')],
  };
}

function prefillDescription(prefill: LessonCardPrefill): string | undefined {
  const titles = boardLessonTitles(prefill);
  if (titles.length) return `Filled in from the lessons shown in class (${titles.join(', ')}). Grade them and confirm.`;
  if (prefill.portions.length > 0) {
    return 'Filled in from the pages, highlights and mistakes of this class, and the last lesson card. Check the ranges, grade them and confirm.';
  }
  return undefined;
}

function existingCardId(error: unknown): string | null {
  if (error instanceof ApiClientError && error.status === 409 && error.details && typeof error.details === 'object') {
    const id = (error.details as { lessonCardId?: unknown }).lessonCardId;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

/** End-of-class lesson card (FR-REC-03/04): prefilled from the class, confirmed by the teacher. */
export function LessonCardComposer({ classId }: { classId: string }) {
  // Circle classes: one card per student, chosen here (undefined: the next one to write).
  const [studentId, setStudentId] = useState<string | undefined>(undefined);
  const prefill = useLessonCardPrefill(classId, studentId);
  const submit = useSubmitLessonCard(classId);
  const toast = useToast();
  const router = useRouter();

  const back = (
    <Link href={`/teacher/classroom/${encodeURIComponent(classId)}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink">
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
      Back to the classroom
    </Link>
  );

  const header = (
    <PageHeader
      eyebrow="End of class"
      title="Lesson card"
      description="Confirm what was covered. The family is notified once it is submitted, and the card locks 48 hours later."
      actions={back}
    />
  );

  if (prefill.isLoading) return <>{header}<LoadingState label="Preparing the lesson card…" /></>;

  if (prefill.isError) {
    const cardId = existingCardId(prefill.error);
    return (
      <>
        {header}
        {cardId ? (
          <Alert tone="success" title="This lesson card has already been submitted">
            <Link href={`/teacher/lesson-cards/${encodeURIComponent(cardId)}`} className="underline font-semibold">
              Open the submitted card
            </Link>
          </Alert>
        ) : (
          <Card>
            <ErrorState error={prefill.error} onRetry={() => prefill.refetch()} title="Could not prepare the lesson card" />
          </Card>
        )}
      </>
    );
  }

  const data = prefill.data;
  if (!data) return <>{header}<LoadingState /></>;

  return (
    <>
      {header}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <Card>
          <CardHeader title="Card" description={prefillDescription(data)} />
          <CardBody>
            {data.students.length === 0 ? (
              <Alert tone="warning" title="No students in this class">A lesson card needs a student to be written for.</Alert>
            ) : (
              <>
                {data.students.length > 1 && (
                  <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Whose card">
                    <span className="text-xs font-semibold text-ink-2">Card for</span>
                    {data.students.map((s) => {
                      const done = Boolean(s.lessonCardId);
                      const active = s.id === data.primaryStudentId;
                      return done ? (
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
                  key={data.primaryStudentId ?? 'card'}
                  initial={initialDraft(data)}
                  showQuranRange={!boardForCourse(data.course.type)}
                  pending={submit.isPending}
                  submitLabel={
                    data.students.length > 1
                      ? `Submit ${data.students.find((s) => s.id === data.primaryStudentId)?.displayName ?? 'this'}'s card`
                      : 'Submit lesson card'
                  }
                  onSubmit={(body) =>
                    submit.mutate(
                      { ...body, ...(data.primaryStudentId ? { studentId: data.primaryStudentId } : {}) },
                      {
                        onSuccess: (card) => {
                          const remaining = data.students.filter(
                            (s) => !s.lessonCardId && s.id !== data.primaryStudentId,
                          );
                          toast.success('Lesson card submitted — the family will be notified');
                          // A circle class: go straight on to the next child's card.
                          if (remaining.length > 0) {
                            setStudentId(remaining[0].id);
                            return;
                          }
                          router.push(`/teacher/lesson-cards/${encodeURIComponent(card.id)}`);
                        },
                        onError: (e) => toast.error(e),
                      },
                    )
                  }
                />
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="From the class" />
          <CardBody className="space-y-4 text-sm">
            <dl className="space-y-1.5 text-xs">
              <Row label="Course" value={data.course.name} />
              <Row label="Teacher" value={data.teacherName} />
              <Row label="Class" value={formatDateTime(data.classStartedAt)} />
              <Row label="Layout" value={layoutLabel(data.mushafLayout)} />
              <Row label="Last page shown" value={data.pagesShown ? String(data.pagesShown.lastPage) : 'None recorded'} />
            </dl>
            {data.students.map((s) => {
              const minutes = data.attendance.find((a) => a.studentId === s.id)?.minutesPresent;
              return (
                <div key={s.id} className="rounded-xl bg-sand px-3 py-2.5">
                  <p className="text-sm font-semibold text-ink">{s.displayName}</p>
                  <p className="text-[11px] text-muted">
                    {minutes === undefined ? 'No attendance recorded' : `${minutes} minutes present`} · {s.mistakes.length} mistake{s.mistakes.length === 1 ? '' : 's'}
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
              <p className="text-[11px] text-muted">This card is recorded against {data.students[0].displayName}, the first student in the class.</p>
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
