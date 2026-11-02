'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Lock } from 'lucide-react';
import { Alert, Badge, Card, CardBody, CardHeader, LoadingState, UiButton, formatDateTime } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api/http';
import { QuizAttempt, QuizResult, TrainingSession, applicantTrainingApi } from '@/lib/api/modules/applicant-training';
import { cn } from '@/lib/utils';

/**
 * `/training/:token` — the teacher training an applicant completes at the TRAINING
 * hiring step: read each module and confirm it, accept the teacher terms, then pass a
 * quiz graded on the server. The page holds no answers; it only shows what was served.
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

type Stage = 'modules' | 'terms' | 'quiz';

function Course({ token, s }: { token: string; s: TrainingSession }) {
  const read = s.modules.filter((m) => m.acknowledgedAt).length;
  const allRead = read === s.modules.length;
  const stage: Stage = !allRead ? 'modules' : !s.termsAcceptedAt ? 'terms' : 'quiz';

  return (
    <>
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold">Hifzoon teacher training</p>
        <h1 className="font-fraunces text-2xl text-ink">Assalamu alaikum, {s.applicantName}</h1>
        <p className="text-sm text-ink-2">
          Read each module and confirm it, accept the teacher terms, then take a short quiz ({s.rules.questionsPerAttempt}{' '}
          questions, pass mark {s.rules.passPercent}%).
        </p>
      </header>

      <ol className="grid grid-cols-3 gap-2 text-xs" aria-label="Your progress">
        {(
          [
            ['modules', `Modules ${read}/${s.modules.length}`, allRead],
            ['terms', 'Teacher terms', Boolean(s.termsAcceptedAt)],
            ['quiz', 'Quiz', s.status === 'PASSED'],
          ] as const
        ).map(([key, label, done]) => (
          <li
            key={key}
            aria-current={stage === key ? 'step' : undefined}
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

      {s.status === 'PASSED' ? (
        <Alert tone="success" title="You passed the training">
          JazakAllahu khayran. The academy has been told and will complete your application. You can close this page.
        </Alert>
      ) : s.status === 'LOCKED' ? (
        <Alert tone="warning" title="Every attempt has been used">
          The academy has been told and will contact you about what happens next.
        </Alert>
      ) : stage === 'modules' ? (
        <Modules token={token} s={s} />
      ) : stage === 'terms' ? (
        <Terms token={token} s={s} />
      ) : (
        <Quiz token={token} s={s} />
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
          Accept and go to the quiz
        </UiButton>
      </CardBody>
    </Card>
  );
}

function Quiz({ token, s }: { token: string; s: TrainingSession }) {
  const toast = useToast();
  const refresh = useRefresh(token);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(s.openAttempt);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const waitUntil = useWaitUntil(s.nextAttemptAt);

  const start = useMutation({
    mutationFn: () => applicantTrainingApi.startQuiz(token),
    onSuccess: (a) => {
      setAttempt(a);
      setAnswers({});
      setResult(null);
    },
    onError: (err) => toast.error(err),
  });
  const submit = useMutation({
    mutationFn: () => applicantTrainingApi.submitQuiz(token, attempt!.attemptId, answers),
    onSuccess: (r) => {
      setResult(r);
      setAttempt(null);
      refresh();
    },
    onError: (err) => toast.error(err),
  });

  if (result && !result.passed) {
    return (
      <Alert tone="warning" title={`You scored ${result.score} of ${result.total} (${result.percent}%)`}>
        The pass mark is {s.rules.passPercent}%.{' '}
        {result.attemptsLeft > 0
          ? `You have ${result.attemptsLeft} attempt${result.attemptsLeft > 1 ? 's' : ''} left${
              result.nextAttemptAt ? `, from ${formatDateTime(result.nextAttemptAt)}` : ''
            }. Re-read the modules before you try again.`
          : 'Every attempt is used; the academy will contact you.'}
      </Alert>
    );
  }

  if (!attempt) {
    return (
      <Card>
        <CardHeader title="The quiz" description="Questions are drawn at random for each attempt." />
        <CardBody className="space-y-3 text-sm text-ink-2">
          <ul className="list-disc ml-5 space-y-1">
            <li>
              {s.rules.questionsPerAttempt} questions, mostly real situations you may meet as a teacher. Pass mark{' '}
              {s.rules.passPercent}%.
            </li>
            <li>
              Up to {s.rules.maxAttempts} attempts, with {s.rules.cooldownHours} hours between attempts. {s.attemptsUsed} used so far.
            </li>
            <li>Finish within {s.rules.attemptMinutes} minutes of starting.</li>
          </ul>
          {s.lastResult && (
            <p className="text-xs">
              Last attempt: {s.lastResult.score}/{s.lastResult.total}
            </p>
          )}
          {waitUntil ? (
            <Alert tone="neutral">You can take the next attempt from {formatDateTime(waitUntil)}.</Alert>
          ) : (
            <UiButton loading={start.isPending} onClick={() => start.mutate()}>
              {s.attemptsUsed > 0 ? 'Start a new attempt' : 'Start the quiz'}
            </UiButton>
          )}
        </CardBody>
      </Card>
    );
  }

  const answered = attempt.questions.filter((q) => answers[q.id]).length;
  return (
    <Card>
      <CardHeader title="Quiz" description={`Answer every question. Submit by ${formatDateTime(attempt.expiresAt)}.`} />
      <CardBody className="space-y-5">
        {attempt.questions.map((q, i) => (
          <fieldset key={q.id} className="space-y-2">
            <legend className="text-sm font-semibold text-ink">
              {i + 1}. {q.prompt}
            </legend>
            {q.options.map((o) => (
              <label
                key={o.id}
                className={cn(
                  'flex items-start gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer',
                  answers[q.id] === o.id ? 'border-green-800 bg-green-50' : 'border-line bg-white',
                )}
              >
                <input
                  type="radio"
                  name={q.id}
                  value={o.id}
                  checked={answers[q.id] === o.id}
                  onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                  className="mt-1 accent-green-800"
                />
                <span>{o.text}</span>
              </label>
            ))}
          </fieldset>
        ))}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Badge tone={answered === attempt.questions.length ? 'green' : 'amber'}>
            {answered}/{attempt.questions.length} answered
          </Badge>
          <UiButton disabled={answered < attempt.questions.length} loading={submit.isPending} onClick={() => submit.mutate()}>
            Submit answers
          </UiButton>
        </div>
      </CardBody>
    </Card>
  );
}

/** The time the next attempt opens, or null once it has passed (re-checked every 30 s). */
function useWaitUntil(at: string | null) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);
  if (!at || now === null) return null;
  return new Date(at).getTime() > now ? at : null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-4">{children}</div>
    </main>
  );
}
