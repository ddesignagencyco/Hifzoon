'use client';

import React from 'react';
import Link from 'next/link';
import { BadgeCheck, ClipboardCheck, Shuffle, ShieldAlert } from 'lucide-react';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  QueryState,
  StatTile,
} from '@/components/ui/primitives';
import { SupervisorRoleGate } from '@/components/qa/SupervisorRoleGate';
import { TeacherQaTable } from '@/components/qa/TeacherQaTable';
import { LinkButton } from '@/components/qa/QaWidgets';
import { useTeacherQaRows } from '@/components/qa/useTeacherQaRows';
import { useSupervisedTeachers } from '@/hooks/useQa';
import { useCases, useNow } from '@/hooks/useCases';
import { isCaseOverdue } from '@/lib/api/modules/cases';

const WINDOW_MONTHS = 3;

export default function SupervisorOverviewPage() {
  return (
    <SupervisorRoleGate>
      <Overview />
    </SupervisorRoleGate>
  );
}

function Overview() {
  const teachers = useSupervisedTeachers();
  const rows = useTeacherQaRows(teachers.data, WINDOW_MONTHS);
  const cases = useCases({});
  const now = useNow();

  const scorecards = rows.map((r) => r.scorecard).filter((s): s is NonNullable<typeof s> => !!s);
  const scorecardsReady = rows.length > 0 && rows.every((r) => !r.scorecardLoading);
  const reviews = scorecards.reduce((sum, s) => sum + s.reviewsCount, 0);
  const sampled = scorecards.reduce((sum, s) => sum + s.sampled, 0);
  const openCases = cases.data?.filter((c) => c.status !== 'CLOSED') ?? [];
  const overdue = openCases.filter((c) => isCaseOverdue(c, now)).length;

  const attention = rows
    .filter((r) => r.scorecard && (r.scorecard.criteria.some((c) => c.flag) || r.scorecard.awaitingReply > 0))
    .slice(0, 5);

  return (
    <>
      <PageHeader
        eyebrow="Quality & supervision"
        title="Overview"
        description={`Teacher quality over the last ${WINDOW_MONTHS} months, from QA reviews and family ratings.`}
        actions={
          <LinkButton href="/supervisor/reviews" icon={<ClipboardCheck className="w-4 h-4" aria-hidden />}>
            Review a class
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile
          label="Bookable teachers"
          value={teachers.isLoading ? '…' : teachers.data?.length ?? '—'}
          icon={<BadgeCheck className="w-4 h-4" />}
        />
        <StatTile
          label={`QA reviews (${WINDOW_MONTHS} mo)`}
          value={scorecardsReady ? reviews : '…'}
          icon={<ClipboardCheck className="w-4 h-4" />}
        />
        <StatTile
          label="From random samples"
          value={scorecardsReady ? sampled : '…'}
          hint="Reviews whose source is the monthly sample"
          icon={<Shuffle className="w-4 h-4" />}
        />
        <StatTile
          label="Open cases"
          value={cases.isLoading ? '…' : cases.isError ? '—' : openCases.length}
          hint={overdue > 0 ? <span className="text-red font-semibold">{overdue} overdue</span> : cases.data ? 'None overdue' : undefined}
          icon={<ShieldAlert className="w-4 h-4" />}
        />
      </div>

      <div className="grid xl:grid-cols-[1fr_320px] gap-6 items-start">
        <Card>
          <CardHeader
            title="Teachers"
            description="Family rating is all-time; QA figures cover the review window."
            action={
              <Link href="/supervisor/teachers" className="text-xs font-semibold text-green-800 hover:underline">
                All teachers
              </Link>
            }
          />
          <CardBody>
            <QueryState
              query={teachers}
              empty={<EmptyState title="No bookable teachers" description="Teachers appear once they clear hiring and safeguarding training." />}
            >
              {() => <TeacherQaTable rows={rows} />}
            </QueryState>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Needs attention" description="Criteria averaging below 3, or reviews awaiting a teacher reply." />
          <CardBody>
            {!scorecardsReady ? (
              <p className="text-xs text-muted">Checking scorecards…</p>
            ) : attention.length === 0 ? (
              <EmptyState title="Nothing flagged" />
            ) : (
              <ul className="divide-y divide-line">
                {attention.map((r) => (
                  <li key={r.teacher.id} className="py-2.5">
                    <Link href={`/supervisor/teachers/${r.teacher.id}`} className="text-sm font-semibold text-ink hover:underline">
                      {r.teacher.user.name}
                    </Link>
                    <p className="text-[11px] text-muted">
                      {r.scorecard!.criteria.filter((c) => c.flag).length} flagged criteria · {r.scorecard!.awaitingReply} awaiting reply
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {cases.isError && (
              <ErrorState error={cases.error} onRetry={() => cases.refetch()} title="Open cases could not be loaded" className="py-3" />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
