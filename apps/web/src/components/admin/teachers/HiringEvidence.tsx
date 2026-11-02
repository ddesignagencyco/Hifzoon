'use client';

import React, { useState } from 'react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Field,
  Select,
  TextInput,
  UiButton,
  formatDate,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useHiringEvidence } from '@/hooks/useHiring';
import { uploadFile, validateUpload } from '@/lib/api/modules/uploads';
import {
  ApplicationDetail,
  ApplicationDocument,
  HiringReference,
  ReferenceInput,
  ReferenceOutcome,
  teacherHiringApi,
} from '@/lib/api/modules/teacher-hiring';

/**
 * The evidence each hiring step rests on. A step can only be passed once its evidence is
 * here: documents someone actually looked at, a referee who confirmed, and the applicant's
 * own pass of the training course. (The demo step rests on the live interview.)
 */
function isLocked(app: ApplicationDetail) {
  return app.status === 'APPROVED' || app.status === 'REJECTED';
}

/** Why a file cannot be uploaded as an application document, or null when it can. */
function documentProblem(file: File): string | null {
  try {
    validateUpload('APPLICATION_DOCUMENT', file);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'This file cannot be uploaded.';
  }
}

// ── Documents ────────────────────────────────────────────────────────────────

const ATTACHABLE = ['ID', 'CERTIFICATE', 'BACKGROUND_CHECK'] as const;

function docLabel(type: string) {
  return type === 'ID' ? 'Photo ID' : type === 'CERTIFICATE' ? 'Ijazah / certificate' : humanize(type);
}

export function DocumentsCard({ app }: { app: ApplicationDetail }) {
  const locked = isLocked(app);
  return (
    <Card>
      <CardHeader title="Documents" description="Open each file and verify it, or refuse it with a reason. The identity check passes only on a verified photo ID." />
      <CardBody className="space-y-3">
        {app.documents.length === 0 && <p className="text-xs text-muted">No documents uploaded.</p>}
        {app.documents.map((d) => (
          <DocumentRow key={d.id} app={app} doc={d} locked={locked} />
        ))}
        {!locked && <AttachDocument app={app} />}
      </CardBody>
    </Card>
  );
}

function DocumentRow({ app, doc, locked }: { app: ApplicationDetail; doc: ApplicationDocument; locked: boolean }) {
  const toast = useToast();
  const review = useHiringEvidence(app.id, (body: { verified: boolean; note?: string }) =>
    teacherHiringApi.reviewDocument(app.id, doc.id, body),
  );
  const [preview, setPreview] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [note, setNote] = useState('');
  const url = doc.downloadUrl ?? (/^https?:\/\//i.test(doc.fileUrl) ? doc.fileUrl : null);
  const isPdf = /\.pdf$/i.test(doc.fileUrl);

  const submit = (verified: boolean) => {
    if (!verified && !note.trim()) return toast.error('Say why the document is refused.');
    review.mutate(
      { verified, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(verified ? `${docLabel(doc.type)} verified.` : `${docLabel(doc.type)} refused.`);
          setRefusing(false);
          setNote('');
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <div className="rounded-xl border border-line p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-ink">{docLabel(doc.type)}</span>
        <Badge tone={doc.verified ? 'green' : doc.rejected ? 'red' : 'amber'}>
          {doc.verified ? 'Verified' : doc.rejected ? 'Refused' : 'Not reviewed'}
        </Badge>
        {url && (
          <>
            <button type="button" onClick={() => setPreview((p) => !p)} className="text-xs text-green-700 underline">
              {preview ? 'Hide preview' : 'Preview'}
            </button>
            <a href={url} target="_blank" rel="noreferrer noopener" className="text-xs text-green-700 underline">
              Open file ↗
            </a>
          </>
        )}
      </div>
      {doc.reviewedAt && (
        <p className="text-[11px] text-muted">
          {doc.verified ? 'Verified' : 'Refused'} {formatDateTime(doc.reviewedAt)}
          {doc.reviewedByName ? ` by ${doc.reviewedByName}` : ''}
          {doc.reviewNote ? ` — ${doc.reviewNote}` : ''}
        </p>
      )}
      {preview && url && (
        <div className="rounded-lg border border-line bg-cream overflow-hidden">
          {isPdf ? (
            <iframe src={url} title={`${docLabel(doc.type)} preview`} className="w-full h-[420px]" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link, not a static asset
            <img src={url} alt={`${docLabel(doc.type)} uploaded by the applicant`} className="max-h-[420px] mx-auto" />
          )}
        </div>
      )}
      {!locked && (
        <div className="flex flex-wrap items-end gap-2">
          {!doc.verified && (
            <UiButton size="sm" loading={review.isPending && !refusing} onClick={() => submit(true)}>
              Verify
            </UiButton>
          )}
          {refusing ? (
            <>
              <TextInput aria-label="Reason for refusing" placeholder="Reason (e.g. blurred, name does not match)" value={note} onChange={(e) => setNote(e.target.value)} className="min-w-[240px] flex-1" />
              <UiButton size="sm" variant="danger" loading={review.isPending} onClick={() => submit(false)}>
                Refuse
              </UiButton>
              <UiButton size="sm" variant="ghost" onClick={() => setRefusing(false)}>
                Back
              </UiButton>
            </>
          ) : (
            !doc.rejected && (
              <UiButton size="sm" variant="secondary" onClick={() => setRefusing(true)}>
                Refuse…
              </UiButton>
            )
          )}
        </div>
      )}
    </div>
  );
}

function AttachDocument({ app }: { app: ApplicationDetail }) {
  const toast = useToast();
  const attach = useHiringEvidence(app.id, async ({ type, file }: { type: string; file: File }) => {
    const key = await uploadFile('APPLICATION_DOCUMENT', file);
    return teacherHiringApi.attachDocument(app.id, { type, key });
  });
  const [type, setType] = useState<string>('ID');
  const [file, setFile] = useState<File | null>(null);
  // Remounts the file input after an upload, so the chosen file name does not linger.
  const [inputKey, setInputKey] = useState(0);

  const submit = () => {
    if (!file) return toast.error('Choose a PDF, JPG or PNG file.');
    const problem = documentProblem(file);
    if (problem) return toast.error(problem);
    attach.mutate(
      { type, file },
      {
        onSuccess: () => {
          toast.success(`${docLabel(type)} attached. Review it before passing the identity check.`);
          setFile(null);
          setInputKey((k) => k + 1);
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <div className="flex flex-wrap items-end gap-2 pt-1">
      <Field label="Attach a document" htmlFor="attach-type">
        <Select id="attach-type" value={type} onChange={(e) => setType(e.target.value)} className="min-w-[200px]">
          {ATTACHABLE.map((t) => (
            <option key={t} value={t}>
              {docLabel(t)}
            </option>
          ))}
        </Select>
      </Field>
      <input
        key={inputKey}
        type="file"
        aria-label="Document file"
        accept="application/pdf,image/jpeg,image/png"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-xs"
      />
      <UiButton size="sm" variant="secondary" loading={attach.isPending} onClick={submit}>
        Upload
      </UiButton>
    </div>
  );
}

// ── References ───────────────────────────────────────────────────────────────

const OUTCOME_TONE: Record<ReferenceOutcome, 'green' | 'red' | 'amber' | 'neutral'> = {
  PENDING: 'amber',
  CONFIRMED: 'green',
  DECLINED: 'red',
  UNREACHABLE: 'neutral',
};

export function ReferencesCard({ app }: { app: ApplicationDetail }) {
  const locked = isLocked(app);
  const refs = app.references ?? [];
  const [adding, setAdding] = useState(false);
  return (
    <Card>
      <CardHeader title="References" description="Contact each referee and note what they said. The reference check passes once at least one confirms." />
      <CardBody className="space-y-3">
        {refs.length === 0 && <p className="text-xs text-muted">No referees on this application.</p>}
        {refs.map((r) => (
          <ReferenceRow key={r.id} app={app} reference={r} locked={locked} />
        ))}
        {!locked &&
          (adding ? (
            <AddReferenceForm app={app} onDone={() => setAdding(false)} />
          ) : (
            <UiButton size="sm" variant="secondary" onClick={() => setAdding(true)}>
              Add referee
            </UiButton>
          ))}
      </CardBody>
    </Card>
  );
}

function ReferenceRow({ app, reference, locked }: { app: ApplicationDetail; reference: HiringReference; locked: boolean }) {
  const toast = useToast();
  const record = useHiringEvidence(app.id, (body: { outcome: Exclude<ReferenceOutcome, 'PENDING'>; notes: string }) =>
    teacherHiringApi.recordReference(app.id, reference.id, body),
  );
  const [outcome, setOutcome] = useState<Exclude<ReferenceOutcome, 'PENDING'>>('CONFIRMED');
  const [notes, setNotes] = useState('');

  const submit = () => {
    if (!notes.trim()) return toast.error('Note what the referee said.');
    record.mutate(
      { outcome, notes: notes.trim() },
      {
        onSuccess: () => {
          toast.success(`Reference from ${reference.name} recorded.`);
          setNotes('');
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <div className="rounded-xl border border-line p-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">{reference.name}</span>
        <span className="text-xs text-muted">{reference.relationship}</span>
        <Badge tone={OUTCOME_TONE[reference.outcome]}>{humanize(reference.outcome)}</Badge>
      </div>
      <p className="text-xs text-ink-2">{[reference.email, reference.phone].filter(Boolean).join(' · ')}</p>
      {reference.checkedAt && (
        <p className="text-[11px] text-muted">
          Checked {formatDateTime(reference.checkedAt)}
          {reference.checkedByName ? ` by ${reference.checkedByName}` : ''}
          {reference.notes ? ` — ${reference.notes}` : ''}
        </p>
      )}
      {!locked && (
        <div className="flex flex-wrap items-end gap-2">
          <Select aria-label={`Outcome for ${reference.name}`} value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} className="w-auto">
            <option value="CONFIRMED">Confirmed</option>
            <option value="DECLINED">Declined / concerns</option>
            <option value="UNREACHABLE">Could not reach</option>
          </Select>
          <TextInput aria-label={`What ${reference.name} said`} placeholder="What they said" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-w-[220px] flex-1" />
          <UiButton size="sm" loading={record.isPending} onClick={submit}>
            Save
          </UiButton>
        </div>
      )}
    </div>
  );
}

function AddReferenceForm({ app, onDone }: { app: ApplicationDetail; onDone: () => void }) {
  const toast = useToast();
  const add = useHiringEvidence(app.id, (body: ReferenceInput) => teacherHiringApi.addReference(app.id, body));
  const [ref, setRef] = useState<ReferenceInput>({ name: '', relationship: '', email: '', phone: '' });
  const set = (k: keyof ReferenceInput) => (e: React.ChangeEvent<HTMLInputElement>) => setRef((r) => ({ ...r, [k]: e.target.value }));

  const submit = () => {
    if (ref.name.trim().length < 2 || ref.relationship.trim().length < 2) return toast.error('Give the referee’s name and how they know the applicant.');
    if (!ref.email?.trim() && !ref.phone?.trim()) return toast.error('Give an email or phone number for the referee.');
    add.mutate(
      { name: ref.name.trim(), relationship: ref.relationship.trim(), email: ref.email?.trim() || undefined, phone: ref.phone?.trim() || undefined },
      { onSuccess: () => { toast.success('Referee added.'); onDone(); }, onError: (err) => toast.error(err) },
    );
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2 rounded-xl border border-dashed border-line p-3">
      <TextInput aria-label="Referee name" placeholder="Name" value={ref.name} onChange={set('name')} />
      <TextInput aria-label="Relationship" placeholder="Relationship (e.g. former principal)" value={ref.relationship} onChange={set('relationship')} />
      <TextInput aria-label="Referee email" type="email" placeholder="Email" value={ref.email} onChange={set('email')} />
      <TextInput aria-label="Referee phone" type="tel" placeholder="Phone" value={ref.phone} onChange={set('phone')} />
      <div className="sm:col-span-2 flex gap-2">
        <UiButton size="sm" loading={add.isPending} onClick={submit}>Add referee</UiButton>
        <UiButton size="sm" variant="ghost" onClick={onDone}>Cancel</UiButton>
      </div>
    </div>
  );
}

// ── Training ─────────────────────────────────────────────────────────────────

const TRAINING_STATUS: Record<string, { label: string; tone: 'green' | 'red' | 'amber' | 'blue' | 'neutral' }> = {
  SENT: { label: 'Link sent', tone: 'blue' },
  IN_PROGRESS: { label: 'In progress', tone: 'amber' },
  PASSED: { label: 'Verified: passed', tone: 'green' },
  LOCKED: { label: 'All attempts used', tone: 'red' },
};

/**
 * The training step's evidence is the applicant's own work: they read every module,
 * accept the teacher terms and pass a quiz graded on the server. Nobody types a date in.
 * The link goes out by itself when the reference check passes; it can be re-sent here.
 */
export function TrainingCard({ app }: { app: ApplicationDetail }) {
  const toast = useToast();
  const t = app.training ?? null;
  const send = useHiringEvidence(app.id, () => teacherHiringApi.sendTrainingLink(app.id));
  const [link, setLink] = useState<string | null>(null);
  const canSend = !isLocked(app) && t?.status !== 'PASSED' && t?.status !== 'LOCKED';
  const status = t ? TRAINING_STATUS[t.status] : null;

  return (
    <Card>
      <CardHeader
        title="Training"
        description="The applicant reads the teacher terms, safeguarding, online boundaries, reporting, platform and standards modules, accepts the terms and passes a quiz. Only a pass verifies the training step."
      />
      <CardBody className="space-y-3">
        {!t ? (
          <p className="text-xs text-muted">
            {app.status === 'TRAINING'
              ? 'The training link has not been sent yet.'
              : 'The link is emailed automatically when the reference check passes.'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {status && <Badge tone={status.tone}>{status.label}</Badge>}
              <span className="text-xs text-muted">
                Sent {formatDateTime(t.sentAt)} · link valid until {formatDate(t.linkExpiresAt)} · course {t.courseVersion}
              </span>
            </div>
            <ul className="text-sm text-ink-2 space-y-1">
              <li>
                Modules read: <strong>{t.modulesRead} of {t.modulesTotal}</strong>
              </li>
              <li>
                Teacher terms:{' '}
                {t.termsAcceptedAt ? (
                  <strong>accepted {formatDateTime(t.termsAcceptedAt)} ({t.termsVersion})</strong>
                ) : (
                  'not accepted yet'
                )}
              </li>
              <li>
                Quiz: {t.attempts.length} of {t.maxAttempts} attempts used · pass mark {t.passMark}%
                {t.bestScore !== null ? ` · best ${t.bestScore}%` : ''}
              </li>
              {t.passedAt && (
                <li>
                  Passed <strong>{formatDateTime(t.passedAt)}</strong>. The safeguarding date carries over to the teacher profile on
                  approval.
                </li>
              )}
            </ul>
            {t.attempts.length > 0 && (
              <ol className="text-xs text-ink-2 space-y-0.5 list-decimal ml-4">
                {t.attempts.map((a, i) => (
                  <li key={i}>
                    {a.score}/{a.total} ({a.percent}%) {a.passed ? '— passed' : '— below the pass mark'}
                    {a.submittedAt ? `, ${formatDateTime(a.submittedAt)}` : ''}
                  </li>
                ))}
              </ol>
            )}
            {t.status === 'LOCKED' && (
              <Alert tone="warning">
                Every attempt is used without a pass. Decide the training step: fail it, or talk to the applicant first.
              </Alert>
            )}
          </>
        )}
        {canSend && (
          <UiButton
            size="sm"
            variant={t ? 'secondary' : 'primary'}
            loading={send.isPending}
            onClick={() =>
              send.mutate(undefined, {
                onSuccess: (res) => {
                  setLink((res as { trainingUrl?: string })?.trainingUrl ?? null);
                  toast.success(t ? 'A new link was emailed; the old one no longer works.' : 'Training link emailed.');
                },
                onError: (err) => toast.error(err),
              })
            }
          >
            {t ? 'Re-send link' : 'Send training link'}
          </UiButton>
        )}
        {link && (
          <p className="text-[11px] text-muted break-all">
            If the email does not arrive, share this link with the applicant directly (shown once): {link}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
