'use client';

import React, { useEffect, useState } from 'react';
import { stepLabel } from './step-label';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Circle, XCircle } from 'lucide-react';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  Field,
  PageHeader,
  QueryState,
  Select,
  StatusBadge,
  TextArea,
  UiButton,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useHiringApplication, useRecordHiringStep } from '@/hooks/useHiring';
import { isUuid } from '@/lib/api/modules/crm';
import { LANGUAGE_OPTIONS } from '@/lib/api/modules/families';
import {
  ApplicationDetail,
  HIRING_STEP_STATUSES,
  HiringStage,
  HiringStepStatus,
  RECORDABLE_STEPS,
  missingEvidence,
  nextActionableStep,
  outstandingSteps,
  sortSteps,
  validateRecordStep,
} from '@/lib/api/modules/teacher-hiring';
import { cn } from '@/lib/utils';
import { DetailList, IdText } from '../shared/AdminUi';
import { ApplicationInterviews } from '@/components/interviews/ApplicationInterviews';
import { TeacherProfileTools } from './TeacherProfileTools';
import { DocumentsCard, ReferencesCard, TrainingCard } from './HiringEvidence';

/** Application detail with step timeline and the record-step form. */
export function ApplicationDetailView({
  applicationId,
  backHref,
  initialProfileId,
  interviewBasePath = '/admin/interviews',
}: {
  applicationId: string;
  backHref: string;
  initialProfileId?: string;
  /** Where this portal keeps its interview rooms (`/admin/…` or `/supervisor/…`). */
  interviewBasePath?: string;
}) {
  const application = useHiringApplication(applicationId);
  return (
    <>
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:underline mb-3">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Hiring pipeline
      </Link>
      <QueryState query={application} loadingLabel="Loading application…">
        {(app) => (
          <>
            <PageHeader
              eyebrow="Teacher application"
              title={app.applicantName}
              description={[app.email, app.phone, app.country].filter(Boolean).join(' · ')}
              actions={<StatusBadge status={app.status} label={stepLabel(app.status)} />}
            />
            <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,360px)] items-start">
              {/* The evidence follows the pipeline's order: recitation, interview, ID, references, training. */}
              <div className="space-y-6 min-w-0">
                <Timeline app={app} />
                <ApplicantInfo app={app} />
                <ApplicationInterviews
                  applicationId={app.id}
                  applicantName={app.applicantName}
                  canSchedule={app.status !== 'APPROVED' && app.status !== 'REJECTED'}
                  interviewBasePath={interviewBasePath}
                  suggestedStage={nextActionableStep(app.steps)}
                />
                <DocumentsCard app={app} />
                <ReferencesCard app={app} />
                <TrainingCard app={app} />
              </div>
              {/* Stays in view while the reviewer reads the evidence on the left. */}
              <div className="space-y-6 lg:sticky lg:top-20">
                <RecordStepCard key={`${app.id}-${app.status}`} app={app} />
                <ProfileCard app={app} initialProfileId={initialProfileId} />
              </div>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}

function Timeline({ app }: { app: ApplicationDetail }) {
  const steps = sortSteps(app.steps);
  const outstanding = outstandingSteps(app.steps);
  return (
    <Card>
      <CardHeader title="Pipeline" description="Each step must pass before the teacher can be approved." />
      <CardBody>
        {app.status === 'APPROVED' && outstanding.length > 0 && (
          <Alert tone="warning" className="mb-4" title="Approved with steps outstanding">
            This application is marked approved but {outstanding.map(humanize).join(', ')} {outstanding.length > 1 ? 'have' : 'has'} not
            passed. Record those steps to clear the teacher properly.
          </Alert>
        )}
        <ol className="relative border-l border-line ml-2 space-y-5">
          {steps.map((s) => {
            const Icon = s.status === 'PASSED' ? CheckCircle2 : s.status === 'FAILED' ? XCircle : Circle;
            return (
              <li key={s.id} className="ml-5">
                <span
                  className={cn(
                    'absolute -left-[9px] flex items-center justify-center w-[18px] h-[18px] rounded-full bg-white',
                    s.status === 'PASSED' ? 'text-green-600' : s.status === 'FAILED' ? 'text-red' : 'text-muted',
                  )}
                >
                  <Icon className="w-4 h-4" aria-hidden />
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{stepLabel(s.step)}</p>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-[11px] text-muted mt-0.5">{s.completedAt ? `Completed ${formatDateTime(s.completedAt)}` : 'Not completed'}</p>
                {s.notes && <p className="text-xs text-ink-2 mt-1 whitespace-pre-line">{s.notes}</p>}
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}

function isHttpUrl(value: string | null | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

/** Legacy rows (before M34) carried the recording inline as a data URL. */
function isInlineAudio(value: string | null | undefined): value is string {
  return Boolean(value && /^data:audio\//i.test(value));
}

/**
 * A private object key from `POST /uploads/presign` (e.g. `recitations/2026/<uuid>.webm`).
 * `GET /teachers/applications/:id` returns the key as stored and there is no signed-GET
 * route for it yet, so it cannot be played or opened here. The key itself is never shown;
 * support can copy it.
 */
function StoredFile({ storageKey }: { storageKey: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted">Stored privately — the download link has expired; reload the page</span>
      <IdText id={storageKey} label="file reference" />
    </span>
  );
}

function ApplicantInfo({ app }: { app: ApplicationDetail }) {
  return (
    <Card>
      <CardHeader title="Applicant" description="Contact details, qualifications and the recitation under review." />
      <CardBody className="space-y-5">
        <section>
          <SectionLabel>Contact</SectionLabel>
          <FactGrid
            className="xl:grid-cols-4"
            items={[
              ['Email', app.email],
              ['Phone', app.phone ?? '—'],
              ['Country', app.country ?? '—'],
              ['Account', app.userId ? 'Created' : 'Not yet created'],
            ]}
          />
        </section>
        {app.qualifications != null && (
          <section>
            <SectionLabel>Qualifications</SectionLabel>
            {app.qualifications && typeof app.qualifications === 'object' && !Array.isArray(app.qualifications) ? (
              <FactGrid
                items={Object.entries(app.qualifications as Record<string, unknown>).map(([k, v]) => [
                  QUALIFICATION_LABELS[k] ?? humanize(k.replace(/([a-z])([A-Z])/g, '$1_$2')),
                  qualificationValue(k, v),
                ])}
              />
            ) : (
              <Qualifications value={app.qualifications} />
            )}
          </section>
        )}
        {app.recitationAudioUrl && (
          <section>
            <SectionLabel>Recitation sample</SectionLabel>
            {app.recitationAudioDownloadUrl ? (
              <>
                <audio controls preload="none" src={app.recitationAudioDownloadUrl} className="w-full mt-1">
                  <a href={app.recitationAudioDownloadUrl}>Download recitation</a>
                </audio>
                <a href={app.recitationAudioDownloadUrl} download className="text-xs text-green-700 underline">
                  Download recitation
                </a>
              </>
            ) : isInlineAudio(app.recitationAudioUrl) ? (
              <audio controls preload="none" src={app.recitationAudioUrl} className="w-full mt-1">
                <a href={app.recitationAudioUrl}>Download recitation</a>
              </audio>
            ) : isHttpUrl(app.recitationAudioUrl) ? (
              <a href={app.recitationAudioUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gold underline block mt-1">
                Open recitation link ↗
              </a>
            ) : (
              <StoredFile storageKey={app.recitationAudioUrl} />
            )}
          </section>
        )}
      </CardBody>
    </Card>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</h3>;
}

/** Short facts as tiles, two or three to a row, instead of one long column. */
function FactGrid({ items, className }: { items: Array<[string, React.ReactNode]>; className?: string }) {
  return (
    <dl className={cn('grid gap-2 sm:grid-cols-2 xl:grid-cols-3', className)}>
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-sand/60 px-3 py-2">
          <dt className="text-[11px] font-semibold text-muted">{label}</dt>
          <dd className="mt-0.5 text-sm text-ink break-words">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Qualifications({ value }: { value: unknown }) {
  if (typeof value === 'string') return <p className="text-sm text-ink-2">{value}</p>;
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc ml-4 text-sm text-ink-2">
        {value.map((v, i) => (
          <li key={i}>{typeof v === 'string' ? v : JSON.stringify(v)}</li>
        ))}
      </ul>
    );
  }
  if (value && typeof value === 'object') {
    return (
      <DetailList
        items={Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          QUALIFICATION_LABELS[k] ?? humanize(k.replace(/([a-z])([A-Z])/g, '$1_$2')),
          qualificationValue(k, v),
        ])}
      />
    );
  }
  return <p className="text-sm text-ink-2">{String(value)}</p>;
}

/** One answer as a reviewer reads it: names, not codes, and lists joined rather than JSON. */
function qualificationValue(key: string, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? v.map((x) => qualificationValue(key, x)).join(', ') : '—';
  if (typeof v !== 'string') return v == null ? '—' : JSON.stringify(v);
  if (key === 'languages') return LANGUAGE_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (key === 'ageGroups') return `${v.replace('-', '–')} years`;
  if (key === 'gender') return v === 'FEMALE' ? 'Female (Ustadhah)' : v === 'MALE' ? 'Male (Ustadh)' : v;
  if (key === 'subjects' || key === 'auditionMode') return humanize(v);
  if (key === 'yearsExp') return `${v.replace('-', '–')} years`;
  return v;
}

/** Labels for the qualification keys sent by /apply-teacher. */
const QUALIFICATION_LABELS: Record<string, string> = {
  gender: 'Gender',
  yearsExp: 'Years of teaching experience',
  isHafiz: 'Hafiz / Hafiza',
  hasSanad: 'Holds a sanad / ijazah',
  qiraat: 'Qira’at',
  recitationLink: 'Recitation link',
  languages: 'Teaches in',
  timeZone: 'Time zone',
  subjects: 'Subjects',
  ageGroups: 'Age groups',
  auditionMode: 'Audition submitted as',
};

function RecordStepCard({ app }: { app: ApplicationDetail }) {
  const toast = useToast();
  const record = useRecordHiringStep(app.id);
  const next = nextActionableStep(app.steps);
  const available = RECORDABLE_STEPS.filter((s) => app.steps.some((row) => row.step === s));
  const [step, setStep] = useState<HiringStage>(next ?? available[0] ?? 'RECITATION_REVIEW');
  const [status, setStatus] = useState<HiringStepStatus>('PASSED');
  const [notes, setNotes] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { step, status, notes: notes.trim() || undefined };
    const problem = validateRecordStep(body, app.steps);
    if (problem) return toast.error(problem);
    record.mutate(body, {
      onSuccess: (res) => {
        toast.success(`${stepLabel(res.step.step)} marked ${humanize(res.step.status).toLowerCase()} — application is ${stepLabel(res.applicationStatus).toLowerCase()}`);
        setNotes('');
      },
      onError: (err) => toast.error(err),
    });
  };

  const closed = app.status === 'REJECTED';
  const missing = status === 'PASSED' ? missingEvidence(app, step) : [];
  return (
    <Card>
      <CardHeader
        title="Record a step"
        description={next ? `Next step: ${stepLabel(next)}` : 'Every step has been recorded.'}
      />
      <CardBody>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Step" htmlFor="step-select" required>
            <Select id="step-select" value={step} onChange={(e) => setStep(e.target.value as HiringStage)} disabled={closed}>
              {available.map((s) => (
                <option key={s} value={s}>
                  {stepLabel(s)}
                  {s === next ? ' (next)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset disabled={closed}>
            <legend className="text-xs font-semibold text-ink-2 mb-1.5">Outcome</legend>
            <div className="flex flex-wrap gap-4">
              {HIRING_STEP_STATUSES.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="step-status" value={s} checked={status === s} onChange={() => setStatus(s)} className="accent-green-800" />
                  {s === 'FAILED' ? 'Failed (reject)' : s === 'PENDING' ? 'Reset to pending' : 'Passed'}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Notes" htmlFor="step-notes" hint="Visible to other reviewers.">
            <TextArea id="step-notes" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} disabled={closed} />
          </Field>
          {missing.length > 0 && (
            <Alert tone="warning" title="Not ready to pass yet">
              <ul className="list-disc ml-4 space-y-0.5">
                {missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </Alert>
          )}
          {status === 'FAILED' && (
            <p className="text-xs text-amber" role="note">
              Failing a step stops the application at that step and removes the teacher from matching.
            </p>
          )}
          <UiButton type="submit" loading={record.isPending} disabled={closed || missing.length > 0} variant={status === 'FAILED' ? 'danger' : 'primary'} className="w-full">
            Save step
          </UiButton>
        </form>
      </CardBody>
    </Card>
  );
}

/**
 * The teacher account is created just after the approval commits, so for a short while an
 * approved application has no account yet. Within this window the page waits and polls
 * rather than offering "Create the teacher account" for one that is on its way.
 */
export const ACCOUNT_CREATION_GRACE_MS = 60_000;
const ACCOUNT_POLL_MS = 2_000;

/** When the approval was recorded (the APPROVED step's completion), or null. */
function approvedAt(app: ApplicationDetail): number | null {
  const step = app.steps.find((s) => s.step === 'APPROVED' && s.status === 'PASSED');
  const at = step?.completedAt ? new Date(step.completedAt).getTime() : NaN;
  return Number.isFinite(at) ? at : null;
}

/** Approved without an account: wait while it is fresh, then offer the retry. */
function AwaitingTeacherAccount({ app }: { app: ApplicationDetail }) {
  const at = approvedAt(app);
  const [now, setNow] = useState(() => Date.now());
  const remaining = at === null ? 0 : at + ACCOUNT_CREATION_GRACE_MS - now;
  const fresh = remaining > 0;
  // Polls the same query the page reads, so the profile tools appear once the account lands.
  useHiringApplication(fresh ? app.id : undefined, { refetchInterval: ACCOUNT_POLL_MS });
  useEffect(() => {
    if (!fresh) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [fresh, remaining]);

  if (fresh) {
    return (
      <Alert tone="neutral" title="Creating the teacher account…">
        The application was just approved. The account is being created and emailed to the teacher; this page updates
        on its own.
      </Alert>
    );
  }
  return <CreateAccountRetry app={app} />;
}

/** Approved, but the teacher account was not created: record the approval again to retry. */
function CreateAccountRetry({ app }: { app: ApplicationDetail }) {
  const toast = useToast();
  const record = useRecordHiringStep(app.id);
  return (
    <Alert tone="warning" title="Approved, but no teacher account yet">
      <p className="mb-2">The account could not be created when the application was approved.</p>
      <UiButton
        size="sm"
        loading={record.isPending}
        onClick={() =>
          record.mutate(
            { step: 'APPROVED', status: 'PASSED', notes: 'Account creation retried.' },
            { onSuccess: () => toast.success('Teacher account created and emailed.'), onError: (err) => toast.error(err) },
          )
        }
      >
        Create the teacher account
      </UiButton>
    </Alert>
  );
}

function ProfileCard({ app, initialProfileId }: { app: ApplicationDetail; initialProfileId?: string }) {
  const { isStaffAdmin } = useAdminRoles();
  // The API resolves the applicant's teacher profile from their account; no reference to paste.
  const profileId = app.profileId ?? (initialProfileId && isUuid(initialProfileId) ? initialProfileId : '');

  return (
    <Card>
      <CardHeader title="Teacher profile" description="Safeguarding training and matching readiness are recorded on the teacher profile." />
      <CardBody className="space-y-4">
        {app.status === 'APPROVED' && !app.userId ? (
          <AwaitingTeacherAccount app={app} />
        ) : !app.userId || !profileId ? (
          <Alert tone="neutral">
            No teacher account is linked to this application yet.
            {isStaffAdmin ? ' A super admin can provision one from the Teachers page.' : ''}
          </Alert>
        ) : (
          <>
            {profileId && <TeacherProfileTools key={profileId} profileId={profileId} />}
          </>
        )}
      </CardBody>
    </Card>
  );
}
