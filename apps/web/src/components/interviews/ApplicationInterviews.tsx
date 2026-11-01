'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CalendarPlus, Copy, Video } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Field,
  LoadingState,
  Select,
  TextInput,
  UiButton,
  formatDateTime,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  useCancelInterview,
  useInterviews,
  useScheduleInterview,
} from '@/hooks/useInterviews';
import {
  INTERVIEW_DURATION,
  InterviewListItem,
  averageScore,
  interviewJoinWindow,
  interviewStatusLabel,
  isInterviewClosed,
  validateScheduleInterview,
} from '@/lib/api/modules/interviews';
import { HIRING_PIPELINE, HiringStage } from '@/lib/api/modules/teacher-hiring';
import { stepLabel } from '@/components/admin/teachers/step-label';

const DURATION_OPTIONS = [15, 20, 30, 45, 60, 90].map((minutes) => ({
  value: String(minutes),
  label: `${minutes} minutes`,
}));

/** Steps an interview is plausibly held for; APPROVED/REJECTED are outcomes, not meetings. */
const INTERVIEW_STAGES: HiringStage[] = HIRING_PIPELINE.filter(
  (stage) => stage !== 'SUBMITTED' && stage !== 'APPROVED',
);

/**
 * The interviews card on an applicant's page: what is booked, what happened, and the
 * form to book another.
 *
 * Shown next to the hiring step timeline rather than on a page of its own, because the
 * question "has anyone actually spoken to this person" is one a reviewer asks while
 * looking at the pipeline, not one they navigate away to answer.
 */
export function ApplicationInterviews({
  applicationId,
  applicantName,
  /** Hidden for a closed application: there is nothing left to interview for. */
  canSchedule = true,
  interviewBasePath = '/admin/interviews',
  suggestedStage,
}: {
  applicationId: string;
  applicantName: string;
  canSchedule?: boolean;
  interviewBasePath?: string;
  suggestedStage?: HiringStage | null;
}) {
  const interviews = useInterviews({ applicationId });
  const [showForm, setShowForm] = useState(false);

  const rows = interviews.data ?? [];
  const open = rows.find((row) => !isInterviewClosed(row.status));

  return (
    <Card>
      <CardHeader
        title="Interviews"
        description="A live session with the applicant. The verdict is recorded on the interview; the hiring step stays yours to record."
        action={
          canSchedule && !open ? (
            <UiButton
              size="sm"
              variant="secondary"
              icon={<CalendarPlus className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? 'Cancel' : 'Book an interview'}
            </UiButton>
          ) : undefined
        }
      />
      <CardBody className="space-y-4">
        {interviews.isLoading ? (
          <LoadingState label="Loading interviews…" className="py-6" />
        ) : interviews.isError ? (
          <Alert tone="error" title="Could not load interviews">
            {(interviews.error as Error).message}
          </Alert>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">No interview has been booked yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((row) => (
              <InterviewRow key={row.id} row={row} basePath={interviewBasePath} />
            ))}
          </ul>
        )}

        {open && canSchedule && (
          <Alert tone="neutral" title="One interview at a time">
            {applicantName} already has an interview on {formatDateTime(open.startsAt, open.timeZone)}.
            Cancel or reschedule it before booking another.
          </Alert>
        )}

        {showForm && canSchedule && !open && (
          <ScheduleInterviewForm
            applicationId={applicationId}
            suggestedStage={suggestedStage ?? null}
            onDone={() => setShowForm(false)}
          />
        )}
      </CardBody>
    </Card>
  );
}

function InterviewRow({ row, basePath }: { row: InterviewListItem; basePath: string }) {
  const toast = useToast();
  const cancel = useCancelInterview(row.id);
  const closed = isInterviewClosed(row.status);
  const joinable = !closed && interviewJoinWindow(row.startsAt, row.endsAt) === 'open';

  return (
    <li className="rounded-xl border border-line bg-white px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {formatDateTime(row.startsAt, row.timeZone)}
            <span className="font-normal text-muted"> · {row.durationMinutes} min</span>
          </p>
          <p className="text-xs text-muted">
            With {row.interviewer.name}
            {row.stage ? ` · for the ${stepLabel(row.stage)} step` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge tone={row.status === 'LIVE' ? 'red' : closed ? 'neutral' : 'blue'}>
            {interviewStatusLabel(row.status)}
          </Badge>
          {row.outcome !== 'PENDING' && (
            <Badge tone={row.outcome === 'PASSED' ? 'green' : 'red'}>
              {row.outcome === 'PASSED' ? 'Passed' : 'Not passed'}
            </Badge>
          )}
          <Link
            href={`${basePath}/${encodeURIComponent(row.id)}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold text-green-800 hover:bg-sand"
          >
            {joinable && <Video className="h-3.5 w-3.5" aria-hidden />}
            {joinable ? 'Join' : 'Open'}
          </Link>
          {!closed && (
            <UiButton
              size="sm"
              variant="ghost"
              loading={cancel.isPending}
              onClick={() => {
                const reason = window.prompt(
                  'Why is this interview being cancelled? The applicant is told.',
                );
                if (reason === null) return;
                cancel
                  .mutateAsync(reason)
                  .then(() => toast.success('Interview cancelled and the applicant emailed'))
                  .catch((error: Error) => toast.error(error.message));
              }}
            >
              Cancel
            </UiButton>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Booking form.
 *
 * `datetime-local` on purpose: the booker types the time they mean in their own zone, and
 * the browser's zone is sent alongside it, so the applicant's email reads in the same
 * wall-clock time the admin booked.
 */
function ScheduleInterviewForm({
  applicationId,
  suggestedStage,
  onDone,
}: {
  applicationId: string;
  suggestedStage: HiringStage | null;
  onDone: () => void;
}) {
  const toast = useToast();
  const schedule = useScheduleInterview();
  const [startsAt, setStartsAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(String(INTERVIEW_DURATION.DEFAULT_MINUTES));
  const [stage, setStage] = useState<HiringStage | ''>(suggestedStage ?? 'DEMO_CLASS');
  const [joinUrl, setJoinUrl] = useState<string | null>(null);

  const timeZone =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

  if (joinUrl) {
    return (
      <div className="space-y-2 rounded-xl border border-green-600/25 bg-green-50 p-3.5">
        <p className="text-sm font-semibold text-green-800">
          Booked. The applicant has been emailed their join link.
        </p>
        <p className="text-xs text-green-800">
          This link is shown once and is never readable again — only its fingerprint is
          stored. Copy it now if you also want to send it on WhatsApp.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2.5 py-1.5 text-[11px] text-ink">
            {joinUrl}
          </code>
          <UiButton
            size="sm"
            variant="secondary"
            icon={<Copy className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => {
              navigator.clipboard
                ?.writeText(joinUrl)
                .then(() => toast.success('Join link copied'))
                .catch(() => toast.error('Could not copy — select the link and copy it by hand'));
            }}
          >
            Copy
          </UiButton>
          <UiButton size="sm" onClick={onDone}>
            Done
          </UiButton>
        </div>
      </div>
    );
  }

  const submit = () => {
    const problem = validateScheduleInterview({
      startsAt: startsAt ? new Date(startsAt).toISOString() : '',
      durationMinutes: Number(durationMinutes),
    });
    if (problem) {
      toast.error(problem);
      return;
    }
    schedule
      .mutateAsync({
        applicationId,
        startsAt: new Date(startsAt).toISOString(),
        durationMinutes: Number(durationMinutes),
        timeZone,
        ...(stage ? { stage } : {}),
      })
      .then((result) => setJoinUrl(result.applicantJoinUrl))
      .catch((error: Error) => toast.error(error.message));
  };

  return (
    <div className="space-y-3 rounded-xl border border-line bg-sand/50 p-3.5">
      <Field
        label="Date and time"
        htmlFor="interview-starts-at"
        hint={`Booked in your zone (${timeZone.replace(/_/g, ' ')}) — that is the time the applicant is emailed.`}
        required
      >
        <TextInput
          id="interview-starts-at"
          type="datetime-local"
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
        />
      </Field>

      <Field label="Length" htmlFor="interview-duration">
        <Select
          id="interview-duration"
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(event.target.value)}
          options={DURATION_OPTIONS}
        />
      </Field>

      <Field
        label="Which step is this for?"
        htmlFor="interview-stage"
        hint="Optional. It only labels the interview — recording the step is still a separate action."
      >
        <Select
          id="interview-stage"
          value={stage}
          onChange={(event) => setStage(event.target.value as HiringStage | '')}
          placeholder="Not tied to a step"
          options={INTERVIEW_STAGES.map((value) => ({ value, label: stepLabel(value) }))}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <UiButton onClick={submit} loading={schedule.isPending}>
          Book and email the applicant
        </UiButton>
        <UiButton variant="ghost" onClick={onDone}>
          Cancel
        </UiButton>
      </div>
    </div>
  );
}

/** The rubric average for a finished interview, for a compact summary line. */
export function interviewScoreSummary(scores: Parameters<typeof averageScore>[0]): string {
  const average = averageScore(scores);
  return average === null ? 'Not scored' : `${average} / 5`;
}
