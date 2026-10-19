'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, DataTable, EmptyState } from '@/components/ui/primitives';
import { SupervisedTeacher, TeacherRatingSummary, TeacherScorecard } from '@/lib/api/modules/qa';
import { RatingInline, ScoreBadge, TeacherInitial } from './QaWidgets';

export interface TeacherQaRow {
  teacher: SupervisedTeacher;
  rating?: TeacherRatingSummary;
  ratingLoading: boolean;
  scorecard?: TeacherScorecard;
  scorecardLoading: boolean;
  scorecardError: boolean;
}

/** Teachers with their family rating and QA scorecard headline. */
export function TeacherQaTable({ rows, emptyTitle = 'No teachers' }: { rows: TeacherQaRow[]; emptyTitle?: string }) {
  const router = useRouter();
  return (
    <DataTable<TeacherQaRow>
      rows={rows}
      rowKey={(r) => r.teacher.id}
      onRowClick={(r) => router.push(`/supervisor/teachers/${r.teacher.id}`)}
      empty={<EmptyState title={emptyTitle} />}
      columns={[
        {
          key: 'name',
          header: 'Teacher',
          className: 'min-w-[200px]',
          render: (r) => (
            <span className="flex items-center gap-2.5">
              <TeacherInitial name={r.teacher.user.name} />
              <span className="min-w-0">
                <Link
                  href={`/supervisor/teachers/${r.teacher.id}`}
                  className="block font-semibold text-ink hover:underline truncate"
                  onClick={(e) => e.stopPropagation()}
                >
                  {r.teacher.user.name}
                </Link>
                <span className="block text-[11px] text-muted truncate">{r.teacher.subjects.join(', ') || 'No subjects listed'}</span>
              </span>
            </span>
          ),
        },
        {
          key: 'rating',
          header: 'Family rating',
          render: (r) => (r.ratingLoading ? <span className="text-xs text-muted">Loading…</span> : <RatingInline summary={r.rating} />),
        },
        {
          key: 'qa',
          header: 'QA average',
          render: (r) =>
            r.scorecardLoading ? (
              <span className="text-xs text-muted">Loading…</span>
            ) : r.scorecardError ? (
              <span className="text-xs text-red">Unavailable</span>
            ) : (
              <ScoreBadge value={r.scorecard?.overallAverage} />
            ),
        },
        {
          key: 'reviews',
          header: 'Reviews',
          render: (r) => <span className="tabular-nums">{r.scorecard ? r.scorecard.reviewsCount : '—'}</span>,
        },
        {
          key: 'flags',
          header: 'Flags',
          render: (r) => {
            const flagged = r.scorecard?.criteria.filter((c) => c.flag).length ?? 0;
            return flagged > 0 ? <Badge tone="red">{flagged} below 3</Badge> : <span className="text-xs text-muted">—</span>;
          },
        },
        {
          key: 'reply',
          header: 'Awaiting reply',
          render: (r) => <span className="tabular-nums">{r.scorecard ? r.scorecard.awaitingReply : '—'}</span>,
        },
      ]}
    />
  );
}
