'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FilePenLine, GraduationCap, Headphones, Sparkles, Sun } from 'lucide-react';
import { Card, CardBody, CardHeader, ErrorState, LoadingState, PageHeader, StatTile } from '@/components/ui/primitives';
import { useTeacherIdentity, useTeacherRating } from '@/hooks/useTeacher';
import { useOutstandingLessonCards } from '@/hooks/useLessonCards';
import { usePracticeToReview } from '@/hooks/usePractice';
import { trialsAwaitingResultKey, useTeacherTimetable, useTrialsAwaitingResult } from '@/hooks/useTeacherSchedule';
import { practiceTitle } from '@/lib/api/modules/practice';
import { classStudentNames, lessonCardHref, TimetableClass, trialAsTimetableClass } from '@/lib/api/modules/teacher-schedule';
import { cn } from '@/lib/utils';
import { ClassDetailModal } from './ClassDetailModal';
import { ClassListItem } from './ClassListItem';
import { TeacherIdentityGate } from './TeacherIdentityGate';
import { isTrialResultDue } from './teacher-worklists';
import { addDays, formatInZone, formatPlainDate, plainDateInZone, timeInZone, zonedTimeToUtc } from './zoned-time';

/** Rows per group in "Needs your attention"; the rest are one "View all" away. */
const ATTENTION_ROWS = 3;
/** Classes shown under "Coming up"; the full week is on the timetable. */
const COMING_UP_ROWS = 5;

/** `/teacher` — a compact overview: today's classes, what needs writing up, and the week ahead (FR-TCH-03). */
export function TodayScreen() {
  const identity = useTeacherIdentity();
  const firstName = identity.user?.name?.split(' ').slice(0, 2).join(' ');
  return (
    <>
      <PageHeader
        eyebrow="Teacher portal"
        title={firstName ? `Assalamu alaikum, ${firstName}` : 'Today'}
        description="Today’s classes, what still needs writing up, and the week ahead."
        actions={
          <Link href="/teacher/timetable" className="text-sm font-semibold text-green-700 hover:underline">
            Full timetable
          </Link>
        }
      />
      <TeacherIdentityGate what="your classes">
        {({ teacherId, zone }) => <TodayContent teacherId={teacherId} zone={zone} activeStudents={countActiveStudents(identity.enrolments.data)} />}
      </TeacherIdentityGate>
    </>
  );
}

function countActiveStudents(enrolments: Array<{ status: string; student: { id: string } }> | undefined): number {
  if (!enrolments) return 0;
  return new Set(enrolments.filter((e) => e.status === 'ACTIVE' || e.status === 'TRIAL').map((e) => e.student.id)).size;
}

export function TodayContent({ teacherId, zone, activeStudents }: { teacherId: string; zone: string; activeStudents: number }) {
  const queryClient = useQueryClient();
  const [today] = useState(() => plainDateInZone(new Date(), zone));
  const [range] = useState(() => ({
    from: zonedTimeToUtc(today, '00:00', zone).toISOString(),
    to: zonedTimeToUtc(addDays(today, 8), '00:00', zone).toISOString(),
    tz: zone,
  }));
  const [selected, setSelected] = useState<{ cls: TimetableClass; mode: 'view' | 'result' } | null>(null);
  const timetable = useTeacherTimetable(teacherId, range);
  const rating = useTeacherRating(teacherId);
  const outstanding = useOutstandingLessonCards();
  const trials = useTrialsAwaitingResult();
  const practice = usePracticeToReview();

  const classes = timetable.data ?? [];
  const todays = classes.filter((c) => plainDateInZone(new Date(c.startsAt), zone) === today);
  const upcoming = classes.filter((c) => plainDateInZone(new Date(c.startsAt), zone) !== today);
  const cardsDue = [...(outstanding.data ?? [])].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  const trialsDue = (trials.data ?? []).filter(isTrialResultDue);
  const toReview = practice.data ?? [];
  const needsAttention = cardsDue.length + trialsDue.length + toReview.length > 0;

  const ratingHint = rating.data?.average != null ? `Family rating ${rating.data.average.toFixed(1)} (${rating.data.count})` : undefined;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatLink href="/teacher/timetable" label="Classes today" value={timetable.data ? todays.length : '—'} icon={<Sun className="w-4 h-4" aria-hidden />} />
        <StatLink
          href="/teacher/lesson-cards?status=due"
          label="Cards due"
          value={outstanding.data ? cardsDue.length : '—'}
          icon={<FilePenLine className="w-4 h-4" aria-hidden />}
        />
        <StatLink
          href="/teacher/trials?status=due"
          label="Trial results due"
          value={trials.data ? trialsDue.length : '—'}
          icon={<Sparkles className="w-4 h-4" aria-hidden />}
        />
        <StatLink
          href="/teacher/practice"
          label="Practice to review"
          value={practice.data ? toReview.length : '—'}
          icon={<Headphones className="w-4 h-4" aria-hidden />}
        />
        <StatLink
          href="/teacher/students"
          label="Active students"
          value={activeStudents}
          hint={ratingHint}
          icon={<GraduationCap className="w-4 h-4" aria-hidden />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        <div className={cn('space-y-6 min-w-0', needsAttention ? 'lg:col-span-2' : 'lg:col-span-3')}>
          <Card>
            <CardHeader
              title="Today’s classes"
              description={`${formatPlainDate(today, { weekday: 'long', day: 'numeric', month: 'long' })} · times in ${zone}`}
            />
            <CardBody>
              <ClassRows
                query={timetable}
                rows={todays}
                zone={zone}
                empty="No classes today."
                onDetails={(cls) => setSelected({ cls, mode: 'view' })}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Coming up"
              description={timetable.data ? `Next 7 days · ${upcoming.length} class${upcoming.length === 1 ? '' : 'es'}` : 'Next 7 days'}
              action={<ViewAll href="/teacher/timetable">Full timetable</ViewAll>}
            />
            <CardBody>
              <ClassRows
                query={timetable}
                rows={upcoming.slice(0, COMING_UP_ROWS)}
                zone={zone}
                showDate
                empty="Nothing scheduled in the next seven days."
                onDetails={(cls) => setSelected({ cls, mode: 'view' })}
              />
              {upcoming.length > COMING_UP_ROWS && (
                <p className="pt-3 text-xs text-muted">
                  {upcoming.length - COMING_UP_ROWS} more this week on the{' '}
                  <Link href="/teacher/timetable" className="font-semibold text-green-700 hover:underline">
                    timetable
                  </Link>
                  .
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        {needsAttention && (
          <Card className="min-w-0">
            <CardHeader title="Needs your attention" description="Write-ups from classes already taught." />
            <CardBody className="space-y-5">
              {cardsDue.length > 0 && (
                <AttentionGroup title="Cards due" count={cardsDue.length} href="/teacher/lesson-cards?status=due">
                  {cardsDue.slice(0, ATTENTION_ROWS).map((row) => (
                    <AttentionRow
                      key={`${row.classId}-${row.student.id}`}
                      title={row.student.displayName}
                      subtitle={`${whenLabel(row.startsAt, zone)} · ${row.course?.name ?? 'Course not set'}`}
                      action={
                        <Link href={lessonCardHref(row.classId)} className={ROW_ACTION} aria-label={`Write lesson card for ${row.student.displayName}`}>
                          Write
                        </Link>
                      }
                    />
                  ))}
                </AttentionGroup>
              )}
              {trialsDue.length > 0 && (
                <AttentionGroup title="Trial results due" count={trialsDue.length} href="/teacher/trials?status=due">
                  {trialsDue.slice(0, ATTENTION_ROWS).map((row) => {
                    const names = classStudentNames(row) || 'No students attached';
                    return (
                      <AttentionRow
                        key={row.id}
                        title={names}
                        subtitle={`${whenLabel(row.startsAt, zone)} · ${row.course?.name ?? 'Evaluation'}`}
                        action={
                          <button
                            type="button"
                            onClick={() => setSelected({ cls: trialAsTimetableClass(row, zone), mode: 'result' })}
                            className={cn(ROW_ACTION, 'cursor-pointer')}
                            aria-label={`Record result for ${names}`}
                          >
                            Record result
                          </button>
                        }
                      />
                    );
                  })}
                </AttentionGroup>
              )}
              {toReview.length > 0 && (
                <AttentionGroup title="Practice to review" count={toReview.length} href="/teacher/practice">
                  {toReview.slice(0, ATTENTION_ROWS).map((row) => (
                    <AttentionRow
                      key={row.id}
                      title={row.assignment.student.displayName}
                      subtitle={`${whenLabel(row.startedAt, zone)} · ${practiceTitle(row.assignment)}`}
                      action={
                        <Link
                          href={`/teacher/practice/${encodeURIComponent(row.id)}`}
                          className={ROW_ACTION}
                          aria-label={`Review practice by ${row.assignment.student.displayName}`}
                        >
                          Review
                        </Link>
                      }
                    />
                  ))}
                </AttentionGroup>
              )}
            </CardBody>
          </Card>
        )}
      </div>

      {selected && (
        <ClassDetailModal
          key={selected.cls.id}
          cls={selected.cls}
          zone={zone}
          initialMode={selected.mode}
          onClose={() => {
            if (selected.mode === 'result') void queryClient.invalidateQueries({ queryKey: trialsAwaitingResultKey });
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

const ROW_ACTION =
  'inline-flex items-center h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap bg-white border border-line text-ink hover:bg-sand ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2';

function whenLabel(instant: string, zone: string): string {
  return `${formatInZone(instant, zone, { weekday: 'short', day: 'numeric', month: 'short' })}, ${timeInZone(instant, zone)}`;
}

/** A stat tile that opens the page behind its number. */
function StatLink({ href, ...tile }: { href: string } & React.ComponentProps<typeof StatTile>) {
  return (
    <Link
      href={href}
      className="block rounded-2xl transition-shadow hover:shadow-md [&>div]:h-full [&>div]:hover:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
    >
      <StatTile {...tile} />
    </Link>
  );
}

function ViewAll({ href, children = 'View all' }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline whitespace-nowrap">
      {children}
      <ArrowRight className="w-3.5 h-3.5" aria-hidden />
    </Link>
  );
}

function ClassRows({
  query,
  rows,
  zone,
  showDate,
  empty,
  onDetails,
}: {
  query: { data: unknown; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  rows: TimetableClass[];
  zone: string;
  showDate?: boolean;
  empty: string;
  onDetails: (cls: TimetableClass) => void;
}) {
  if (query.isLoading) return <LoadingState label="Loading classes…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul>
      {rows.map((c) => (
        <ClassListItem key={c.id} cls={c} zone={zone} showDate={showDate} onDetails={onDetails} />
      ))}
    </ul>
  );
}

function AttentionGroup({ title, count, href, children }: { title: string; count: number; href: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {title} <span className="tabular-nums text-ink">· {count}</span>
        </h4>
        <ViewAll href={href} />
      </div>
      <ul>{children}</ul>
    </section>
  );
}

function AttentionRow({ title, subtitle, action }: { title: string; subtitle: string; action: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2 border-b border-line/60 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink truncate">{title}</p>
        <p className="text-xs text-muted truncate">{subtitle}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}
