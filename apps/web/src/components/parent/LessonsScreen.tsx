'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { FilterBar, FilterSelect } from '@/components/ui/FilterSelect';
import {
  Badge,
  Column,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  QueryState,
  TextInput,
  formatDate,
  humanize,
} from '@/components/ui/primitives';
import { useFamilyDetail } from '@/hooks/useFamily';
import { useLessonCardsForStudents } from '@/hooks/useParentProgress';
import { formatPortionRange, LessonCardListItem } from '@/lib/api/modules/lessons-read';
import { FamilyStudentSummary } from '@/lib/api/modules/families';
import { FamilySwitcher, WithActiveFamily } from './shared';
import { Onboarding } from './Onboarding';
import { LessonCardModal } from './ChildLessons';

/** A lesson card with the child it belongs to (the list endpoint is per child). */
export interface FamilyLessonRow {
  card: LessonCardListItem;
  studentId: string;
  childName: string;
  /** Class date when the API sends it, else when the card was shared. */
  date: string | null;
}

export function lessonRows(
  students: Array<Pick<FamilyStudentSummary, 'id' | 'displayName'>>,
  lists: Array<LessonCardListItem[] | undefined>,
): FamilyLessonRow[] {
  const rows = students.flatMap((s, i) =>
    (lists[i] ?? []).map((card) => ({
      card,
      studentId: s.id,
      childName: s.displayName,
      date: card.class?.startsAt ?? card.sharedAt ?? card.submittedAt,
    })),
  );
  return rows.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
}

export interface LessonFilters {
  child: string;
  course: string;
  from: string;
  to: string;
}

/** `from` / `to` are `YYYY-MM-DD`, compared with the row's local calendar date. */
export function filterLessons(rows: FamilyLessonRow[], f: LessonFilters): FamilyLessonRow[] {
  return rows.filter((r) => {
    if (f.child !== 'all' && r.studentId !== f.child) return false;
    if (f.course !== 'all' && (r.card.class?.course?.id ?? 'none') !== f.course) return false;
    const day = r.date ? localDay(r.date) : '';
    if (f.from && (!day || day < f.from)) return false;
    if (f.to && (!day || day > f.to)) return false;
    return true;
  });
}

function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `/parent/lessons` — every shared lesson card across the family's children. */
export function LessonsScreen() {
  return (
    <WithActiveFamily onNoFamily={<Onboarding familyId={null} membership={null} />}>
      {({ familyId }) => <FamilyLessons key={familyId} familyId={familyId} />}
    </WithActiveFamily>
  );
}

function FamilyLessons({ familyId }: { familyId: string }) {
  const family = useFamilyDetail(familyId);
  return (
    <>
      <PageHeader
        eyebrow="Family portal"
        title="Lessons"
        description="Lesson cards the teachers have shared after each class: what was covered, homework and notes."
        actions={<FamilySwitcher />}
      />
      <QueryState query={family} loadingLabel="Loading lessons…">
        {(f) => <LessonsTable students={f.students} />}
      </QueryState>
    </>
  );
}

function LessonsTable({ students }: { students: FamilyStudentSummary[] }) {
  const ids = useMemo(() => students.map((s) => s.id), [students]);
  const queries = useLessonCardsForStudents(ids);
  const [filters, setFilters] = useState<LessonFilters>({
    child: 'all',
    course: 'all',
    from: '',
    to: '',
  });
  const set = <K extends keyof LessonFilters>(key: K, value: LessonFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const [openId, setOpenId] = useState<string | null>(null);

  const loading = queries.some((q) => q.isLoading);
  const failed = queries.find((q) => q.isError);
  const rows = lessonRows(
    students,
    queries.map((q) => q.data),
  );
  const courses = new Map<string, string>();
  for (const r of rows)
    courses.set(
      r.card.class?.course?.id ?? 'none',
      r.card.class?.course?.name ?? 'Course not recorded',
    );
  const shown = filterLessons(rows, filters);
  const rangeError =
    filters.from && filters.to && filters.from > filters.to ? '“From” must be before “To”.' : null;

  const columns: Column<FamilyLessonRow>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (r) => (
        // The row opens on click; this button is the keyboard way to the same card.
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            setOpenId(r.card.id);
          }}
          className="font-semibold text-ink text-left whitespace-nowrap hover:underline cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          {formatDate(r.date)}
        </button>
      ),
      sortValue: (r) => new Date(r.date ?? 0).getTime(),
    },
    { key: 'child', header: 'Child', render: (r) => r.childName },
    { key: 'course', header: 'Course', render: (r) => r.card.class?.course?.name ?? '—' },
    { key: 'teacher', header: 'Teacher', render: (r) => r.card.teacher.name },
    {
      key: 'covered',
      header: 'Covered',
      sortable: false,
      render: (r) =>
        r.card.portions.length === 0 ? (
          <span className="text-xs text-muted">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {r.card.portions.map((p, i) => (
              <Badge
                key={i}
                tone={
                  p.grade === 'EXCELLENT' || p.grade === 'GOOD'
                    ? 'green'
                    : p.grade
                      ? 'amber'
                      : 'neutral'
                }
              >
                {p.label && p.kind === 'OTHER'
                  ? p.label
                  : `${humanize(p.kind)} ${formatPortionRange(p)}`}
              </Badge>
            ))}
          </span>
        ),
    },
    {
      key: 'homework',
      header: 'Homework',
      sortable: false,
      render: (r) => (
        <span className="text-xs text-ink-2 line-clamp-2 max-w-xs">{r.card.homework ?? '—'}</span>
      ),
    },
  ];

  return (
    <>
        {loading ? (
          <LoadingState label="Loading lesson cards…" />
        ) : failed ? (
          <ErrorState error={failed.error} onRetry={() => queries.forEach((q) => q.refetch())} />
        ) : rows.length === 0 ? (
          <EmptyState
            className="rounded-xl border border-line bg-white"
            title="No lesson cards yet"
            description="After each class the teacher shares a lesson card with homework and notes."
            action={
              <Link
                href="/parent/timetable"
                className="text-sm font-semibold text-green-700 hover:underline"
              >
                See the timetable
              </Link>
            }
          />
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted">Newest first. Select a row to read the whole card.</p>
            <FilterBar>
              {students.length > 1 && (
                <FilterSelect
                  id="lessons-child"
                  label="Child"
                  value={filters.child}
                  onChange={(v) => set('child', v)}
                  options={[
                    { value: 'all', label: 'All children' },
                    ...students.map((s) => ({ value: s.id, label: s.displayName })),
                  ]}
                />
              )}
              <FilterSelect
                id="lessons-course"
                label="Course"
                value={filters.course}
                onChange={(v) => set('course', v)}
                options={[
                  { value: 'all', label: 'All courses' },
                  ...[...courses].map(([value, label]) => ({ value, label })),
                ]}
              />
              <div className="w-full sm:w-40">
                <label
                  htmlFor="lessons-from"
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted"
                >
                  From
                </label>
                <TextInput
                  id="lessons-from"
                  type="date"
                  value={filters.from}
                  onChange={(e) => set('from', e.target.value)}
                />
              </div>
              <div className="w-full sm:w-40">
                <label
                  htmlFor="lessons-to"
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted"
                >
                  To
                </label>
                <TextInput
                  id="lessons-to"
                  type="date"
                  value={filters.to}
                  onChange={(e) => set('to', e.target.value)}
                  aria-invalid={Boolean(rangeError)}
                />
              </div>
            </FilterBar>
            {rangeError && <p className="text-xs text-red">{rangeError}</p>}
            <DataTable<FamilyLessonRow>
              rows={shown}
              rowKey={(r) => r.card.id}
              columns={columns}
              onRowClick={(r) => setOpenId(r.card.id)}
              pageSize={20}
              empty={
                <EmptyState
                  title="No lesson cards match"
                  description="Try another child, course or dates."
                />
              }
            />
          </div>
        )}
      <LessonCardModal lessonCardId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
