'use client';

import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ListOrdered, Plus, RefreshCcw, Repeat, UserPlus } from 'lucide-react';
import {
  Alert,
  Badge,
  Checkbox,
  DataTable,
  EmptyState,
  Field,
  Modal,
  Pagination,
  QueryState,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  UiButton,
  formatDate,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/api/http';
import { useBookTrial, useChangeEnrolmentTeacher } from '@/hooks/useAdminAdmissions';
import {
  coursesAdminKeys,
  useAdminCourse,
  useAdminCourses,
  useAdminEnrolments,
  useAdminEnrolmentsPage,
  useCreateEnrolment,
  useSetLessonPosition,
  useUpdateEnrolmentStatus,
} from '@/hooks/useCoursesAdmin';
import { useAdminMatching } from '@/hooks/useAdminScheduling';
import {
  ENROLMENT_STATUSES,
  EnrolmentFilters,
  EnrolmentRow,
  EnrolmentStatus,
  canAssignTeacher,
  isAwaitingTeacher,
} from '@/lib/api/modules/courses-admin';
import { findLesson, LessonPicker, LessonRef, LessonTitleText } from '@/components/courses/LessonPicker';
import { mergeTeacherOptions, PickedStudent, StudentPicker, TeacherPicker, useLoadErrorToast } from '../shared/Pickers';
import { useTeachers } from '@/hooks/useTeachers';
import { ALL, FilterSelect, optionsFrom } from '@/components/ui/FilterSelect';

/** Statuses an operator can set; staff may mark an enrolment COMPLETED (backend B12). */
const SETTABLE: EnrolmentStatus[] = ['TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED'];

/**
 * Enrolments tab: filters + status / lesson-position actions + new enrolment (FR-CRS-02).
 * "Awaiting a teacher" narrows to live enrolments with no teacher (usually a family's own
 * enrolment) and offers "Assign teacher" from the matching suggestions.
 */
export function EnrolmentsPanel({ initialAwaiting = false }: { initialAwaiting?: boolean }) {
  // Filters apply as they change; the people lists come from the unfiltered enrolments.
  const [filters, setFilters] = useState<EnrolmentFilters>({ status: '', studentId: '', teacherId: '' });
  const [awaitingOnly, setAwaitingOnly] = useState(initialAwaiting);
  // Course and family narrow the loaded page in the browser (the API has no such params).
  const [courseId, setCourseId] = useState(ALL);
  const [familyName, setFamilyName] = useState(ALL);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const query = useAdminEnrolmentsPage({ ...filters, awaitingTeacher: awaitingOnly, page, limit });
  // Unpaginated, for the student/teacher filter dropdown options only.
  const everyone = useAdminEnrolments({});
  const directory = useTeachers();
  const studentOptions = useMemo(() => {
    const map = new Map<string, { name: string; family?: string }>();
    for (const r of everyone.data ?? []) map.set(r.student.id, { name: r.student.displayName, family: r.student.family?.name });
    return [...map.entries()].sort((x, y) => x[1].name.localeCompare(y[1].name));
  }, [everyone.data]);
  const loaded = query.data?.items ?? [];
  const courseOptions = optionsFrom(loaded, (r) => ({ value: r.course.id, label: r.course.name }), 'All courses');
  const familyOptions = optionsFrom(
    loaded,
    (r) => (r.student.family?.name ? { value: r.student.family.name, label: r.student.family.name } : null),
    'All families',
  );
  const shown = (items: EnrolmentRow[]) =>
    items.filter(
      (r) => (courseId === ALL || r.course.id === courseId) && (familyName === ALL || r.student.family?.name === familyName),
    );
  const teacherOptions = useMemo(
    () => mergeTeacherOptions([], directory.allTeachers, everyone.data ?? [], ''),
    [directory.allTeachers, everyone.data],
  );
  const [statusRow, setStatusRow] = useState<EnrolmentRow | null>(null);
  const [positionRow, setPositionRow] = useState<EnrolmentRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [assignRow, setAssignRow] = useState<EnrolmentRow | null>(null);
  const [changeRow, setChangeRow] = useState<EnrolmentRow | null>(null);
  // Any filter change starts back at the first page.
  const set = (patch: Partial<EnrolmentFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <p className="min-w-0 text-xs text-muted">Newest first; up to 200 are shown, so narrow with the filters.</p>
        <UiButton icon={<Plus className="w-4 h-4" aria-hidden />} onClick={() => setCreating(true)}>
          New enrolment
        </UiButton>
      </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5 mb-4 *:min-w-0" role="group" aria-label="Filter enrolments">
          <Field label="Status" htmlFor="enr-status">
            <Select id="enr-status" value={filters.status} onChange={(e) => set({ status: e.target.value as EnrolmentStatus | '' })}>
              <option value="">All statuses</option>
              {ENROLMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Student" htmlFor="enr-student">
            <Select id="enr-student" value={filters.studentId} searchable onChange={(e) => set({ studentId: e.target.value })}>
              <option value="">All students</option>
              {studentOptions.map(([id, st]) => (
                <option key={id} value={id} data-description={st.family}>
                  {st.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Teacher" htmlFor="enr-teacher">
            <Select id="enr-teacher" value={filters.teacherId} searchable onChange={(e) => set({ teacherId: e.target.value })}>
              <option value="">All teachers</option>
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <FilterSelect id="enr-course" label="Course" className="sm:w-full" value={courseId} onChange={setCourseId} options={courseOptions} />
          <FilterSelect id="enr-family" label="Family" className="sm:w-full" value={familyName} onChange={setFamilyName} options={familyOptions} />
        </div>
        <div className="mb-4 space-y-1">
          <Checkbox
            id="enr-awaiting"
            label="Only enrolments awaiting a teacher"
            description="Trial or active enrolments with no teacher yet, usually a family's own enrolment."
            checked={awaitingOnly}
            onChange={(v) => {
              setAwaitingOnly(v);
              setPage(1);
            }}
          />
        </div>

        <div>
          <QueryState
            query={query}
            isEmpty={(d) => d.items.length === 0}
            empty={<EmptyState className="rounded-xl border border-line bg-white" title={awaitingOnly ? 'No enrolments are waiting for a teacher' : 'No enrolments match these filters'} />}
          >
            {(data) => (
              <>
              <DataTable
                paginate={false}
                rows={shown(data.items)}
                empty={<EmptyState title="No enrolments on this page match the course or family" />}
                rowKey={(r) => r.id}
                columns={[
                  {
                    key: 'student',
                    header: 'Student',
                    render: (r) => (
                      <div className="min-w-[120px]">
                        <p className="font-medium text-ink">{r.student.displayName}</p>
                        {r.student.birthYear && <p className="text-[11px] text-muted">Born {r.student.birthYear}</p>}
                      </div>
                    ),
                  },
                  {
                    key: 'course',
                    header: 'Course',
                    render: (r) => <span className="text-ink">{r.course.name}</span>,
                  },
                  {
                    key: 'progress',
                    header: 'Level · next lesson',
                    render: (r) => (
                      <span className="whitespace-nowrap">
                        {r.currentLevel ? `Level ${r.currentLevel.position} · ${r.currentLevel.name}` : <span className="text-muted">Not placed yet</span>}
                        <LessonTitleText
                          courseId={r.course.id}
                          level={r.currentLevel}
                          position={r.currentLessonPosition}
                          className="block text-[11px] text-muted max-w-[220px] truncate"
                        />
                      </span>
                    ),
                  },
                  {
                    key: 'teacher',
                    header: 'Teacher',
                    render: (r) =>
                      r.teacher?.user.name ??
                      (isAwaitingTeacher(r) ? <Badge tone="amber">Awaiting a teacher</Badge> : <span className="text-muted">Unassigned</span>),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (r) => (
                      <>
                        <StatusBadge status={r.status} />
                        {r.pausedUntil && <p className="text-[11px] text-muted mt-1">until {formatDate(r.pausedUntil)}</p>}
                      </>
                    ),
                  },
                  { key: 'started', header: 'Started', render: (r) => <span className="whitespace-nowrap">{formatDate(r.startedAt)}</span> },
                  {
                    key: 'actions',
                    header: <span className="sr-only">Actions</span>,
                    className: 'text-right whitespace-nowrap',
                    render: (r) => (
                      <span className="inline-flex gap-1">
                        {isAwaitingTeacher(r) && (
                          <UiButton
                            size="sm"
                            icon={<UserPlus className="w-3.5 h-3.5" aria-hidden />}
                            onClick={() => setAssignRow(r)}
                            disabled={!canAssignTeacher(r)}
                            title={
                              canAssignTeacher(r)
                                ? undefined
                                : 'Only a trial enrolment can be given a teacher here. A student can’t have two live enrolments in the same course.'
                            }
                            aria-label={`Assign a teacher to ${r.student.displayName} in ${r.course.name}`}
                          >
                            Assign teacher
                          </UiButton>
                        )}
                        {r.teacher && (r.status === 'ACTIVE' || r.status === 'TRIAL' || r.status === 'PAUSED') && (
                          <UiButton
                            size="sm"
                            variant="ghost"
                            icon={<Repeat className="w-3.5 h-3.5" aria-hidden />}
                            onClick={() => setChangeRow(r)}
                            aria-label={`Change ${r.student.displayName}'s teacher in ${r.course.name}`}
                          >
                            Change teacher
                          </UiButton>
                        )}
                        <UiButton
                          size="sm"
                          variant="ghost"
                          icon={<RefreshCcw className="w-3.5 h-3.5" aria-hidden />}
                          onClick={() => setStatusRow(r)}
                          aria-label={`Change status for ${r.student.displayName} in ${r.course.name}`}
                        >
                          Change status
                        </UiButton>
                        <UiButton
                          size="sm"
                          variant="ghost"
                          icon={<ListOrdered className="w-3.5 h-3.5" aria-hidden />}
                          onClick={() => setPositionRow(r)}
                          aria-label={`Set lesson position for ${r.student.displayName} in ${r.course.name}`}
                        >
                          Set lesson
                        </UiButton>
                      </span>
                    ),
                  },
                ]}
              />
              <Pagination
                page={data.meta.page}
                limit={data.meta.limit}
                total={data.meta.total}
                onPageChange={setPage}
                onLimitChange={(l) => {
                  setLimit(l);
                  setPage(1);
                }}
                itemName="enrolments"
                className="mt-3 px-5 sm:px-0"
              />
              </>
            )}
          </QueryState>
        </div>

      <AssignTeacherModal row={assignRow} onClose={() => setAssignRow(null)} />
      {changeRow && <ChangeTeacherModal row={changeRow} onClose={() => setChangeRow(null)} />}
      <StatusModal row={statusRow} onClose={() => setStatusRow(null)} />
      <PositionModal row={positionRow} onClose={() => setPositionRow(null)} />
      <CreateEnrolmentModal open={creating} onClose={() => setCreating(false)} />
    </section>
  );
}

/**
 * M60 — move a child to another teacher: the enrolment, weekly times and future classes
 * move; past classes stay with the teacher who taught them. The family and both teachers
 * are told.
 */
function ChangeTeacherModal({ row, onClose }: { row: EnrolmentRow; onClose: () => void }) {
  const toast = useToast();
  const change = useChangeEnrolmentTeacher();
  const [teacherId, setTeacherId] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal
      open
      size="md"
      title={`Change ${row.student.displayName}'s teacher`}
      description={`${row.course.name} · now with ${row.teacher?.user.name ?? 'no teacher'}. Weekly times and future classes move to the new teacher.`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <TeacherPicker id="change-teacher" label="New teacher" required value={teacherId} onChange={(t) => setTeacherId(t?.id ?? '')} />
        <Field label="Note to the family (optional)" htmlFor="change-teacher-note">
          <TextArea id="change-teacher-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} />
        </Field>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <UiButton variant="ghost" onClick={onClose}>
            Cancel
          </UiButton>
          <UiButton
            disabled={!teacherId || teacherId === row.teacher?.id}
            loading={change.isPending}
            onClick={() =>
              change.mutate(
                { enrolmentId: row.id, teacherId, note },
                {
                  onSuccess: () => {
                    toast.success('Teacher changed. The family and both teachers have been told.');
                    onClose();
                  },
                  onError: (err) => toast.error(err),
                },
              )
            }
          >
            Change teacher
          </UiButton>
        </div>
      </div>
    </Modal>
  );
}

function AssignTeacherModal({ row, onClose }: { row: EnrolmentRow | null; onClose: () => void }) {
  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      title="Assign a teacher"
      description={row ? `${row.student.displayName} · ${row.course.name}` : undefined}
    >
      {row && <AssignTeacherForm key={row.id} row={row} onDone={onClose} />}
    </Modal>
  );
}

/**
 * Matching suggestions, then one of two existing routes:
 * - with a trial time, the office's own trial booking (`POST /trials`), which lands on this
 *   TRIAL enrolment, gives it the teacher, applies the trial rules and tells the family;
 * - without one, `POST /courses/enrolments { …, status: 'TRIAL' }`, which only gives the
 *   enrolment its teacher in place. The family is told who will teach and that the time
 *   is still to be set (TRIAL_TEACHER_ASSIGNED), so the copy says that.
 */
function AssignTeacherForm({ row, onDone }: { row: EnrolmentRow; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const matching = useAdminMatching(row.student.id, row.course.id);
  const create = useCreateEnrolment();
  const book = useBookTrial();
  const [teacherId, setTeacherId] = useState('');
  // `datetime-local`, read in this browser's zone (as the Trials workspace's manual time is).
  const [trialAt, setTrialAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  // What the server refused (e.g. no consent for lesson records), kept on screen beside the toast.
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pending = create.isPending || book.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId) {
      setError('Choose a teacher.');
      toast.error('Choose a teacher.');
      return;
    }
    const startsAt = trialAt ? new Date(trialAt) : null;
    if (startsAt && (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now())) {
      setError('Choose a trial time in the future.');
      toast.error('Choose a trial time in the future.');
      return;
    }
    setError(null);
    setSubmitError(null);
    const chosen = matching.data?.suggestions.find((s) => s.teacherId === teacherId);
    if (startsAt) {
      book.mutate(
        { studentId: row.student.id, courseId: row.course.id, teacherId, startsAt: startsAt.toISOString() },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: coursesAdminKeys.enrolmentsAll });
            toast.success(
              `Trial booked for ${row.student.displayName} with ${chosen?.name ?? 'the teacher'} on ${formatDateTime(
                startsAt.toISOString(),
              )}. The family has been notified.`,
            );
            onDone();
          },
          onError: (err) => {
            setSubmitError(getErrorMessage(err));
            toast.error(err);
          },
        },
      );
      return;
    }
    create.mutate(
      { studentId: row.student.id, courseId: row.course.id, teacherId, status: 'TRIAL' },
      {
        onSuccess: () => {
          toast.success(`${chosen?.name ?? 'Teacher'} assigned to ${row.student.displayName} for ${row.course.name}`);
          onDone();
        },
        onError: (err) => {
          setSubmitError(getErrorMessage(err));
          toast.error(err);
        },
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Assign a teacher">
      <QueryState
        query={matching}
        loadingLabel="Finding matching teachers…"
        isEmpty={(d) => d.suggestions.length === 0}
        empty={<EmptyState title="No cleared teacher matches this student" description="Check teacher readiness under Teachers." />}
      >
        {(data) => (
          <fieldset>
            <legend className="text-sm font-medium text-ink mb-2">Matching teachers</legend>
            <ul className={'space-y-2 rounded-xl ' + (error ? 'ring-1 ring-red' : '')}>
              {data.suggestions.map((s) => (
                <li key={s.teacherId}>
                  <label
                    className={
                      'flex items-start gap-3 rounded-xl border p-3 cursor-pointer ' +
                      (teacherId === s.teacherId ? 'border-green-700 bg-green-50' : 'border-line hover:bg-cream')
                    }
                  >
                    <input
                      type="radio"
                      name="assign-teacher"
                      className="mt-1 accent-green-800"
                      checked={teacherId === s.teacherId}
                      onChange={() => setTeacherId(s.teacherId)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{s.name}</span>
                      {s.reasons.length > 0 && <span className="block text-xs text-ink-2">{s.reasons.join(' · ')}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {error && <span className="sr-only">{error}</span>}
          </fieldset>
        )}
      </QueryState>
      <Field
        label="Trial class time"
        htmlFor="assign-trial-time"
        hint={`Your time zone (${Intl.DateTimeFormat().resolvedOptions().timeZone}). Leave empty to assign the teacher only.`}
      >
        <TextInput id="assign-trial-time" type="datetime-local" value={trialAt} onChange={(e) => setTrialAt(e.target.value)} />
      </Field>
      <Alert tone="neutral">
        {trialAt
          ? 'The trial is booked with this teacher, the enrolment gets the teacher, and the family is notified with the time.'
          : 'The enrolment stays a trial, now with this teacher. The family is told who will teach and that the academy will confirm the time, or that they can book one themselves from their child’s Courses tab.'}
      </Alert>
      {submitError && (
        <Alert tone="error" title="Couldn’t book this">
          {submitError}
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <UiButton variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </UiButton>
        <UiButton type="submit" loading={pending} disabled={!matching.data || matching.data.suggestions.length === 0}>
          {trialAt ? 'Assign and book trial' : 'Assign teacher'}
        </UiButton>
      </div>
    </form>
  );
}

function StatusModal({ row, onClose }: { row: EnrolmentRow | null; onClose: () => void }) {
  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      title="Change enrolment status"
      description={row ? `${row.student.displayName} · ${row.course.name}` : undefined}
    >
      {row && <StatusForm key={row.id} row={row} onDone={onClose} />}
    </Modal>
  );
}

function StatusForm({ row, onDone }: { row: EnrolmentRow; onDone: () => void }) {
  const toast = useToast();
  const update = useUpdateEnrolmentStatus();
  const [status, setStatus] = useState<EnrolmentStatus>(row.status);
  const [pausedUntil, setPausedUntil] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const disruptive = status === 'PAUSED' || status === 'CANCELLED';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status === row.status) {
      setError('Choose a different status.');
      toast.error('Choose a different status.');
      return;
    }
    if (reason.length > 500) {
      setError('Reason must be at most 500 characters.');
      toast.error('Reason must be at most 500 characters.');
      return;
    }
    if (status === 'PAUSED' && pausedUntil && pausedUntil <= new Date().toISOString().slice(0, 10)) {
      setError('Paused-until must be a future date.');
      toast.error('Paused-until must be a future date.');
      return;
    }
    setError(null);
    update.mutate(
      {
        enrolmentId: row.id,
        body: {
          status,
          ...(status === 'PAUSED' && pausedUntil ? { pausedUntil } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
      },
      {
        onSuccess: (res) => {
          toast.success(`Enrolment is now ${humanize(res.status).toLowerCase()}`);
          onDone();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Change enrolment status">
      <p className="text-sm text-ink-2">
        Current status: <StatusBadge status={row.status} />
      </p>
      <Field label="New status" htmlFor="enr-new-status" required error={error}>
        <Select id="enr-new-status" value={status} onChange={(e) => setStatus(e.target.value as EnrolmentStatus)}>
          {SETTABLE.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </Field>
      {status === 'PAUSED' && (
        <Field label="Paused until (optional)" htmlFor="enr-paused-until">
          <TextInput id="enr-paused-until" type="date" value={pausedUntil} onChange={(e) => setPausedUntil(e.target.value)} />
        </Field>
      )}
      <Field label="Reason (optional)" htmlFor="enr-reason" hint="Shown as the cancellation reason on withdrawn sessions. Max 500.">
        <TextArea id="enr-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {disruptive && (
        <Alert tone="warning" title="Future classes will be withdrawn">
          Every scheduled class for this enrolment after now is cancelled and the teacher is notified.
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <UiButton variant="secondary" onClick={onDone} disabled={update.isPending}>
          Cancel
        </UiButton>
        <UiButton type="submit" variant={disruptive ? 'danger' : 'primary'} loading={update.isPending}>
          {disruptive ? `Confirm: ${humanize(status).toLowerCase()}` : 'Update status'}
        </UiButton>
      </div>
    </form>
  );
}

function PositionModal({ row, onClose }: { row: EnrolmentRow | null; onClose: () => void }) {
  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      title="Set lesson position"
      description={row ? `${row.student.displayName} · ${row.course.name}` : undefined}
      size="sm"
    >
      {row && <PositionForm key={row.id} row={row} onDone={onClose} />}
    </Modal>
  );
}

function PositionForm({ row, onDone }: { row: EnrolmentRow; onDone: () => void }) {
  const toast = useToast();
  const setPosition = useSetLessonPosition();
  // Every lesson of the course, grouped by level, with the student's current one preselected.
  const course = useAdminCourse(row.course.id);
  const levels = course.data?.levels ?? [];
  const [choice, setChoice] = useState<LessonRef | null>(
    row.currentLevel ? { levelId: row.currentLevel.id, position: row.currentLessonPosition } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const hasLessons = levels.some((l) => l.lessonTemplates.length > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const picked = choice ? findLesson(levels, choice) : null;
    if (!choice || !picked) {
      setError('Choose the lesson the teacher teaches next.');
      toast.error('Choose the lesson the teacher teaches next.');
      return;
    }
    setError(null);
    setPosition.mutate(
      {
        enrolmentId: row.id,
        position: choice.position,
        ...(choice.levelId !== row.currentLevel?.id ? { levelId: choice.levelId } : {}),
      },
      {
        onSuccess: () => {
          toast.success(`Next lesson: ${picked.lesson.title} (${picked.level.name})`);
          onDone();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Set lesson position">
      <Field
        label="Next lesson"
        htmlFor="enr-position"
        required
        error={error}
        hint="The lesson the teacher teaches next. It appears on the teacher's class brief. Choosing a lesson in another level moves the student to that level. Lesson titles are edited under Courses."
      >
        {course.isLoading ? (
          <p className="text-xs text-muted">Loading lessons…</p>
        ) : hasLessons ? (
          <LessonPicker
            id="enr-position"
            levels={levels}
            value={choice}
            onChange={setChoice}
            aria-invalid={Boolean(error)}
            autoFocus
          />
        ) : (
          <p className="text-xs text-muted">This course has no lessons yet. Add them under Courses first.</p>
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <UiButton variant="secondary" onClick={onDone} disabled={setPosition.isPending}>
          Cancel
        </UiButton>
        <UiButton type="submit" loading={setPosition.isPending} disabled={!hasLessons}>
          Save next lesson
        </UiButton>
      </div>
    </form>
  );
}

function CreateEnrolmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="New enrolment" description="One live enrolment per student per course.">
      {open && <CreateEnrolmentForm onDone={onClose} />}
    </Modal>
  );
}

function CreateEnrolmentForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const courses = useAdminCourses('en');
  useLoadErrorToast(courses.isError, 'Could not load courses.');
  const create = useCreateEnrolment();
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [values, setValues] = useState({ courseId: '', teacherId: '', status: 'TRIAL' as EnrolmentStatus });
  const [errors, setErrors] = useState<Partial<Record<'studentId' | 'courseId' | 'teacherId', string>>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!student) next.studentId = 'Choose a student.';
    if (!values.courseId) next.courseId = 'Choose a course.';
    setErrors(next);
    if (Object.keys(next).length > 0) return toast.error(Object.values(next).find(Boolean) ?? 'Please fix the highlighted fields');
    create.mutate(
      {
        studentId: student?.id ?? '',
        courseId: values.courseId,
        status: values.status,
        ...(values.teacherId.trim() ? { teacherId: values.teacherId.trim() } : {}),
      },
      {
        onSuccess: (res) => {
          toast.success(`Enrolled in ${res.course.name} (${humanize(res.status).toLowerCase()})`);
          onDone();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="New enrolment">
      <StudentPicker id="new-enr-student" value={student} onChange={setStudent} error={errors.studentId} />
      <Field label="Course" htmlFor="new-enr-course" required error={errors.courseId}>
        <Select
          id="new-enr-course"
          value={values.courseId}
          disabled={courses.isLoading}
          aria-invalid={Boolean(errors.courseId)}
          onChange={(e) => setValues((v) => ({ ...v, courseId: e.target.value }))}
        >
          <option value="">{courses.isLoading ? 'Loading courses…' : 'Choose a course'}</option>
          {(courses.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 *:min-w-0">
        <TeacherPicker
          id="new-enr-teacher"
          label="Teacher (optional)"
          value={values.teacherId}
          onChange={(t) => setValues((v) => ({ ...v, teacherId: t?.id ?? '' }))}
        />
        <Field label="Initial status" htmlFor="new-enr-status">
          <Select
            id="new-enr-status"
            value={values.status}
            onChange={(e) => setValues((v) => ({ ...v, status: e.target.value as EnrolmentStatus }))}
          >
            {(['TRIAL', 'ACTIVE'] as const).map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <UiButton variant="secondary" onClick={onDone} disabled={create.isPending}>
          Cancel
        </UiButton>
        <UiButton type="submit" loading={create.isPending}>
          Create enrolment
        </UiButton>
      </div>
    </form>
  );
}
