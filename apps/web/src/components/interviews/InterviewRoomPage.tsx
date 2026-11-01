'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  QueryState,
  formatDateTime,
} from '@/components/ui/primitives';
import { DetailList } from '@/components/admin/shared/AdminUi';
import { useInterview } from '@/hooks/useInterviews';
import {
  averageScore,
  interviewJoinWindow,
  interviewRoleLabel,
  interviewStatusLabel,
  isInterviewClosed,
} from '@/lib/api/modules/interviews';
import { stepLabel } from '@/components/admin/teachers/step-label';
import { InterviewRoom } from './InterviewRoom';
import { InterviewOutcomeForm } from './InterviewOutcomeForm';

/**
 * The staff side of one interview: the live room while it is joinable, and the record
 * once it is not.
 *
 * Two states rather than one, deliberately. A room that renders for a finished interview
 * invites the interviewer to sit in an empty call wondering where the applicant is; what
 * they actually want after the fact is the notes, the rubric and a way to record the
 * hiring step.
 */
export function InterviewRoomPage({
  interviewId,
  basePath,
}: {
  interviewId: string;
  /** `/admin/interviews` or `/supervisor/interviews` — the portal this page lives in. */
  basePath: string;
}) {
  const detail = useInterview(interviewId);
  // The two portals keep applications at different paths, so the link is built from the
  // portal we are already in rather than guessed.
  const applicationPath = basePath.startsWith('/supervisor')
    ? '/supervisor/applications'
    : '/admin/teachers/applications';

  return (
    <>
      <Link
        href={basePath}
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Interviews
      </Link>

      <QueryState query={detail} loadingLabel="Loading the interview…">
        {(interview) => {
          const joinable =
            !isInterviewClosed(interview.status) &&
            interviewJoinWindow(interview.startsAt, interview.endsAt) !== 'closed';

          if (joinable) {
            return (
              <InterviewRoom
                interviewId={interviewId}
                viewer="staff"
                onLeave={() => window.location.assign(basePath)}
              />
            );
          }

          const applicationHref = `${applicationPath}/${encodeURIComponent(interview.applicationId)}`;
          const average = averageScore(interview.scores);

          return (
            <div className="grid items-start gap-6 lg:grid-cols-[1fr_minmax(0,380px)]">
              <div className="min-w-0 space-y-6">
                <Card>
                  <CardHeader
                    title={`Interview — ${interview.applicant.name}`}
                    description={`${formatDateTime(interview.startsAt, interview.timeZone)} · ${
                      interview.durationMinutes
                    } min · with ${interview.interviewer.name}`}
                    action={
                      <Link
                        href={applicationHref}
                        className="text-xs font-semibold text-green-700 hover:underline"
                      >
                        Open the application
                      </Link>
                    }
                  />
                  <CardBody className="space-y-4">
                    <Alert tone="neutral" title={interviewStatusLabel(interview.status)}>
                      {interview.cancelReason
                        ? `Cancelled: ${interview.cancelReason}`
                        : 'The booked time has passed, so the room is closed.'}
                    </Alert>

                    <DetailList
                      items={[
                        ['For step', interview.stage ? stepLabel(interview.stage) : '—'],
                        [
                          'Verdict',
                          interview.outcome === 'PENDING'
                            ? 'Not recorded'
                            : interview.outcome === 'PASSED'
                              ? 'Passed'
                              : 'Not passed',
                        ],
                        ['Rubric average', average === null ? 'Not scored' : `${average} / 5`],
                        [
                          'Decided by',
                          interview.decidedBy
                            ? `${interview.decidedBy.name}${
                                interview.decidedAt ? ` · ${formatDateTime(interview.decidedAt)}` : ''
                              }`
                            : '—',
                        ],
                      ]}
                    />

                    {interview.notes && (
                      <section className="space-y-1">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                          Notes from the call
                        </h3>
                        <p className="whitespace-pre-wrap rounded-xl bg-sand px-3 py-2.5 text-sm text-ink">
                          {interview.notes}
                        </p>
                      </section>
                    )}
                    {interview.outcomeNotes && (
                      <section className="space-y-1">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                          On the record
                        </h3>
                        <p className="whitespace-pre-wrap rounded-xl bg-sand px-3 py-2.5 text-sm text-ink">
                          {interview.outcomeNotes}
                        </p>
                      </section>
                    )}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Who attended" />
                  <CardBody>
                    {interview.participants.length === 0 ? (
                      <p className="text-sm text-muted">Nobody joined this interview.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {interview.participants.map((p) => (
                          <li
                            key={p.identity}
                            className="flex items-baseline justify-between gap-3 text-sm text-ink"
                          >
                            <span className="min-w-0 truncate">
                              {p.displayName}{' '}
                              <span className="text-muted">· {interviewRoleLabel(p.role)}</span>
                            </span>
                            <span className="shrink-0 text-xs text-muted">
                              {p.minutesPresent} min
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardHeader
                  title={interview.outcome === 'PENDING' ? 'Record the verdict' : 'Revise the verdict'}
                  description="Recording the hiring step stays a separate action on the application."
                />
                <CardBody>
                  <InterviewOutcomeForm interviewId={interviewId} applicationHref={applicationHref} />
                </CardBody>
              </Card>
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
