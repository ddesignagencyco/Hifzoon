'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Circle, XCircle } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Field,
  PageHeader,
  QueryState,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  UiButton,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useHiringApplication, useRecordHiringStep } from '@/hooks/useHiring';
import { isUuid } from '@/lib/api/modules/crm';
import {
  ApplicationDetail,
  HIRING_STEP_STATUSES,
  HiringStage,
  HiringStepStatus,
  RECORDABLE_STEPS,
  nextActionableStep,
  outstandingSteps,
  sortSteps,
  validateRecordStep,
} from '@/lib/api/modules/teacher-hiring';
import { cn } from '@/lib/utils';
import { DetailList, IdText } from '../shared/AdminUi';
import { TeacherProfileTools } from './TeacherProfileTools';

/** Application detail with step timeline and the record-step form. */
export function ApplicationDetailView({
  applicationId,
  backHref,
  initialProfileId,
}: {
  applicationId: string;
  backHref: string;
  initialProfileId?: string;
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
              actions={<StatusBadge status={app.status} />}
            />
            <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,380px)] items-start">
              <div className="space-y-6 min-w-0">
                <Timeline app={app} />
                <ApplicantInfo app={app} />
              </div>
              <div className="space-y-6">
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
                  <p className="text-sm font-semibold text-ink">{humanize(s.step)}</p>
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
      <span className="text-xs text-muted">Stored privately (no download link from the API yet)</span>
      <IdText id={storageKey} label="file reference" />
    </span>
  );
}

function ApplicantInfo({ app }: { app: ApplicationDetail }) {
  return (
    <Card>
      <CardHeader title="Applicant" />
      <CardBody className="space-y-4">
        <DetailList
          items={[
            ['Email', app.email],
            ['Phone', app.phone ?? '—'],
            ['Country', app.country ?? '—'],
            [
              'Account',
              app.userId ? (
                <span key="u">
                  Created <IdText id={app.userId} label="account reference" />
                </span>
              ) : (
                'Not yet created'
              ),
            ],
          ]}
        />
        {app.qualifications != null && (
          <div>
            <p className="text-xs font-semibold text-muted mb-1">Qualifications</p>
            <Qualifications value={app.qualifications} />
          </div>
        )}
        {app.recitationAudioUrl && (
          <div>
            <p className="text-xs font-semibold text-muted mb-1">Recitation sample</p>
            {isInlineAudio(app.recitationAudioUrl) ? (
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
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-muted mb-1">Documents</p>
          {app.documents.length === 0 ? (
            <p className="text-xs text-muted">No documents uploaded.</p>
          ) : (
            <ul className="space-y-1.5">
              {app.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge>{humanize(d.type)}</Badge>
                  {isHttpUrl(d.fileUrl) ? (
                    <a href={d.fileUrl} target="_blank" rel="noreferrer noopener" className="text-green-700 underline">
                      Open file
                    </a>
                  ) : (
                    <StoredFile storageKey={d.fileUrl} />
                  )}
                  <Badge tone={d.verified ? 'green' : 'amber'}>{d.verified ? 'Verified' : 'Unverified'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
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
          typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'string' ? v : JSON.stringify(v),
        ])}
      />
    );
  }
  return <p className="text-sm text-ink-2">{String(value)}</p>;
}

/** Labels for the qualification keys sent by /apply-teacher. */
const QUALIFICATION_LABELS: Record<string, string> = {
  gender: 'Gender',
  yearsExp: 'Years of teaching experience',
  isHafiz: 'Hafiz / Hafiza',
  hasSanad: 'Holds a sanad / ijazah',
  qiraat: 'Qira’at',
  recitationLink: 'Recitation link',
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
        toast.success(`${humanize(res.step.step)} marked ${humanize(res.step.status).toLowerCase()} — application is ${humanize(res.applicationStatus).toLowerCase()}`);
        setNotes('');
      },
      onError: (err) => toast.error(err),
    });
  };

  const closed = app.status === 'REJECTED';
  return (
    <Card>
      <CardHeader
        title="Record a step"
        description={next ? `Next step: ${humanize(next)}` : 'Every step has been recorded.'}
      />
      <CardBody>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Step" htmlFor="step-select" required>
            <Select id="step-select" value={step} onChange={(e) => setStep(e.target.value as HiringStage)} disabled={closed}>
              {available.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
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
          {status === 'FAILED' && (
            <p className="text-xs text-amber" role="note">
              Failing a step stops the application at that step and removes the teacher from matching.
            </p>
          )}
          <UiButton type="submit" loading={record.isPending} disabled={closed} variant={status === 'FAILED' ? 'danger' : 'primary'} className="w-full">
            Save step
          </UiButton>
        </form>
      </CardBody>
    </Card>
  );
}

function ProfileCard({ app, initialProfileId }: { app: ApplicationDetail; initialProfileId?: string }) {
  const { isStaffAdmin } = useAdminRoles();
  const [draft, setDraft] = useState(initialProfileId ?? '');
  const [profileId, setProfileId] = useState(initialProfileId && isUuid(initialProfileId) ? initialProfileId : '');

  return (
    <Card>
      <CardHeader title="Teacher profile" description="Safeguarding training and matching readiness are recorded on the teacher profile." />
      <CardBody className="space-y-4">
        {!app.userId ? (
          <Alert tone="neutral">
            No teacher account is linked to this application yet.
            {isStaffAdmin ? ' A super admin can provision one from the Teachers page.' : ''}
          </Alert>
        ) : (
          <>
            <form
              className="flex flex-col sm:flex-row sm:items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (isUuid(draft)) setProfileId(draft.trim());
              }}
            >
              <Field
                label="Teacher profile reference"
                htmlFor="profile-id"
                className="flex-1"
                hint="The application does not link to the profile yet. Copy it with “Copy reference” next to the teacher in Users & search (or from the provisioning result on the Teachers page)."
                error={draft && !isUuid(draft) ? 'That is not a valid profile reference.' : null}
              >
                <TextInput id="profile-id" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" />
              </Field>
              <UiButton type="submit" variant="secondary" disabled={!isUuid(draft)}>
                Load
              </UiButton>
            </form>
            {profileId && <TeacherProfileTools key={profileId} profileId={profileId} />}
          </>
        )}
      </CardBody>
    </Card>
  );
}
