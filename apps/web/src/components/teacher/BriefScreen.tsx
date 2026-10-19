'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpenCheck, Repeat2 } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  QueryState,
  formatDate,
  humanize,
} from '@/components/ui/primitives';
import { useTeacherBrief, useTeacherIdentity } from '@/hooks/useTeacher';
import { formatPortionRange } from '@/lib/api/modules/enrolments-teacher';
import { BriefLessonCard, PreClassBrief } from '@/lib/api/modules/teacher';
import { ClassroomLink } from './ClassListItem';
import { formatInZone } from './zoned-time';

/** `/teacher/classes/[classId]/brief` — the pre-class brief (FR-TCH-04). */
export function BriefScreen({ classId }: { classId: string }) {
  const { zone } = useTeacherIdentity();
  const brief = useTeacherBrief(classId);

  return (
    <>
      <Link href="/teacher/timetable" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink mb-3">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Timetable
      </Link>
      <QueryState query={brief} loadingLabel="Preparing your brief…">
        {(data) => <BriefContent brief={data} zone={zone} />}
      </QueryState>
    </>
  );
}

function BriefContent({ brief, zone }: { brief: PreClassBrief; zone: string }) {
  const names = brief.students.map((s) => s.displayName).join(', ') || 'No students attached';
  const nameOf = (studentId: string) => brief.students.find((s) => s.id === studentId)?.displayName ?? 'Student';
  return (
    <>
      <PageHeader
        eyebrow="Pre-class brief"
        title={names}
        description={`${brief.course?.name ?? 'Course not set'} · ${formatInZone(brief.startsAt, zone, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        })} (${zone})`}
        actions={<ClassroomLink classId={brief.classId} className="h-10 px-5 text-sm" />}
      />

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="space-y-6">
          {brief.students.length === 0 ? (
            <Card>
              <EmptyState title="No students on this class" description="The class may have been cancelled, which detaches its students." />
            </Card>
          ) : (
            brief.students.map((s) => (
              <Card key={s.id}>
                <CardHeader
                  title={s.displayName}
                  description={s.currentLevel ? `Level: ${s.currentLevel}` : 'No active enrolment level'}
                  action={
                    <Link href={`/teacher/students/${encodeURIComponent(s.id)}`} className="text-xs font-semibold text-green-700 hover:underline">
                      Student record
                    </Link>
                  }
                />
                <CardBody className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="gold">
                      <BookOpenCheck className="w-3 h-3" aria-hidden />
                      Next lesson position: {s.nextLessonPosition ?? '—'}
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted font-sans mb-2">Last lesson card</h3>
                    {s.lastLessonCard ? (
                      <LessonCardBlock card={s.lastLessonCard} />
                    ) : (
                      <p className="text-sm text-muted">No submitted lesson card yet.</p>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Mistakes to focus on" description="Repeated in the last 30 days" />
            <CardBody>
              {brief.recurringMistakes.length === 0 ? (
                <EmptyState icon={<Repeat2 className="w-5 h-5" aria-hidden />} title="No recurring mistakes" description="Nothing has repeated over the last 30 days." className="py-6" />
              ) : (
                <ul className="divide-y divide-line/60">
                  {brief.recurringMistakes.map((m, i) => (
                    <li key={`${m.studentId}-${m.type}-${m.surah}-${m.ayah}-${i}`} className="py-2 flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="text-ink font-medium">{humanize(m.type)}</p>
                        <p className="text-xs text-muted">
                          Surah {m.surah}, ayah {m.ayah}
                          {brief.students.length > 1 && ` · ${nameOf(m.studentId)}`}
                        </p>
                      </div>
                      <Badge tone={m.occurrences >= 3 ? 'red' : 'amber'}>×{m.occurrences}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent lesson cards" />
            <CardBody>
              {brief.recentLessonCards.length === 0 ? (
                <p className="text-sm text-muted">No submitted lesson cards yet.</p>
              ) : (
                <ul className="space-y-3">
                  {brief.recentLessonCards.map((card) => (
                    <li key={card.id} className="rounded-xl border border-line p-3">
                      {brief.students.length > 1 && <p className="text-xs font-semibold text-ink-2 mb-1">{nameOf(card.studentId)}</p>}
                      <LessonCardBlock card={card} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function LessonCardBlock({ card }: { card: BriefLessonCard }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-muted">Submitted {formatDate(card.submittedAt)}</p>
      {card.portions.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {card.portions.map((p, i) => (
            <li key={i}>
              <Badge tone="neutral">
                {humanize(p.kind)} {formatPortionRange(p)}
                {p.grade && <span className="text-muted">· {humanize(p.grade)}</span>}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {card.homework && (
        <p className="text-ink-2">
          <span className="font-semibold text-ink">Homework:</span> {card.homework}
        </p>
      )}
    </div>
  );
}
