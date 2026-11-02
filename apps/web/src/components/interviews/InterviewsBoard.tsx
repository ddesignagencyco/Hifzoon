'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Video } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  formatDateTime,
  type Column,
} from '@/components/ui/primitives';
import { FilterBar, FilterSelect } from '@/components/ui/FilterSelect';
import { useInterviews } from '@/hooks/useInterviews';
import {
  InterviewListItem,
  InterviewStatus,
  interviewJoinWindow,
  interviewStatusLabel,
  isInterviewClosed,
} from '@/lib/api/modules/interviews';
import { stepLabel } from '@/components/admin/teachers/step-label';

const STATUS_FILTERS: Array<{ value: InterviewStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'LIVE', label: 'Live' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW_APPLICANT', label: 'Applicant no-show' },
  { value: 'NO_SHOW_INTERVIEWER', label: 'Interviewer no-show' },
];

/**
 * `/admin/interviews` and `/supervisor/interviews` — the interview board.
 *
 * `basePath` is passed in rather than derived from the pathname because the same board
 * serves two portals, and a supervisor who followed an `/admin/...` link would be bounced
 * by the portal shell before the page ever rendered.
 */
export function InterviewsBoard({ basePath }: { basePath: string }) {
  const [status, setStatus] = useState<InterviewStatus | 'ALL'>('ALL');
  const [mine, setMine] = useState(false);
  const interviews = useInterviews({
    ...(status === 'ALL' ? {} : { status }),
    ...(mine ? { mine: true } : {}),
  });

  const columns: Column<InterviewListItem>[] = [
    {
      key: 'applicant',
      header: 'Applicant',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{row.application.applicantName}</p>
          <p className="truncate text-xs text-muted">{row.application.email}</p>
        </div>
      ),
    },
    {
      key: 'when',
      header: 'When',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-sm text-ink">{formatDateTime(row.startsAt, row.timeZone)}</p>
          <p className="text-xs text-muted">
            {row.durationMinutes} min · {row.timeZone.replace(/_/g, ' ')}
          </p>
        </div>
      ),
    },
    { key: 'interviewer', header: 'Interviewer', render: (row) => row.interviewer.name },
    {
      key: 'stage',
      header: 'For step',
      render: (row) => (row.stage ? stepLabel(row.stage) : <span className="text-muted">—</span>),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <InterviewStatusBadge row={row} />,
    },
    {
      key: 'outcome',
      header: 'Verdict',
      render: (row) =>
        row.outcome === 'PENDING' ? (
          <span className="text-muted">—</span>
        ) : (
          <Badge tone={row.outcome === 'PASSED' ? 'green' : 'red'}>
            {row.outcome === 'PASSED' ? 'Passed' : 'Not passed'}
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => {
        const joinable =
          !isInterviewClosed(row.status) && interviewJoinWindow(row.startsAt, row.endsAt) === 'open';
        return (
          <Link
            href={`${basePath}/${encodeURIComponent(row.id)}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold text-green-800 hover:bg-sand"
          >
            {joinable ? <Video className="h-3.5 w-3.5" aria-hidden /> : null}
            {joinable ? 'Join' : 'Open'}
          </Link>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Hiring"
        title="Interviews"
        description="Live sessions between the academy and teaching applicants. The verdict is recorded here; moving the hiring step stays on the application."
      />

      <FilterBar className="mb-5">
        <FilterSelect
          id="interview-status-filter"
          label="Status"
          value={status}
          onChange={(value) => setStatus(value as InterviewStatus | 'ALL')}
          options={STATUS_FILTERS}
        />
        <FilterSelect
          id="interview-owner-filter"
          label="Interviewer"
          value={mine ? 'mine' : 'all'}
          onChange={(value) => setMine(value === 'mine')}
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'mine', label: 'Mine only' },
          ]}
        />
      </FilterBar>

      {interviews.isLoading ? (
        <LoadingState label="Loading interviews…" />
      ) : interviews.isError ? (
        <ErrorState
          error={interviews.error}
          onRetry={() => interviews.refetch()}
          title="Could not load interviews"
        />
      ) : (interviews.data ?? []).length === 0 ? (
        <EmptyState
          title="No interviews yet"
          description="Book one from an applicant's page in the hiring pipeline."
        />
      ) : (
        <Card>
          <CardHeader title="Interviews" description={`${interviews.data!.length} shown`} />
          <CardBody className="p-0">
            <DataTable columns={columns} rows={interviews.data!} rowKey={(row) => row.id} />
          </CardBody>
        </Card>
      )}
    </>
  );
}

/** Live and about-to-be-live interviews read differently from a plain status word. */
function InterviewStatusBadge({ row }: { row: InterviewListItem }) {
  if (row.status === 'LIVE') {
    return (
      <Badge tone="red">
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse" aria-hidden />
        Live
      </Badge>
    );
  }
  if (row.status === 'SCHEDULED' && interviewJoinWindow(row.startsAt, row.endsAt) === 'open') {
    return <Badge tone="gold">Room open</Badge>;
  }
  const tone =
    row.status === 'COMPLETED'
      ? 'green'
      : row.status === 'CANCELLED'
        ? 'neutral'
        : row.status.startsWith('NO_SHOW')
          ? 'amber'
          : 'blue';
  return <Badge tone={tone}>{interviewStatusLabel(row.status)}</Badge>;
}

/** Shown on the room page when the interview cannot be joined for a stated reason. */
export function InterviewClosedNotice({
  status,
  backHref,
}: {
  status: InterviewStatus;
  backHref: string;
}) {
  return (
    <div className="space-y-4">
      <Alert tone="neutral" title={interviewStatusLabel(status)}>
        This interview is closed. Its notes and verdict are on the applicant’s record.
      </Alert>
      <Link href={backHref} className="text-sm font-semibold text-green-700 hover:underline">
        Back to interviews
      </Link>
    </div>
  );
}
