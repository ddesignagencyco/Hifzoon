'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, Clock, Globe, UserRound, Video } from 'lucide-react';
import { Logo } from '@/components/landing/Logo';
import { Alert, Card, CardBody, LoadingState, UiButton, formatDateTime } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useInterviewLobby, useJoinInterviewAsApplicant } from '@/hooks/useInterviews';
import {
  INTERVIEW_EARLY_OPEN_MINUTES,
  InterviewRoomToken,
  interviewStatusLabel,
  isInterviewClosed,
} from '@/lib/api/modules/interviews';
import { ApiClientError } from '@/lib/api/http';
import { InterviewRoom } from './InterviewRoom';

/**
 * `/interview/:token` — what an applicant sees when they click the link in their email.
 *
 * No account, no sign-in, nothing to remember. The token in the URL is their whole
 * credential, which is why it is exchanged for the room over a POST rather than used as
 * a path on the API, and why the page shows the interview and nothing else about their
 * application: this link is the only thing they hold, and some of them will forward it.
 *
 * There is a lobby step rather than an auto-join on purpose. Someone opening this on a
 * phone needs a moment to find somewhere quiet and let the browser ask for the camera,
 * and a call that starts the instant the page loads catches people mid-corridor.
 */
export function ApplicantInterviewLobby({ token }: { token: string }) {
  const toast = useToast();
  const lobby = useInterviewLobby(token);
  const join = useJoinInterviewAsApplicant(token);
  const [roomToken, setRoomToken] = useState<InterviewRoomToken | null>(null);

  if (lobby.isLoading) return <Shell><LoadingState label="Opening your interview…" /></Shell>;

  if (lobby.isError) {
    const status = (lobby.error as ApiClientError | null)?.status;
    return (
      <Shell>
        <Alert
          tone="error"
          title={status === 404 ? 'This link is not valid' : 'This link has expired'}
        >
          {status === 404
            ? 'Check that you opened the most recent email from the academy — a cancelled interview’s link stops working.'
            : 'Interview links expire shortly after the booked time. Reply to the academy’s email and they will send a new one.'}
        </Alert>
        <BackHome />
      </Shell>
    );
  }

  const info = lobby.data!;

  if (roomToken) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <InterviewRoom
          interviewId={info.interviewId}
          viewer="applicant"
          roomToken={roomToken}
          applicantToken={token}
          onLeave={() => setRoomToken(null)}
        />
      </div>
    );
  }

  const closed = isInterviewClosed(info.status);

  return (
    <Shell>
      <Card className="overflow-hidden">
        <div className="bg-green-900 px-5 py-5 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
            Teaching interview
          </p>
          <h1 className="mt-1.5 font-fraunces text-2xl">Assalamu alaikum, {info.applicantName}</h1>
          <p className="mt-1 text-sm text-white/80">
            Thank you for applying to teach with Hifzoon.
            {!closed && ' This page is your way into the interview.'}
          </p>
        </div>
        <CardBody className="space-y-4 pt-5">
          <dl className="grid gap-x-4 gap-y-3 rounded-xl bg-sand px-4 py-3 text-sm sm:grid-cols-2">
            <Detail icon={<CalendarDays className="h-4 w-4" aria-hidden />} label="When">
              {formatDateTime(info.startsAt, info.timeZone)}
            </Detail>
            <Detail icon={<Clock className="h-4 w-4" aria-hidden />} label="Length">
              About {info.durationMinutes} minutes, until {formatTime(info.endsAt, info.timeZone)}
            </Detail>
            <Detail icon={<UserRound className="h-4 w-4" aria-hidden />} label="You are meeting">
              {info.interviewerName}
            </Detail>
            <Detail icon={<Globe className="h-4 w-4" aria-hidden />} label="Time zone">
              {info.timeZone.replace(/_/g, ' ')}
            </Detail>
          </dl>

          {!closed && (
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">What to expect</h2>
                <ul className="mt-2 space-y-1.5 text-ink-2">
                  <Point>A live video call with one member of the academy</Point>
                  <Point>You may be asked to recite, and to show how you would correct a student</Point>
                  <Point>Questions about your teaching and experience with children</Point>
                </ul>
              </section>
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Check before you join</h2>
                <ul className="mt-2 space-y-1.5 text-ink-2">
                  <Point>A quiet room with good light</Point>
                  <Point>A Mushaf to hand</Point>
                  <Point>Camera and microphone allowed in your browser</Point>
                  <Point>A steady internet connection</Point>
                </ul>
              </section>
            </div>
          )}

          {closed ? (
            <Alert tone="neutral" title={interviewStatusLabel(info.status)}>
              {info.status === 'CANCELLED'
                ? 'This interview was cancelled. The academy will be in touch about the next step.'
                : 'This interview is over. Thank you for your time — the academy will be in touch.'}
            </Alert>
          ) : info.window === 'early' ? (
            <Alert tone="neutral" title="The room is not open yet">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                It opens {INTERVIEW_EARLY_OPEN_MINUTES} minutes before the start, at{' '}
                {formatDateTime(info.opensAt, info.timeZone)}. Keep this page open — the Join
                button appears on its own.
              </span>
            </Alert>
          ) : info.window === 'closed' ? (
            <Alert tone="neutral" title="The booked time has passed">
              The room has closed. Reply to the academy’s email if you were not able to attend.
            </Alert>
          ) : (
            <>
              <UiButton
                icon={<Video className="h-4 w-4" aria-hidden />}
                loading={join.isPending}
                onClick={() =>
                  join
                    .mutateAsync()
                    .then(setRoomToken)
                    .catch((error: Error) => toast.error(error.message))
                }
              >
                Join the interview
              </UiButton>
            </>
          )}
        </CardBody>
      </Card>
      <BackHome />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto w-full max-w-xl space-y-5">
        <div className="flex justify-center">
          <Logo dark={false} />
        </div>
        {children}
      </div>
    </main>
  );
}

function Detail({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 text-green-700">{icon}</span>
      <div>
        <dt className="text-xs font-semibold text-muted">{label}</dt>
        <dd className="text-ink">{children}</dd>
      </div>
    </div>
  );
}

function Point({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-700" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

/** "17:15" in the interview's own time zone. */
function formatTime(value: string, timeZone: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone });
}

function BackHome() {
  return (
    <p className="text-center text-xs text-muted">
      <Link href="/" className="font-semibold text-green-700 hover:underline">
        Hifzoon
      </Link>{' '}
      · online Quran Hifz and recitation academy
    </p>
  );
}
