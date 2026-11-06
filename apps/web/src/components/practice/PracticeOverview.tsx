'use client';

import React, { useMemo, useState } from 'react';
import { ErrorState, LoadingState } from '@/components/ui/primitives';
import { FilterBar, FilterSelect } from '@/components/ui/FilterSelect';
import { usePracticeAssignments } from '@/hooks/usePractice';
import type { PracticeAssignment } from '@/lib/api/modules/practice';
import {
  DEFAULT_FILTERS,
  PracticeList,
  type PracticeFilters,
} from './Practice';
import {
  MistakesTable,
  useOpenMistakes,
  type MistakeStudent,
  type ReaderBase,
} from './MistakesToPractise';

export type PracticeView = 'assigned' | 'mistakes';

/**
 * `/parent/practice` and `/student/practice` (`view="assigned"`): the practice the teachers set,
 * with Child, Status and Due filters. `/parent/mistakes` and `/student/mistakes`
 * (`view="mistakes"`): the open mistakes from class to practise, with the Child filter.
 */
export function PracticeOverview({
  view,
  students,
  studentsLoading = false,
  readerBase,
  practiceHref = () => '#',
  showStudent = false,
}: {
  view: PracticeView;
  /** The children whose practice is shown (one for a student). */
  students: MistakeStudent[];
  studentsLoading?: boolean;
  readerBase: ReaderBase;
  /** Where an assignment row opens (the assigned view). */
  practiceHref?: (a: PracticeAssignment) => string;
  showStudent?: boolean;
}) {
  const [filters, setFilters] = useState<PracticeFilters>(DEFAULT_FILTERS);
  const set = <K extends keyof PracticeFilters>(key: K, value: PracticeFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const list = usePracticeAssignments();
  const [mistakeStatus, setMistakeStatus] = useState<'open' | 'fixed' | 'all'>('all');
  const mistakes = useOpenMistakes(view === 'mistakes' ? students : [], { includeResolved: true });

  // Children from the family and from the assignments, so the filter never loses one.
  const children = useMemo(() => {
    const seen = new Map(students.map((s) => [s.id, s.displayName]));
    for (const a of list.data ?? []) if (!seen.has(a.studentId)) seen.set(a.studentId, a.student.displayName);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [students, list.data]);

  const mistakeRows = mistakes.rows.filter(
    (r) =>
      (filters.child === 'all' || r.studentId === filters.child) &&
      (mistakeStatus === 'all' || (mistakeStatus === 'fixed') === Boolean(r.mistake.resolvedAt)),
  );

  return (
    <div className="space-y-4">
      <FilterBar>
        {children.length > 1 && (
          <FilterSelect
            id="practice-child"
            label="Child"
            value={filters.child}
            onChange={(v) => set('child', v)}
            options={[{ value: 'all', label: 'All children' }, ...children.map(([value, label]) => ({ value, label }))]}
          />
        )}
        {view === 'mistakes' && (
          <FilterSelect<'open' | 'fixed' | 'all'>
            id="mistakes-status"
            label="Status"
            value={mistakeStatus}
            onChange={setMistakeStatus}
            options={[
              { value: 'all', label: 'All' },
              { value: 'open', label: 'To practise' },
              { value: 'fixed', label: 'Fixed' },
            ]}
          />
        )}
        {view === 'assigned' && (
          <>
            <FilterSelect<PracticeFilters['status']>
              id="practice-status"
              label="Status"
              value={filters.status}
              onChange={(v) => set('status', v)}
              options={[
                { value: 'all', label: 'Any status' },
                { value: 'active', label: 'Still to do' },
                { value: 'waiting', label: 'Waiting for teacher' },
                { value: 'reviewed', label: 'Reviewed' },
                { value: 'COMPLETED', label: 'Done' },
                { value: 'overdue', label: 'Overdue' },
              ]}
            />
            <FilterSelect<PracticeFilters['due']>
              id="practice-due-filter"
              label="Due"
              value={filters.due}
              onChange={(v) => set('due', v)}
              options={[
                { value: 'any', label: 'Any time' },
                { value: 'week', label: 'Within a week' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'none', label: 'No due date' },
              ]}
            />
          </>
        )}
      </FilterBar>
      {view === 'assigned' ? (
        <PracticeList showStudent={showStudent} filterState={filters} practiceHref={practiceHref} />
      ) : studentsLoading || mistakes.isLoading ? (
        <LoadingState label="Loading mistakes…" />
      ) : mistakes.error ? (
        <ErrorState error={mistakes.error} onRetry={mistakes.refetch} />
      ) : (
        <MistakesTable rows={mistakeRows} readerBase={readerBase} showChild={children.length > 1} />
      )}
    </div>
  );
}
