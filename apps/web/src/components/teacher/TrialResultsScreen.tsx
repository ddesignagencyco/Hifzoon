'use client';

import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Badge, Column, DataTable, EmptyState, PageHeader, Pagination, QueryState } from '@/components/ui/primitives';
import { ALL, FilterBar, FilterSelect, optionsFrom } from '@/components/ui/FilterSelect';
import { teacherKeys } from '@/hooks/useTeacher';
import { trialsAwaitingResultKey, useTrialsAwaitingResult } from '@/hooks/useTeacherSchedule';
import { TimetableClass, trialAsTimetableClass } from '@/lib/api/modules/teacher-schedule';
import { cn } from '@/lib/utils';
import { ClassDetailModal } from './ClassDetailModal';
import { ROW_ACTION } from './LessonCardsScreen';
import { TeacherIdentityGate } from './TeacherIdentityGate';
import {
  buildTrialRows,
  DATE_RANGE_OPTIONS,
  DateRangeFilter,
  daysFor,
  inDateRange,
  rowStudentNames,
  TRIAL_STATUS_LABEL,
  TrialRow,
  TrialStatus,
  usePastTeacherClasses,
} from './teacher-worklists';
import { formatInZone, timeInZone } from './zoned-time';

type StatusFilter = typeof ALL | TrialStatus;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: ALL, label: 'All' },
  { value: 'due', label: 'Result due' },
  { value: 'recorded', label: 'Recorded' },
  { value: 'absent', label: 'Teacher absent' },
];

const STATUS_TONE: Record<TrialStatus, 'gold' | 'green' | 'amber'> = {
  due: 'gold',
  recorded: 'green',
  absent: 'amber',
};

export function parseTrialStatus(value: string | null | undefined): StatusFilter {
  return value === 'due' || value === 'recorded' || value === 'absent' ? value : ALL;
}

/** `/teacher/trials` — the free trials you have taught and whether their result is recorded. */
export function TrialResultsScreen({ initialStatus = ALL }: { initialStatus?: StatusFilter }) {
  return (
    <>
      <PageHeader
        eyebrow="Teacher portal"
        title="Trial results"
        description="Free trials you have taught. Record the level and recommended plan soon after each trial so the family can enrol."
      />
      <TeacherIdentityGate what="your trials">
        {({ teacherId, zone }) => <TrialResultsContent teacherId={teacherId} zone={zone} initialStatus={initialStatus} />}
      </TeacherIdentityGate>
    </>
  );
}

export function TrialResultsContent({
  teacherId,
  zone,
  initialStatus = ALL,
}: {
  teacherId: string;
  zone: string;
  initialStatus?: StatusFilter;
}) {
  const queryClient = useQueryClient();
  const [now] = useState(() => Date.now());
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [student, setStudent] = useState<string>(ALL);
  const [course, setCourse] = useState<string>(ALL);
  const [range, setRange] = useState<DateRangeFilter>('ALL');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [open, setOpen] = useState<{ cls: TimetableClass; mode: 'view' | 'result' } | null>(null);

  const awaiting = useTrialsAwaitingResult();
  const classes = usePastTeacherClasses(teacherId, zone, daysFor(range));

  const allRows = useMemo(
    () => (classes.data && awaiting.data ? buildTrialRows(classes.data, awaiting.data, now) : undefined),
    [classes.data, awaiting.data, now],
  );
  const studentOptions = useMemo(
    () =>
      optionsFrom(
        (allRows ?? []).flatMap((r) => r.cls.students.map((s) => s.student)),
        (s) => ({ value: s.id, label: s.displayName }),
        'All',
      ),
    [allRows],
  );
  const courseOptions = useMemo(
    () => optionsFrom(allRows ?? [], (r) => ({ value: courseOf(r), label: courseOf(r) }), 'All'),
    [allRows],
  );
  const rows = useMemo(
    () =>
      (allRows ?? []).filter(
        (r) =>
          (status === ALL || r.status === status) &&
          (student === ALL || r.cls.students.some((s) => s.student.id === student)) &&
          (course === ALL || courseOf(r) === course) &&
          inDateRange(r.cls.startsAt, range, now),
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

  const columns: Column<TrialRow>[] = [
    {
      key: 'when',
      header: 'Date',
      sortable: false,
      className: 'whitespace-nowrap',
      render: (r) => (
        <div>
          <p className="font-medium text-ink">{formatInZone(r.cls.startsAt, zone, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <p className="text-xs text-muted tabular-nums">{timeInZone(r.cls.startsAt, zone)}</p>
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      sortable: false,
      render: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink">{rowStudentNames(r.cls.students.map((s) => s.student))}</p>
          <p className="text-xs text-muted md:hidden">{courseOf(r)}</p>
          <div className="mt-1 sm:hidden"><Badge tone={STATUS_TONE[r.status]}>{TRIAL_STATUS_LABEL[r.status]}</Badge></div>
        </div>
      ),
    },
    { key: 'course', header: 'Course', sortable: false, className: 'hidden md:table-cell', render: (r) => courseOf(r) },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      className: 'hidden sm:table-cell whitespace-nowrap',
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{TRIAL_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'action',
      header: <span className="sr-only">Action</span>,
      sortable: false,
      className: 'text-right',
      render: (r) =>
        r.status === 'due' ? (
          <button
            type="button"
            onClick={() => setOpen({ cls: trialAsTimetableClass(r.cls, zone), mode: 'result' })}
            className={cn(ROW_ACTION, 'bg-gold text-green-950 hover:bg-gold-600 cursor-pointer')}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
            Record result
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen({ cls: trialAsTimetableClass(r.cls, zone), mode: 'view' })}
            className={cn(ROW_ACTION, 'bg-white border border-line text-ink hover:bg-sand cursor-pointer')}
          >
            Details
          </button>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <FilterBar>
        <FilterSelect id="tr-status" label="Status" value={status} options={STATUS_OPTIONS} onChange={reset(setStatus)} />
        <FilterSelect id="tr-student" label="Student" value={student} options={studentOptions} onChange={reset(setStudent)} />
        <FilterSelect id="tr-course" label="Course" value={course} options={courseOptions} onChange={reset(setCourse)} />
        <FilterSelect id="tr-date" label="Date" value={range} options={DATE_RANGE_OPTIONS} onChange={reset(setRange)} />
      </FilterBar>
      <QueryState
        query={{
          data: allRows,
          isLoading: classes.isLoading || awaiting.isLoading,
          isError: classes.isError || awaiting.isError,
          error: classes.error ?? awaiting.error,
          refetch: () => Promise.all([classes.refetch(), awaiting.refetch()]),
        }}
        isEmpty={() => false}
        loadingLabel="Loading trials…"
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
                  title={filtered ? 'No trials match these filters' : 'No trials yet'}
                  description={filtered ? 'Try another status, student or date range.' : 'Free trials you teach appear here once they end.'}
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
              itemName="trials"
            />
          </div>
        )}
      </QueryState>
      {open && (
        <ClassDetailModal
          key={open.cls.id}
          cls={open.cls}
          zone={zone}
          initialMode={open.mode}
          onClose={() => {
            setOpen(null);
            void queryClient.invalidateQueries({ queryKey: trialsAwaitingResultKey });
            void queryClient.invalidateQueries({ queryKey: teacherKeys.timetableRoot });
          }}
        />
      )}
    </div>
  );
}

function courseOf(r: TrialRow): string {
  return r.cls.course?.name ?? 'Evaluation';
}
