'use client';

import React, { useState } from 'react';
import { CalendarPlus, Pause, Play, Plus, Repeat, XCircle } from 'lucide-react';
import {
  Alert,
  EmptyState,
  Field,
  Modal,
  QueryState,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  UiButton,
  formatDate,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  useCourseCatalogue,
  useCreateEnrolment,
  useNextLesson,
  useRequestTeacherChange,
  useMyTeacherChanges,
  useStudentEnrolments,
  useTeacherRating,
  useUpdateEnrolmentStatus,
} from '@/hooks/useParentEnrolments';
import { useStudentConsent } from '@/hooks/useFamilyConsent';
import { useTrialOffers } from '@/hooks/useBilling';
import { hasRequiredConsent } from '@/lib/api/modules/consent';
import { EnrolmentRecord, isLiveEnrolment, objectivesList } from '@/lib/api/modules/enrolments';
import { latestTeacherChangeFor, validateTeacherChangeReason } from '@/lib/api/modules/admissions-guardian';
import { BookClassModal } from './ClassModals';
import { StarsDisplay } from './shared';
import { BookTrialLink } from './TrialOptions';

type Action =
  | { kind: 'pause' | 'cancel' | 'resume' | 'change' | 'book'; enrolment: EnrolmentRecord }
  | { kind: 'enrol' }
  | null;

/** Live enrolments with a teacher are the ones a family can ask to move to a different teacher. */
function canChangeTeacher(e: EnrolmentRecord): boolean {
  return (e.status === 'ACTIVE' || e.status === 'TRIAL') && Boolean(e.teacher);
}

/**
 * Courses tab: enrolments with next lesson, pause/resume/cancel, booking and teacher change.
 * `initialChangeId` (from `?change=<enrolmentId>`, e.g. the Overview's "Change teacher" link)
 * opens the teacher-change dialog for that enrolment once the data has loaded.
 */
export function ChildCourses({
  studentId,
  familyId,
  displayName,
  initialChangeId = null,
}: {
  studentId: string;
  familyId: string;
  displayName: string;
  initialChangeId?: string | null;
}) {
  const enrolments = useStudentEnrolments(studentId);
  const consent = useStudentConsent(studentId);
  const consentOk = hasRequiredConsent(consent.data);
  const changes = useMyTeacherChanges();
  const [action, setAction] = useState<Action>(null);
  const [deepLinkChange, setDeepLinkChange] = useState<string | null>(initialChangeId);
  // Resolve the deep link only once both lists are settled, and never over an already-open request.
  const deepLinked =
    deepLinkChange && !changes.isLoading
      ? (enrolments.data ?? []).find(
          (e) =>
            e.id === deepLinkChange &&
            canChangeTeacher(e) &&
            latestTeacherChangeFor(changes.data, e.id)?.status !== 'OPEN',
        )
      : undefined;
  const current: Action = action ?? (deepLinked ? { kind: 'change', enrolment: deepLinked } : null);
  const close = () => {
    setAction(null);
    if (deepLinkChange) {
      setDeepLinkChange(null);
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('change');
        window.history.replaceState(null, '', url.toString());
      } catch {
        // Non-critical: the param just stays in the address bar.
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Courses {displayName} is enrolled in.</p>
        <UiButton size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAction({ kind: 'enrol' })}>
          Start a course
        </UiButton>
      </div>
      {consent.data && !consentOk && (
        <Alert tone="warning" title="Consent needed before booking">
          Classes can’t be booked until consent for lesson records is given in the Consent tab.
        </Alert>
      )}
      <QueryState
        query={enrolments}
        empty={
          <EmptyState
            title="No courses yet"
            description={`Start with a free trial: book one yourself, or ask the academy to choose a teacher for ${displayName}.`}
          />
        }
      >
        {(rows) => (
          <ul className="space-y-3">
            {rows.map((e) => (
              <EnrolmentItem key={e.id} enrolment={e} consentOk={consentOk} onAction={(kind) => setAction({ kind, enrolment: e })} />
            ))}
          </ul>
        )}
      </QueryState>

      {current?.kind === 'enrol' && <EnrolModal studentId={studentId} displayName={displayName} onClose={close} />}
      {current && current.kind !== 'enrol' && current.kind !== 'book' && current.kind !== 'change' && (
        <StatusModal kind={current.kind} enrolment={current.enrolment} onClose={close} />
      )}
      {current?.kind === 'change' && <TeacherChangeModal familyId={familyId} enrolment={current.enrolment} onClose={close} />}
      {current?.kind === 'book' && <BookClassModal enrolment={current.enrolment} onClose={close} />}
    </div>
  );
}

function EnrolmentItem({
  enrolment: e,
  consentOk,
  onAction,
}: {
  enrolment: EnrolmentRecord;
  consentOk: boolean;
  onAction: (kind: 'pause' | 'cancel' | 'resume' | 'change' | 'book') => void;
}) {
  const live = isLiveEnrolment(e.status);
  const teachable = canChangeTeacher(e);
  const changes = useMyTeacherChanges();
  // Latest request for this enrolment (the API stores the enrolment it was raised against).
  const change = latestTeacherChangeFor(changes.data, e.id);
  const changeOpen = change?.status === 'OPEN';
  // A regular class needs a paid plan, which a trial does not have yet.
  const bookable = teachable && e.status === 'ACTIVE';
  return (
    <li className="rounded-xl border border-line p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{e.course.name}</p>
          <p className="text-xs text-muted">
            {e.currentLevel ? `${e.currentLevel.name} · lesson ${e.currentLessonPosition}` : `Lesson ${e.currentLessonPosition}`}
            {e.startedAt ? ` · since ${formatDate(e.startedAt)}` : ''}
          </p>
        </div>
        <StatusBadge status={e.status} />
      </div>
      {e.status === 'PAUSED' && e.pausedUntil && <p className="text-xs text-amber">Paused until {formatDate(e.pausedUntil)}</p>}
      {change && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
          Teacher change requested {formatDate(change.createdAt)} <StatusBadge status={change.status} />
          {change.resolvedAt && <span className="text-muted">· {formatDate(change.resolvedAt)}</span>}
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg bg-cream px-3 py-2">
          <p className="text-[11px] text-muted">Teacher</p>
          {e.teacher ? (
            <>
              <p className="text-sm text-ink">{e.teacher.user.name}</p>
              <TeacherRatingLine teacherId={e.teacher.id} />
            </>
          ) : (
            <p className="text-sm text-muted">Not assigned yet.</p>
          )}
        </div>
        <div className="rounded-lg bg-cream px-3 py-2">
          <p className="text-[11px] text-muted">Next lesson</p>
          {live ? <NextLessonDetail enrolmentId={e.id} /> : <p className="text-sm text-muted">—</p>}
        </div>
      </div>
      {e.status === 'TRIAL' && <TrialNextStep enrolment={e} />}
      {live && (
        <div className="flex flex-wrap gap-2">
          {bookable && (
            <UiButton
              size="sm"
              icon={<CalendarPlus className="w-3.5 h-3.5" />}
              onClick={() => onAction('book')}
              disabled={!consentOk}
              title={consentOk ? undefined : 'Consent for lesson records is required first'}
            >
              Book a class
            </UiButton>
          )}
          {e.status === 'PAUSED' ? (
            <UiButton variant="secondary" size="sm" icon={<Play className="w-3.5 h-3.5" />} onClick={() => onAction('resume')}>
              Resume
            </UiButton>
          ) : (
            <UiButton variant="secondary" size="sm" icon={<Pause className="w-3.5 h-3.5" />} onClick={() => onAction('pause')}>
              Pause
            </UiButton>
          )}
          {teachable && (
            <UiButton
              variant="secondary"
              size="sm"
              icon={<Repeat className="w-3.5 h-3.5" />}
              onClick={() => onAction('change')}
              disabled={changeOpen}
              title={changeOpen ? 'A request is already open — the academy will get back to you' : undefined}
            >
              {changeOpen ? 'Change requested' : 'Change teacher'}
            </UiButton>
          )}
          <UiButton variant="ghost" size="sm" icon={<XCircle className="w-3.5 h-3.5" />} onClick={() => onAction('cancel')}>
            Cancel course
          </UiButton>
        </div>
      )}
    </li>
  );
}

/**
 * Where a trial stands and what comes next: the trial class, the teacher's result, then a
 * plan and weekly times. A won trial's offer is the way on, so it is linked here.
 */
function TrialNextStep({ enrolment: e }: { enrolment: EnrolmentRecord }) {
  const offers = useTrialOffers();
  const offer = (offers.data ?? []).find((o) => o.enrolmentId === e.id);
  if (offer) {
    return (
      <Alert tone="success" title="The trial went well">
        <p>Choose a plan and weekly times with {offer.teacher?.name ?? 'the teacher'}, then pay to start.</p>
        <a href={`/parent/continue/${encodeURIComponent(offer.trialOutcomeId)}`} className="mt-1 inline-block font-semibold underline">
          Choose a plan
        </a>
      </Alert>
    );
  }
  if (!e.teacher) {
    return (
      <div className="rounded-lg border border-line px-3 py-2 space-y-2">
        <p className="text-xs text-ink-2">
          The academy is choosing a teacher and will book the trial time; you’ll be notified. Prefer to pick a teacher and time
          now? Book the trial yourself.
        </p>
        <BookTrialLink studentId={e.student.id} courseCode={e.course.code} size="sm" />
      </div>
    );
  }
  return (
    <p className="text-xs text-ink-2">
      Next: the trial class with {e.teacher.user.name}, then the teacher’s result. After a good trial you choose a plan and weekly
      times and pay here.
    </p>
  );
}

function TeacherRatingLine({ teacherId }: { teacherId: string }) {
  const rating = useTeacherRating(teacherId);
  if (!rating.data || rating.data.count === 0 || rating.data.average === null) return null;
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted mt-0.5">
      <StarsDisplay value={rating.data.average} label={`Rated ${rating.data.average} out of 5`} />
      {rating.data.average} from {rating.data.count} family rating{rating.data.count === 1 ? '' : 's'}
    </p>
  );
}

function NextLessonDetail({ enrolmentId }: { enrolmentId: string }) {
  const next = useNextLesson(enrolmentId);
  if (next.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (next.isError) return <p className="text-sm text-muted">Unavailable</p>;
  const lesson = next.data?.lesson;
  if (!lesson) return <p className="text-sm text-muted">No lesson plan for this level yet.</p>;
  const objectives = objectivesList(lesson.objectives);
  return (
    <>
      <p className="text-sm text-ink">{lesson.title}</p>
      {objectives.length > 0 && (
        <ul className="list-disc pl-4 text-[11px] text-ink-2 mt-0.5">
          {objectives.slice(0, 3).map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function StatusModal({
  kind,
  enrolment,
  onClose,
}: {
  kind: 'pause' | 'cancel' | 'resume';
  enrolment: EnrolmentRecord;
  onClose: () => void;
}) {
  const toast = useToast();
  const update = useUpdateEnrolmentStatus();
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');
  const [errors, setErrors] = useState<{ reason?: string; until?: string }>({});
  const today = new Date().toISOString().slice(0, 10);

  const submit = () => {
    const found: { reason?: string; until?: string } = {};
    if (reason.length > 500) found.reason = 'Keep the reason under 500 characters.';
    if (kind === 'pause' && until && until <= today) found.until = 'Choose a date after today.';
    setErrors(found);
    const first = found.until ?? found.reason;
    if (first) return toast.error(first);
    const status = kind === 'pause' ? 'PAUSED' : kind === 'cancel' ? 'CANCELLED' : 'ACTIVE';
    update.mutate(
      {
        enrolmentId: enrolment.id,
        status,
        ...(kind === 'pause' && until ? { pausedUntil: new Date(`${until}T00:00:00Z`).toISOString() } : {}),
        reason,
      },
      {
        onSuccess: () => {
          toast.success(
            kind === 'pause'
              ? `${enrolment.course.name} paused. Upcoming classes were cancelled.`
              : kind === 'cancel'
                ? `${enrolment.course.name} cancelled. Upcoming classes were removed.`
                : `${enrolment.course.name} resumed.`,
          );
          onClose();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  const titles = { pause: 'Pause this course?', cancel: 'Cancel this course?', resume: 'Resume this course?' } as const;
  return (
    <Modal
      open
      onClose={() => (update.isPending ? undefined : onClose())}
      title={titles[kind]}
      description={`${enrolment.course.name} for ${enrolment.student.displayName}`}
      footer={
        <>
          <UiButton variant="secondary" onClick={onClose} disabled={update.isPending}>Go back</UiButton>
          <UiButton variant={kind === 'cancel' ? 'danger' : 'primary'} onClick={submit} loading={update.isPending}>
            {kind === 'pause' ? 'Pause course' : kind === 'cancel' ? 'Cancel course' : 'Resume course'}
          </UiButton>
        </>
      }
    >
      <div className="space-y-4">
        {kind !== 'resume' && (
          <Alert tone="warning">
            All future scheduled classes for this course will be cancelled and the teacher notified.
            {kind === 'cancel' ? ' To start again later you will need to enrol afresh.' : ''}
          </Alert>
        )}
        {kind === 'resume' && <Alert tone="neutral">You can then book new classes with the teacher.</Alert>}
        {kind === 'pause' && (
          <Field label="Pause until (optional)" htmlFor="pause-until" error={errors.until} hint="Leave blank to pause until you resume.">
            <TextInput id="pause-until" type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        )}
        {kind !== 'resume' && (
          <Field label="Reason (optional)" htmlFor="status-reason" error={errors.reason}>
            <TextArea id="status-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function TeacherChangeModal({ familyId, enrolment, onClose }: { familyId: string; enrolment: EnrolmentRecord; onClose: () => void }) {
  const toast = useToast();
  const request = useRequestTeacherChange();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const problem = validateTeacherChangeReason(reason);
    setError(problem);
    if (problem) return toast.error(problem);
    request.mutate(
      { familyId, studentId: enrolment.student.id, reason },
      {
        onSuccess: () => {
          toast.success('Request sent. The academy team will be in touch about a new teacher.');
          onClose();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <Modal
      open
      onClose={() => (request.isPending ? undefined : onClose())}
      title="Request a different teacher"
      description={`For ${enrolment.student.displayName} (currently ${enrolment.teacher?.user.name ?? 'unassigned'}).`}
      footer={
        <>
          <UiButton variant="secondary" onClick={onClose} disabled={request.isPending}>Cancel</UiButton>
          <UiButton onClick={submit} loading={request.isPending}>Send request</UiButton>
        </>
      }
    >
      <div className="space-y-3">
        <Alert tone="neutral">
          Classes continue with the current teacher until the academy confirms a change. Only one request per child can be open
          at a time.
        </Alert>
        <Field label="What isn’t working?" htmlFor="change-reason" required error={error} hint="At least 10 characters. Kept confidential.">
          <TextArea id="change-reason" rows={4} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Starting a course, two ways. "Book a free trial yourself" opens the booking page with this
 * child and course chosen. "Ask the academy to choose a teacher" records a teacherless TRIAL
 * enrolment, which lands in the academy's queue: they match a teacher and book the trial
 * time, and the family is notified.
 */
export function EnrolModal({
  studentId,
  displayName,
  onClose,
}: {
  studentId: string;
  displayName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const catalogue = useCourseCatalogue();
  const existing = useStudentEnrolments(studentId);
  const create = useCreateEnrolment();
  const [courseId, setCourseId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const taken = new Set((existing.data ?? []).filter((e) => isLiveEnrolment(e.status)).map((e) => e.course.id));
  const chosen = catalogue.data?.find((c) => c.id === courseId);

  const askAcademy = () => {
    if (!courseId) {
      setError('Choose a course.');
      return toast.error('Choose a course.');
    }
    setError(null);
    create.mutate(
      { studentId, courseId },
      {
        onSuccess: (res) => {
          toast.success(`Request sent. The academy will choose a teacher for ${displayName} in ${res.course.name} and book the trial.`);
          onClose();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <Modal
      open
      onClose={() => (create.isPending ? undefined : onClose())}
      title={`Start a course for ${displayName}`}
      footer={
        <>
          <UiButton variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</UiButton>
          <UiButton variant="secondary" onClick={askAcademy} loading={create.isPending} disabled={!catalogue.data}>
            Ask the academy to choose a teacher
          </UiButton>
          {chosen ? (
            <BookTrialLink studentId={studentId} courseCode={chosen.code} />
          ) : (
            <UiButton disabled title="Choose a course first">
              Book a free trial yourself
            </UiButton>
          )}
        </>
      }
    >
      <QueryState query={catalogue} empty={<EmptyState title="No courses available" />}>
        {(courses) => {
          const available = courses.filter((c) => !taken.has(c.id));
          if (available.length === 0) {
            return <EmptyState title="Already enrolled in every course" />;
          }
          return (
            <div className="space-y-3">
              <Field label="Course" htmlFor="enrol-course" required error={error}>
                <Select id="enrol-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  <option value="">Select a course…</option>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              {chosen && <p className="text-xs text-muted">{chosen.description}</p>}
              <ul className="text-xs text-ink-2 space-y-1.5 list-disc pl-4">
                <li>
                  <strong>Book a free trial yourself:</strong> pick a teacher and a time that suits you now.
                </li>
                <li>
                  <strong>Ask the academy to choose a teacher:</strong> the academy matches a teacher, books the trial time and
                  lets you know.
                </li>
              </ul>
              <p className="text-[11px] text-muted">
                After the trial the teacher shares a result; then you choose a plan and weekly times and pay to start.
              </p>
            </div>
          );
        }}
      </QueryState>
    </Modal>
  );
}
