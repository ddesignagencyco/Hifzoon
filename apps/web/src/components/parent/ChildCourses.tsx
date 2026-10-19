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
  useStudentEnrolments,
  useTeacherRating,
  useUpdateEnrolmentStatus,
} from '@/hooks/useParentEnrolments';
import { useStudentConsent } from '@/hooks/useFamilyConsent';
import { hasRequiredConsent } from '@/lib/api/modules/consent';
import { EnrolmentRecord, isLiveEnrolment, objectivesList } from '@/lib/api/modules/enrolments';
import { validateTeacherChangeReason } from '@/lib/api/modules/admissions-guardian';
import { BookClassModal } from './ClassModals';
import { StarsDisplay } from './shared';

type Action =
  | { kind: 'pause' | 'cancel' | 'resume' | 'change' | 'book'; enrolment: EnrolmentRecord }
  | { kind: 'enrol' }
  | null;

/** Courses tab: enrolments with next lesson, pause/resume/cancel, booking and teacher change. */
export function ChildCourses({ studentId, familyId, displayName }: { studentId: string; familyId: string; displayName: string }) {
  const enrolments = useStudentEnrolments(studentId);
  const consent = useStudentConsent(studentId);
  const consentOk = hasRequiredConsent(consent.data);
  const [action, setAction] = useState<Action>(null);
  const close = () => setAction(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Courses {displayName} is enrolled in.</p>
        <UiButton size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAction({ kind: 'enrol' })}>
          Enrol in a course
        </UiButton>
      </div>
      {consent.data && !consentOk && (
        <Alert tone="warning" title="Consent needed before booking">
          Classes can’t be booked until consent for lesson records is given in the Consent tab.
        </Alert>
      )}
      <QueryState
        query={enrolments}
        empty={<EmptyState title="No courses yet" description={`Enrol ${displayName} in a course to get a teacher and book classes.`} />}
      >
        {(rows) => (
          <ul className="space-y-3">
            {rows.map((e) => (
              <EnrolmentItem key={e.id} enrolment={e} consentOk={consentOk} onAction={(kind) => setAction({ kind, enrolment: e })} />
            ))}
          </ul>
        )}
      </QueryState>

      {action?.kind === 'enrol' && (
        <EnrolModal studentId={studentId} displayName={displayName} existing={enrolments.data ?? []} onClose={close} />
      )}
      {action && action.kind !== 'enrol' && action.kind !== 'book' && action.kind !== 'change' && (
        <StatusModal kind={action.kind} enrolment={action.enrolment} onClose={close} />
      )}
      {action?.kind === 'change' && <TeacherChangeModal familyId={familyId} enrolment={action.enrolment} onClose={close} />}
      {action?.kind === 'book' && <BookClassModal enrolment={action.enrolment} onClose={close} />}
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
  const teachable = (e.status === 'ACTIVE' || e.status === 'TRIAL') && Boolean(e.teacher);
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
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg bg-cream px-3 py-2">
          <p className="text-[11px] text-muted">Teacher</p>
          {e.teacher ? (
            <>
              <p className="text-sm text-ink">{e.teacher.user.name}</p>
              <TeacherRatingLine teacherId={e.teacher.id} />
            </>
          ) : (
            <p className="text-sm text-muted">Not assigned yet — the academy will match a teacher.</p>
          )}
        </div>
        <div className="rounded-lg bg-cream px-3 py-2">
          <p className="text-[11px] text-muted">Next lesson</p>
          {live ? <NextLessonDetail enrolmentId={e.id} /> : <p className="text-sm text-muted">—</p>}
        </div>
      </div>
      {live && (
        <div className="flex flex-wrap gap-2">
          {teachable && (
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
            <UiButton variant="secondary" size="sm" icon={<Repeat className="w-3.5 h-3.5" />} onClick={() => onAction('change')}>
              Request teacher change
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

function EnrolModal({
  studentId,
  displayName,
  existing,
  onClose,
}: {
  studentId: string;
  displayName: string;
  existing: EnrolmentRecord[];
  onClose: () => void;
}) {
  const toast = useToast();
  const catalogue = useCourseCatalogue();
  const create = useCreateEnrolment();
  const [courseId, setCourseId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const taken = new Set(existing.filter((e) => isLiveEnrolment(e.status)).map((e) => e.course.id));

  const submit = () => {
    if (!courseId) {
      setError('Choose a course.');
      return toast.error('Choose a course.');
    }
    setError(null);
    create.mutate(
      { studentId, courseId },
      {
        onSuccess: (res) => {
          toast.success(`${displayName} is enrolled in ${res.course.name}. The academy will match a teacher.`);
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
      title={`Enrol ${displayName} in a course`}
      footer={
        <>
          <UiButton variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</UiButton>
          <UiButton onClick={submit} loading={create.isPending} disabled={!catalogue.data}>Enrol</UiButton>
        </>
      }
    >
      <QueryState query={catalogue} empty={<EmptyState title="No courses available" />}>
        {(courses) => {
          const available = courses.filter((c) => !taken.has(c.id));
          const chosen = courses.find((c) => c.id === courseId);
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
              <p className="text-[11px] text-muted">New enrolments start as a trial until the academy confirms placement.</p>
            </div>
          );
        }}
      </QueryState>
    </Modal>
  );
}
