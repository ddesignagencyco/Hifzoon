'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, CheckCircle2, Circle, Lock } from 'lucide-react';
import { Alert, Card, CardBody, CardHeader, LoadingState, UiButton, formatDateTime } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { Logo } from '@/components/landing/Logo';
import { ApiClientError } from '@/lib/api/http';
import { TrainingSession, applicantTrainingApi } from '@/lib/api/modules/applicant-training';
import { cn } from '@/lib/utils';

/**
 * `/training/:token` — the teacher training an applicant completes at the TRAINING
 * hiring step: read each module and confirm it, then accept the teacher terms, which
 * completes the training.
 */
export function ApplicantTrainingCourse({ token }: { token: string }) {
  const session = useQuery({
    queryKey: ['applicant-training', token],
    queryFn: () => applicantTrainingApi.session(token),
    retry: false,
  });

  if (session.isLoading) return <Shell><LoadingState label="Opening your training…" /></Shell>;
  if (session.isError || !session.data) {
    const status = (session.error as ApiClientError | null)?.status;
    return (
      <Shell>
        <Alert tone="warning" title={status === 404 ? 'This training link is not valid' : 'The training could not be opened'}>
          {status === 404
            ? 'The link may have expired or been replaced by a newer one. Ask the academy to send it again.'
            : 'Please check your connection and reload the page.'}
        </Alert>
      </Shell>
    );
  }
  return (
    <Shell>
      <Course token={token} s={session.data} />
    </Shell>
  );
}

type Stage = 'modules' | 'terms';

function Course({ token, s }: { token: string; s: TrainingSession }) {
  const read = s.modules.filter((m) => m.acknowledgedAt).length;
  const allRead = read === s.modules.length;
  const stage: Stage = !allRead ? 'modules' : 'terms';
  const complete = s.status === 'PASSED';
  // Once every module is confirmed they stay open to re-read, before and after completing.
  const [reviewing, setReviewing] = useState(false);

  return (
    <>
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold">Hifzoon teacher training</p>
        <h1 className="font-fraunces text-2xl text-ink">Assalamu alaikum, {s.applicantName}</h1>
        <p className="text-sm text-ink-2">
          Read each of the {s.modules.length} modules and confirm it, then accept the teacher terms. That completes your
          training.
        </p>
      </header>

      <ol className="grid grid-cols-2 gap-2 text-xs" aria-label="Your progress">
        {(
          [
            ['modules', `Modules ${read}/${s.modules.length}`, allRead],
            ['terms', 'Teacher terms', complete],
          ] as const
        ).map(([key, label, done]) => (
          <li
            key={key}
            aria-current={!complete && stage === key ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-xl border px-3 py-2',
              done ? 'border-green-600/30 bg-green-50 text-green-800' : stage === key ? 'border-gold bg-white' : 'border-line bg-white text-muted',
            )}
          >
            {done ? <CheckCircle2 className="w-4 h-4" aria-hidden /> : <Circle className="w-4 h-4" aria-hidden />}
            {label}
          </li>
        ))}
      </ol>

      {allRead && !reviewing && (
        <UiButton variant="secondary" size="sm" icon={<BookOpen className="w-4 h-4" aria-hidden />} onClick={() => setReviewing(true)}>
          Re-read the modules
        </UiButton>
      )}

      {allRead && reviewing ? (
        <>
          <Modules token={token} s={s} />
          <UiButton variant="secondary" icon={<ArrowLeft className="w-4 h-4" aria-hidden />} onClick={() => setReviewing(false)}>
            {complete || s.status === 'LOCKED' ? 'Done reading' : 'Back to the terms'}
          </UiButton>
        </>
      ) : complete ? (
        <Alert tone="success" title="Your training is complete">
          JazakAllahu khayran. The academy has been told and will complete your application. You can close this page.
        </Alert>
      ) : s.status === 'LOCKED' ? (
        <Alert tone="warning" title="Your training is on hold">
          The academy will contact you about what happens next.
        </Alert>
      ) : stage === 'modules' ? (
        <Modules token={token} s={s} />
      ) : (
        <Terms token={token} s={s} />
      )}

      <p className="text-center text-xs text-muted">
        <Link href="/" className="font-semibold text-green-700 hover:underline">
          Hifzoon
        </Link>{' '}
        · course {s.courseVersion}
      </p>
    </>
  );
}

function useRefresh(token: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['applicant-training', token] });
}

function Modules({ token, s }: { token: string; s: TrainingSession }) {
  const toast = useToast();
  const refresh = useRefresh(token);
  // The first module not yet confirmed; earlier ones stay open to re-read.
  const firstUnread = s.modules.findIndex((m) => !m.acknowledgedAt);
  const [open, setOpen] = useState(Math.max(0, firstUnread));
  const [ticked, setTicked] = useState(false);
  const ack = useMutation({
    mutationFn: (moduleId: string) => applicantTrainingApi.acknowledge(token, moduleId),
    onSuccess: () => {
      setTicked(false);
      setOpen((i) => Math.min(i + 1, s.modules.length - 1));
      refresh();
    },
    onError: (err) => toast.error(err),
  });
  const m = s.modules[open];

  return (
    <div className="space-y-3">
      <nav aria-label="Modules" className="flex flex-wrap gap-1.5">
        {s.modules.map((mod, i) => {
          const reachable = Boolean(mod.acknowledgedAt) || i === firstUnread;
          return (
            <button
              key={mod.id}
              type="button"
              disabled={!reachable}
              onClick={() => {
                setOpen(i);
                setTicked(false);
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold',
                i === open ? 'border-green-800 bg-green-800 text-white' : 'border-line bg-white text-ink-2',
                !reachable && 'opacity-50 cursor-not-allowed',
              )}
            >
              {mod.acknowledgedAt ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden /> : !reachable ? <Lock className="w-3.5 h-3.5" aria-hidden /> : null}
              {i + 1}
            </button>
          );
        })}
      </nav>

      <Card>
        <CardHeader title={`${open + 1}. ${m.title}`} description={`Module ${open + 1} of ${s.modules.length}`} />
        <CardBody className="space-y-4 text-sm text-ink-2 leading-relaxed">
          {m.sections.map((sec, i) => (
            <section key={i} className="space-y-2">
              {sec.heading && <h3 className="font-semibold text-ink">{sec.heading}</h3>}
              {sec.paragraphs?.map((p, j) => <p key={j}>{p}</p>)}
              {sec.bullets && (
                <ul className="list-disc ml-5 space-y-1">
                  {sec.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {m.acknowledgedAt ? (
            <p className="flex items-center gap-1.5 text-xs text-green-700">
              <CheckCircle2 className="w-4 h-4" aria-hidden /> Confirmed {formatDateTime(m.acknowledgedAt)}
            </p>
          ) : (
            <div className="space-y-3 border-t border-line pt-4">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-1 accent-green-800" />
                <span className="text-ink">{m.acknowledgement}</span>
              </label>
              <UiButton disabled={!ticked} loading={ack.isPending} onClick={() => ack.mutate(m.id)}>
                Confirm and continue
              </UiButton>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Terms({ token, s }: { token: string; s: TrainingSession }) {
  const toast = useToast();
  const refresh = useRefresh(token);
  const [ticked, setTicked] = useState(false);
  const accept = useMutation({
    mutationFn: () => applicantTrainingApi.acceptTerms(token),
    onSuccess: refresh,
    onError: (err) => toast.error(err),
  });
  return (
    <Card>
      <CardHeader title="Teacher terms and code of conduct" description={`Version ${s.termsVersion}`} />
      <CardBody className="space-y-3 text-sm text-ink-2">
        <p>
          You have read every module. By accepting, you agree to teach under the Hifzoon teacher terms and code of conduct in
          module 1, to keep all contact on Hifzoon, and to report every safeguarding concern the same day. Your acceptance is
          recorded with the date and version.
        </p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-1 accent-green-800" />
          <span className="text-ink">I accept the Hifzoon teacher terms and code of conduct.</span>
        </label>
        <UiButton disabled={!ticked} loading={accept.isPending} onClick={() => accept.mutate()}>
          Accept and complete the training
        </UiButton>
      </CardBody>
    </Card>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div className="mb-2 flex justify-center">
          <Logo dark={false} />
        </div>
        {children}
      </div>
    </main>
  );
}
