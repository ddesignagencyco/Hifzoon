'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { FilePenLine } from 'lucide-react';
import { Badge, Column, DataTable, EmptyState, PageHeader, Pagination, QueryState } from '@/components/ui/primitives';
import { ALL, FilterBar, FilterSelect, optionsFrom } from '@/components/ui/FilterSelect';
import { useOutstandingLessonCards } from '@/hooks/useLessonCards';
import { lessonCardHref } from '@/lib/api/modules/teacher-schedule';
import { cn } from '@/lib/utils';
import { TeacherIdentityGate } from './TeacherIdentityGate';
import {
  buildLessonCardRows,
  DATE_RANGE_OPTIONS,
  DateRangeFilter,
  daysFor,
  inDateRange,
  LESSON_CARD_STATUS_LABEL,
  LessonCardRow,
  LessonCardStatus,
  rowStudentNames,
  usePastTeacherClasses,
} from './teacher-worklists';
import { formatInZone, timeInZone } from './zoned-time';

type StatusFilter = typeof ALL | LessonCardStatus;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: ALL, label: 'All' },
  { value: 'due', label: 'Card due' },
  { value: 'written', label: 'Written' },
  { value: 'locked', label: 'Locked' },
];

const STATUS_TONE: Record<LessonCardStatus, 'amber' | 'green' | 'neutral'> = {
  due: 'amber',
  written: 'green',
  locked: 'neutral',
};

/** `?status=due` (as linked from Today) opens the page on that filter. */
export function parseLessonCardStatus(value: string | null | undefined): StatusFilter {
  return value === 'due' || value === 'written' || value === 'locked' ? value : ALL;
}

export const ROW_ACTION =
  'inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2';

/** `/teacher/lesson-cards` — every recent lesson card: still to write, written, or locked. */
export function LessonCardsScreen({ initialStatus = ALL }: { initialStatus?: StatusFilter }) {
  return (
    <>
      <PageHeader
        eyebrow="Teacher portal"
        title="Lesson cards"
        description="The lesson card for each class you have taught. Write each card soon after class; a sent card can be edited for 48 hours, then it locks."
      />
      <TeacherIdentityGate what="your lesson cards">
        {({ teacherId, zone }) => <LessonCardsContent teacherId={teacherId} zone={zone} initialStatus={initialStatus} />}
      </TeacherIdentityGate>
    </>
  );
}

export function LessonCardsContent({
  teacherId,
  zone,
  initialStatus = ALL,
}: {
  teacherId: string;
  zone: string;
  initialStatus?: StatusFilter;
}) {
  const [now] = useState(() => Date.now());
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [student, setStudent] = useState<string>(ALL);
  const [course, setCourse] = useState<string>(ALL);
  const [range, setRange] = useState<DateRangeFilter>('ALL');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const outstanding = useOutstandingLessonCards();
  const classes = usePastTeacherClasses(teacherId, zone, daysFor(range));

  const allRows = useMemo(
    () => (classes.data && outstanding.data ? buildLessonCardRows(classes.data, outstanding.data, now) : undefined),
    [classes.data, outstanding.data, now],
  );
  const studentOptions = useMemo(
    () =>
      optionsFrom(
        (allRows ?? []).flatMap((r) => r.students),
        (s) => ({ value: s.id, label: s.displayName }),
        'All',
      ),
    [allRows],
  );
  const courseOptions = useMemo(
    () => optionsFrom(allRows ?? [], (r) => ({ value: r.courseName, label: r.courseName }), 'All'),
    [allRows],
  );
  const rows = useMemo(
    () =>
      (allRows ?? []).filter(
        (r) =>
          (status === ALL || r.status === status) &&
          (student === ALL || r.students.some((s) => s.id === student)) &&
          (course === ALL || r.courseName === course) &&
          inDateRange(r.startsAt, range, now),
      ),
    [allRows, status, student, course, range, now],
  );

  const pageCount = Math.max(1, Math.ceil(rows.length / limit));
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * limit, current * limit);
  const filtered = status !== ALL || student !== ALL || course !== ALL || range !== 'ALL';

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const columns: Column<LessonCardRow>[] = [
    {
      key: 'when',
      header: 'Date & time',
      sortable: false,
      className: 'whitespace-nowrap',
      render: (r) => (
        <div>
          <p className="font-medium text-ink">{formatInZone(r.startsAt, zone, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <p className="text-xs text-muted tabular-nums">{timeInZone(r.startsAt, zone)}</p>
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      sortable: false,
      render: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink">{rowStudentNames(r.students)}</p>
          <p className="text-xs text-muted md:hidden">{r.courseName}</p>
          <div className="mt-1 sm:hidden"><Badge tone={STATUS_TONE[r.status]}>{r.draft ? 'Card draft' : LESSON_CARD_STATUS_LABEL[r.status]}</Badge></div>
        </div>
      ),
    },
    { key: 'course', header: 'Course', sortable: false, className: 'hidden md:table-cell', render: (r) => r.courseName },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      className: 'hidden sm:table-cell whitespace-nowrap',
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.draft ? 'Card draft' : LESSON_CARD_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'action',
      header: <span className="sr-only">Action</span>,
      sortable: false,
      className: 'text-right',
      render: (r) => <LessonCardAction row={r} />,
    },
  ];

  return (
    <div className="space-y-4">
      <FilterBar>
        <FilterSelect id="lc-status" label="Status" value={status} options={STATUS_OPTIONS} onChange={reset(setStatus)} />
        <FilterSelect id="lc-student" label="Student" value={student} options={studentOptions} onChange={reset(setStudent)} />
        <FilterSelect id="lc-course" label="Course" value={course} options={courseOptions} onChange={reset(setCourse)} />
        <FilterSelect id="lc-date" label="Date" value={range} options={DATE_RANGE_OPTIONS} onChange={reset(setRange)} />
      </FilterBar>
      <QueryState
        query={{
          data: allRows,
          isLoading: classes.isLoading || outstanding.isLoading,
          isError: classes.isError || outstanding.isError,
          error: classes.error ?? outstanding.error,
          refetch: () => Promise.all([classes.refetch(), outstanding.refetch()]),
        }}
        isEmpty={() => false}
        loadingLabel="Loading lesson cards…"
      >
        {() => (
          <div className="space-y-3">
            <DataTable
              columns={columns}
              rows={visible}
              rowKey={(r) => r.key}
              paginate={false}
              searchable={false}
              empty={
                <EmptyState
                  title={filtered ? 'No lesson cards match these filters' : 'No lesson cards yet'}
                  description={
                    filtered ? 'Try another status, student or date range.' : 'Cards for the classes you teach appear here once each class ends.'
                  }
                />
              }
            />
            <Pagination
              page={current}
              limit={limit}
              total={rows.length}
              onPageChange={setPage}
              onLimitChange={(n) => {
                setLimit(n);
                setPage(1);
              }}
              itemName="lesson cards"
            />
          </div>
        )}
      </QueryState>
      <p className="text-xs text-muted">
        “All” covers the last 13 months. A card counts as locked 48 hours after its class ended; open it to see its exact lock time.
      </p>
    </div>
  );
}

function LessonCardAction({ row }: { row: LessonCardRow }) {
  const due = row.status === 'due';
  const verb = due ? (row.draft ? 'Finish' : 'Write') : 'Open';
  return (
    <Link
      href={lessonCardHref(row.classId)}
      aria-label={`${verb} lesson card for ${rowStudentNames(row.students)}`}
      className={cn(ROW_ACTION, due ? 'bg-gold text-green-950 hover:bg-gold-600' : 'bg-white border border-line text-ink hover:bg-sand')}
    >
      <FilePenLine className="w-3.5 h-3.5" aria-hidden />
      {verb}
      <span className="hidden sm:inline">&nbsp;lesson card</span>
    </Link>
  );
}
