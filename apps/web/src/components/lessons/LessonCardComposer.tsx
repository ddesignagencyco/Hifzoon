'use client';

import React from 'react';
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
  portionToDraft,
} from '@/lib/api/modules/lessons';
import { LessonCardForm } from './LessonCardForm';

function initialDraft(prefill: LessonCardPrefill): LessonCardDraft {
  return {
    homework: '',
    parentNote: '',
    portions: prefill.portions.length > 0 ? prefill.portions.map(portionToDraft) : [emptyPortion('SABAQ')],
  };
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
  const prefill = useLessonCardPrefill(classId);
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
          <CardHeader title="Card" description={data.portions.length > 0 ? 'Sabaq proposed from the mistakes you marked — confirm or correct it.' : undefined} />
          <CardBody>
            {data.students.length === 0 ? (
              <Alert tone="warning" title="No students in this class">A lesson card needs a student to be written for.</Alert>
            ) : (
              <LessonCardForm
                initial={initialDraft(data)}
                pending={submit.isPending}
                submitLabel="Submit lesson card"
                onSubmit={(body) =>
                  submit.mutate(body, {
                    onSuccess: (card) => {
                      toast.success('Lesson card submitted — the family will be notified');
                      router.push(`/teacher/lesson-cards/${encodeURIComponent(card.id)}`);
                    },
                    onError: (e) => toast.error(e),
                  })
                }
              />
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
                          {m.surah}:{m.ayah} word {m.wordIndex} — {MISTAKE_TYPE_LABELS[m.type] ?? m.type}
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
