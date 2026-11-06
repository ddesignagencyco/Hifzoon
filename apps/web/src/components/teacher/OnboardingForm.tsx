'use client';

import React, { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileText, ImageIcon, Music, Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  TextArea,
  TextInput,
  UiButton,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useSubmitOnboarding, useTeacherOnboarding } from '@/hooks/useTeacherOnboarding';
import { getErrorMessage } from '@/lib/api/http';
import {
  BIO_MAX,
  BIO_MIN,
  ONBOARDING_UPLOAD_RULES,
  bioError,
  isVideoFile,
  onboardingFileError,
  teacherOnboardingApi,
  type OnboardingStatus,
  type OnboardingSubmission,
  type OnboardingUploadKind,
} from '@/lib/api/modules/teacher-onboarding';
import { cn } from '@/lib/utils';

export const ONBOARDING_STEPS = [
  'About you',
  'Photo',
  'Video or recitation',
  'Certificates',
  'Review',
] as const;

interface Uploaded {
  key: string;
  name: string;
  /** Local preview (photos only). */
  preview?: string;
  video?: boolean;
}

interface CertificateRow {
  id: number;
  file: Uploaded | null;
  title: string;
  issuer: string;
  year: string;
}

type Uploader = (kind: OnboardingUploadKind, file: File) => Promise<string>;

/** `/teacher/onboarding` — the one-time profile setup. */
export function OnboardingScreen() {
  const status = useTeacherOnboarding();
  if (status.isLoading) return <LoadingState label="Loading your profile setup…" />;
  if (status.isError || !status.data)
    return <ErrorState error={status.error} onRetry={() => status.refetch()} />;
  if (status.data.complete || !status.data.required) return <OnboardingDone status={status.data} />;
  return <OnboardingForm status={status.data} />;
}

function OnboardingDone({ status }: { status: OnboardingStatus }) {
  const router = useRouter();
  return (
    <Card>
      <CardBody className="space-y-4 text-center py-10">
        <CheckCircle2 className="w-10 h-10 text-green-700 mx-auto" aria-hidden />
        <h1 className="font-fraunces text-2xl text-ink">Your profile is set up</h1>
        <p className="text-sm text-ink-2">
          {status.required
            ? 'Families can now see your profile. Later changes go through Profile in the menu.'
            : 'Profile setup is not required for staff accounts.'}
        </p>
        <UiButton onClick={() => router.replace('/teacher')}>Go to your portal</UiButton>
      </CardBody>
    </Card>
  );
}

export function OnboardingForm({
  status,
  upload = teacherOnboardingApi.upload,
}: {
  status: OnboardingStatus;
  /** Injected in tests. */
  upload?: Uploader;
}) {
  const router = useRouter();
  const toast = useToast();
  const { currentUser } = useAuth();
  const submit = useSubmitOnboarding(currentUser?.id);
  const [step, setStep] = useState(0);
  const [bio, setBio] = useState(status.profile.bio ?? '');
  const [bioTouched, setBioTouched] = useState(false);
  const [photo, setPhoto] = useState<Uploaded | null>(null);
  const [media, setMedia] = useState<Uploaded | null>(null);
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const bioProblem = bioError(bio);
  const last = ONBOARDING_STEPS.length - 1;

  useEffect(
    () => () => {
      if (photo?.preview) URL.revokeObjectURL?.(photo.preview);
    },
    [photo],
  );

  const send = async (
    what: string,
    kind: OnboardingUploadKind,
    file: File,
  ): Promise<string | null> => {
    const problem = onboardingFileError(kind, file);
    if (problem) {
      toast.error(problem);
      return null;
    }
    setBusy(what);
    try {
      return await upload(kind, file);
    } catch (error) {
      toast.error(getErrorMessage(error));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const certificateProblem = certificates.some((c) => !c.file || c.title.trim() === '')
    ? 'Give each certificate a file and a title, or remove it.'
    : certificates.some((c) => c.year !== '' && !/^(19|20)\d{2}$/.test(c.year))
      ? 'Enter the year as four digits, e.g. 2019.'
      : null;

  const next = () => {
    if (step === 0 && bioProblem) {
      setBioTouched(true);
      toast.error(bioProblem);
      return;
    }
    if (step === 3 && certificateProblem) {
      toast.error(certificateProblem);
      return;
    }
    setStep((s) => Math.min(last, s + 1));
  };

  const onSubmit = () => {
    if (bioProblem) {
      setStep(0);
      setBioTouched(true);
      toast.error(bioProblem);
      return;
    }
    if (certificateProblem) {
      setStep(3);
      toast.error(certificateProblem);
      return;
    }
    const body: OnboardingSubmission = {
      bio: bio.trim(),
      ...(photo ? { photoKey: photo.key } : {}),
      ...(media
        ? media.video
          ? { introVideoKey: media.key }
          : { recitationSampleKey: media.key }
        : {}),
      ...(certificates.length > 0
        ? {
            certificates: certificates.map((c) => ({
              key: c.file!.key,
              title: c.title.trim(),
              ...(c.issuer.trim() ? { issuer: c.issuer.trim() } : {}),
              ...(c.year ? { year: Number(c.year) } : {}),
            })),
          }
        : {}),
    };
    submit.mutate(body, {
      onSuccess: () => {
        toast.success('Your profile is set up. Welcome to Hifzoon!');
        router.replace('/teacher');
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    });
  };

  const p = status.profile;
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Welcome to Hifzoon"
        title="Set up your teacher profile"
        description="This is a one-time step. Families read your profile before booking, so it opens the rest of your portal."
      />

      <ol aria-label="Profile setup steps" className="flex flex-wrap gap-2">
        {ONBOARDING_STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => (i <= step ? setStep(i) : undefined)}
              aria-current={i === step ? 'step' : undefined}
              disabled={i > step}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold border',
                i === step
                  ? 'bg-green-800 text-white border-green-800'
                  : i < step
                    ? 'bg-green-50 text-green-800 border-green-200 cursor-pointer'
                    : 'bg-white text-muted border-line',
              )}
            >
              {i + 1}. {label}
              {i > 0 && i < last ? ' (optional)' : ''}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <CardHeader
            title="About you"
            description="Required. Write to the parents who will read it."
          />
          <CardBody className="space-y-4">
            <Field
              label="Your bio"
              htmlFor="onboarding-bio"
              required
              error={bioTouched ? bioProblem : null}
              hint={`${bio.trim().length} / ${BIO_MAX} characters (at least ${BIO_MIN})`}
            >
              <TextArea
                id="onboarding-bio"
                rows={8}
                value={bio}
                maxLength={BIO_MAX + 200}
                onChange={(e) => setBio(e.target.value)}
                onBlur={() => setBioTouched(true)}
                aria-invalid={bioTouched && Boolean(bioProblem)}
                placeholder="Assalamu alaikum, I am …"
              />
            </Field>
            <div className="rounded-xl bg-sand px-4 py-3 text-xs text-ink-2 space-y-1">
              <p className="font-semibold text-ink">A few ideas to cover</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Where you learned, and your ijazah or sanad if you hold one.</li>
                <li>How many years you have taught, and which ages.</li>
                <li>How you make lessons calm, patient and encouraging for children.</li>
                <li>What families can expect in the first few weeks.</li>
              </ul>
            </div>
            <div className="text-xs text-muted">
              From your application (changes go through Profile after setup):{' '}
              {[
                p.languages.length ? `teaches in ${p.languages.join(', ')}` : null,
                p.subjects.length ? p.subjects.map((s) => humanize(s)).join(', ') : null,
                p.ageGroups.length ? `ages ${p.ageGroups.join(', ')}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'none recorded'}
            </div>
          </CardBody>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader
            title="Profile photo"
            description="Optional. A clear, friendly headshot helps families feel at ease. Without one your initial is shown."
          />
          <CardBody className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="relative w-24 h-24 rounded-full overflow-hidden bg-sand border border-line flex items-center justify-center shrink-0">
                {photo?.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview (blob: URL)
                  <img
                    src={photo.preview}
                    alt="Your photo preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon className="w-8 h-8 text-muted" aria-hidden />
                )}
              </span>
              <div className="space-y-2">
                <FilePicker
                  label={photo ? 'Choose a different photo' : 'Upload a photo'}
                  accept={ONBOARDING_UPLOAD_RULES.photo.accept}
                  busy={busy === 'photo'}
                  onPick={async (file) => {
                    const key = await send('photo', 'photo', file);
                    if (!key) return;
                    const preview =
                      typeof URL.createObjectURL === 'function'
                        ? URL.createObjectURL(file)
                        : undefined;
                    setPhoto({ key, name: file.name, preview });
                  }}
                />
                <p className="text-[11px] text-muted">
                  {ONBOARDING_UPLOAD_RULES.photo.label}. No links: upload the file.
                </p>
                {photo && (
                  <UiButton size="sm" variant="ghost" onClick={() => setPhoto(null)}>
                    Remove photo
                  </UiButton>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader
            title="Intro video or recitation"
            description="Optional. A short introduction video, or a recitation sample, lets families hear you before a trial."
          />
          <CardBody className="space-y-3">
            {media && (
              <p className="flex items-center gap-2 text-sm text-ink">
                <Music className="w-4 h-4 text-green-700" aria-hidden />
                {media.name} ({media.video ? 'intro video' : 'recitation sample'})
              </p>
            )}
            <FilePicker
              label={media ? 'Choose a different file' : 'Upload a video or recitation'}
              accept={ONBOARDING_UPLOAD_RULES.media.accept}
              busy={busy === 'media'}
              onPick={async (file) => {
                const key = await send('media', 'media', file);
                if (key) setMedia({ key, name: file.name, video: isVideoFile(file) });
              }}
            />
            <p className="text-[11px] text-muted">{ONBOARDING_UPLOAD_RULES.media.label}.</p>
            {media && (
              <UiButton size="sm" variant="ghost" onClick={() => setMedia(null)}>
                Remove file
              </UiButton>
            )}
          </CardBody>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader
            title="Certificates to show families"
            description="Optional. Your documents were already checked during hiring, and verified certificates from your application are added for you. Add any others you would like families to see."
          />
          <CardBody className="space-y-4">
            {p.certificates.length > 0 && (
              <ul className="text-sm text-ink-2 space-y-1">
                {p.certificates.map((c, i) => (
                  <li key={`${c.title}-${i}`} className="flex items-center gap-2">
                    <FileText className="w-4 h-4" aria-hidden /> {c.title}
                    {c.issuer ? ` · ${c.issuer}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {certificates.map((row, index) => (
              <CertificateEditor
                key={row.id}
                row={row}
                index={index}
                busy={busy === `certificate-${row.id}`}
                onChange={(patch) =>
                  setCertificates((list) =>
                    list.map((c) => (c.id === row.id ? { ...c, ...patch } : c)),
                  )
                }
                onRemove={() => setCertificates((list) => list.filter((c) => c.id !== row.id))}
                onPick={async (file) => {
                  const key = await send(`certificate-${row.id}`, 'certificate', file);
                  if (key) {
                    setCertificates((list) =>
                      list.map((c) =>
                        c.id === row.id
                          ? {
                              ...c,
                              file: { key, name: file.name },
                              title: c.title || file.name.replace(/\.[^.]+$/, ''),
                            }
                          : c,
                      ),
                    );
                  }
                }}
              />
            ))}
            {certificates.length < 10 && (
              <UiButton
                variant="secondary"
                size="sm"
                icon={<Plus className="w-4 h-4" aria-hidden />}
                onClick={() =>
                  setCertificates((list) => [
                    ...list,
                    { id: Date.now() + list.length, file: null, title: '', issuer: '', year: '' },
                  ])
                }
              >
                Add a certificate
              </UiButton>
            )}
          </CardBody>
        </Card>
      )}

      {step === last && (
        <Card>
          <CardHeader
            title="Review and submit"
            description="You can change these later from Profile; later changes are reviewed by the academy."
          />
          <CardBody className="space-y-3 text-sm">
            <ReviewRow label="Bio" value={`${bio.trim().length} characters`} ok={!bioProblem} />
            <ReviewRow
              label="Photo"
              value={photo ? photo.name : 'Not added (your initial is shown)'}
              ok={Boolean(photo)}
              optional
            />
            <ReviewRow
              label="Video or recitation"
              value={media ? media.name : 'Not added'}
              ok={Boolean(media)}
              optional
            />
            <ReviewRow
              label="Certificates"
              value={
                certificates.length > 0
                  ? certificates.map((c) => c.title).join(', ')
                  : 'None added here (verified hiring certificates are added for you)'
              }
              ok={certificates.length > 0}
              optional
            />
            {submit.isError && <Alert tone="error">{getErrorMessage(submit.error)}</Alert>}
          </CardBody>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3">
        <UiButton
          variant="secondary"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </UiButton>
        {step < last ? (
          <UiButton onClick={next} disabled={busy !== null}>
            {step > 0 ? 'Next (or skip)' : 'Next'}
          </UiButton>
        ) : (
          <UiButton onClick={onSubmit} loading={submit.isPending} disabled={busy !== null}>
            Submit profile
          </UiButton>
        )}
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  ok,
  optional,
}: {
  label: string;
  value: string;
  ok: boolean;
  optional?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line pb-2">
      <span className="font-semibold text-ink">
        {label}
        {optional ? <span className="font-normal text-muted"> (optional)</span> : null}
      </span>
      <span className={cn('text-right', ok ? 'text-ink-2' : optional ? 'text-muted' : 'text-red')}>
        {value}
      </span>
    </div>
  );
}

function FilePicker({
  label,
  accept,
  busy,
  onPick,
}: {
  label: string;
  accept: string;
  busy: boolean;
  onPick: (file: File) => void | Promise<void>;
}) {
  const id = useId();
  return (
    <span className="inline-flex items-center gap-2">
      <label
        htmlFor={id}
        className={cn(
          'inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-ink cursor-pointer hover:bg-sand',
          busy && 'opacity-60 pointer-events-none',
        )}
      >
        {busy ? 'Uploading…' : label}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={label}
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void onPick(file);
        }}
      />
    </span>
  );
}

function CertificateEditor({
  row,
  index,
  busy,
  onChange,
  onRemove,
  onPick,
}: {
  row: CertificateRow;
  index: number;
  busy: boolean;
  onChange: (patch: Partial<CertificateRow>) => void;
  onRemove: () => void;
  onPick: (file: File) => void | Promise<void>;
}) {
  const n = index + 1;
  return (
    <fieldset className="rounded-xl border border-line p-4 space-y-3">
      <legend className="px-1 text-xs font-semibold text-ink-2">Certificate {n}</legend>
      <div className="flex flex-wrap items-center gap-3">
        <FilePicker
          label={
            row.file ? `Replace file for certificate ${n}` : `Upload file for certificate ${n}`
          }
          accept={ONBOARDING_UPLOAD_RULES.certificate.accept}
          busy={busy}
          onPick={onPick}
        />
        {row.file && <span className="text-xs text-ink-2">{row.file.name}</span>}
      </div>
      <p className="text-[11px] text-muted">{ONBOARDING_UPLOAD_RULES.certificate.label}.</p>
      <div className="grid sm:grid-cols-[2fr_2fr_1fr] gap-3">
        <Field label="Title" htmlFor={`cert-title-${row.id}`} required>
          <TextInput
            id={`cert-title-${row.id}`}
            value={row.title}
            maxLength={160}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Ijazah in Hafs"
          />
        </Field>
        <Field label="Issuer" htmlFor={`cert-issuer-${row.id}`}>
          <TextInput
            id={`cert-issuer-${row.id}`}
            value={row.issuer}
            maxLength={160}
            onChange={(e) => onChange({ issuer: e.target.value })}
          />
        </Field>
        <Field label="Year" htmlFor={`cert-year-${row.id}`}>
          <TextInput
            id={`cert-year-${row.id}`}
            inputMode="numeric"
            value={row.year}
            maxLength={4}
            onChange={(e) => onChange({ year: e.target.value.replace(/\D/g, '') })}
          />
        </Field>
      </div>
      <UiButton
        size="sm"
        variant="ghost"
        icon={<Trash2 className="w-4 h-4" aria-hidden />}
        onClick={onRemove}
      >
        Remove certificate {n}
      </UiButton>
    </fieldset>
  );
}
