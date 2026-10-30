'use client';

import React, { useMemo, useState } from 'react';
import { ListOrdered, Plus, RefreshCcw, UserPlus } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  DataTable,
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
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  useAdminCourses,
  useAdminEnrolments,
  useCreateEnrolment,
  useSetLessonPosition,
  useUpdateEnrolmentStatus,
} from '@/hooks/useCoursesAdmin';
import { useAdminMatching } from '@/hooks/useAdminScheduling';
import {
  ENROLMENT_LIST_CAP,
  ENROLMENT_STATUSES,
  EnrolmentFilters,
  EnrolmentRow,
  EnrolmentStatus,
  canAssignTeacher,
  isAwaitingTeacher,
} from '@/lib/api/modules/courses-admin';
import { mergeTeacherOptions, PickedStudent, StudentPicker, TeacherPicker, useLoadErrorToast } from '../shared/Pickers';
import { useTeachers } from '@/hooks/useTeachers';

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
  const query = useAdminEnrolments(filters);
  const everyone = useAdminEnrolments({});
  const directory = useTeachers();
  const studentOptions = useMemo(() => {
    const map = new Map<string, { name: string; family?: string }>();
    for (const r of everyone.data ?? []) map.set(r.student.id, { name: r.student.displayName, family: r.student.family?.name });
    return [...map.entries()].sort((x, y) => x[1].name.localeCompare(y[1].name));
  }, [everyone.data]);
  const teacherOptions = useMemo(
    () => mergeTeacherOptions([], directory.allTeachers, everyone.data ?? [], ''),
    [directory.allTeachers, everyone.data],
  );
  const [statusRow, setStatusRow] = useState<EnrolmentRow | null>(null);
  const [positionRow, setPositionRow] = useState<EnrolmentRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [awaitingOnly, setAwaitingOnly] = useState(initialAwaiting);
  const [assignRow, setAssignRow] = useState<EnrolmentRow | null>(null);
  const visible = (rows: EnrolmentRow[]) => (awaitingOnly ? rows.filter(isAwaitingTeacher) : rows);
  const set = (patch: Partial<EnrolmentFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <Card>
      <CardHeader
        title="Enrolments"
        description="Newest first; up to 200 are shown, so narrow with the filters."
        action={
          <UiButton icon={<Plus className="w-4 h-4" aria-hidden />} onClick={() => setCreating(true)}>
            New enrolment
          </UiButton>
        }
      />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-3 mb-4" role="group" aria-label="Filter enrolments">
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
        </div>
        <div className="mb-4 space-y-1">
          <Checkbox
            id="enr-awaiting"
            label="Only enrolments awaiting a teacher"
            description="Trial or active enrolments with no teacher yet, usually a family's own enrolment."
            checked={awaitingOnly}
            onChange={setAwaitingOnly}
          />
          {awaitingOnly && (query.data?.length ?? 0) >= ENROLMENT_LIST_CAP && (
            <p className="text-[11px] text-muted pl-7">
              Checked among the newest {ENROLMENT_LIST_CAP} enrolments. Filter by status to reach older ones.
            </p>
          )}
        </div>

        <div className="-mx-5 sm:mx-0">
          <QueryState
            query={query}
            isEmpty={(rows) => visible(rows).length === 0}
            empty={<EmptyState title={awaitingOnly ? 'No enrolments are waiting for a teacher' : 'No enrolments match these filters'} />}
          >
            {(rows) => (
              <DataTable
                rows={visible(rows)}
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
                    render: (r) => (
                      <>
                        <p className="text-ink">{r.course.name}</p>
                        <p className="text-[11px] text-muted font-mono">{r.course.code}</p>
                      </>
                    ),
                  },
                  {
                    key: 'progress',
                    header: 'Level · lesson',
                    render: (r) => (
                      <span className="whitespace-nowrap">
                        {r.currentLevel ? `L${r.currentLevel.position} ${r.currentLevel.name}` : 'No level'} · #{r.currentLessonPosition}
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
                        <UiButton
                          size="sm"
                          variant="ghost"
                          icon={<RefreshCcw className="w-3.5 h-3.5" aria-hidden />}
                          onClick={() => setStatusRow(r)}
                          aria-label={`Change status for ${r.student.displayName} in ${r.course.name}`}
                        >
                          Status
                        </UiButton>
                        <UiButton
                          size="sm"
                          variant="ghost"
                          icon={<ListOrdered className="w-3.5 h-3.5" aria-hidden />}
                          onClick={() => setPositionRow(r)}
                          aria-label={`Set lesson position for ${r.student.displayName} in ${r.course.name}`}
                        >
                          Lesson
                        </UiButton>
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </QueryState>
        </div>
      </CardBody>

      <AssignTeacherModal row={assignRow} onClose={() => setAssignRow(null)} />
      <StatusModal row={statusRow} onClose={() => setStatusRow(null)} />
      <PositionModal row={positionRow} onClose={() => setPositionRow(null)} />
      <CreateEnrolmentModal open={creating} onClose={() => setCreating(false)} />
    </Card>
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
 * Matching suggestions → `POST /courses/enrolments { studentId, courseId, teacherId, status: 'TRIAL' }`,
 * which gives the student's TRIAL enrolment its teacher in place (backend M60 would add a
 * dedicated route that also notifies the family and the teacher).
 */
function AssignTeacherForm({ row, onDone }: { row: EnrolmentRow; onDone: () => void }) {
  const toast = useToast();
  const matching = useAdminMatching(row.student.id, row.course.id);
  const create = useCreateEnrolment();
  const [teacherId, setTeacherId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId) {
      setError('Choose a teacher.');
      toast.error('Choose a teacher.');
      return;
    }
    setError(null);
    const chosen = matching.data?.suggestions.find((s) => s.teacherId === teacherId);
    create.mutate(
      { studentId: row.student.id, courseId: row.course.id, teacherId, status: 'TRIAL' },
      {
        onSuccess: () => {
          toast.success(`${chosen?.name ?? 'Teacher'} assigned to ${row.student.displayName} for ${row.course.name}`);
          onDone();
        },
        onError: (err) => toast.error(err),
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
      <Alert tone="neutral">
        The enrolment stays a trial, now with this teacher. The family and the teacher are not notified automatically yet, so
        let them know, then book classes from Scheduling.
      </Alert>
      <div className="flex justify-end gap-2">
        <UiButton variant="secondary" onClick={onDone} disabled={create.isPending}>
          Cancel
        </UiButton>
        <UiButton type="submit" loading={create.isPending} disabled={!matching.data || matching.data.suggestions.length === 0}>
          Assign teacher
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
  const [value, setValue] = useState(String(row.currentLessonPosition));
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) {
      setError('Enter a whole number of 1 or more.');
      toast.error('Enter a whole number of 1 or more.');
      return;
    }
    setError(null);
    setPosition.mutate(
      { enrolmentId: row.id, position: n },
      {
        onSuccess: (res) => {
          if (res.currentLessonPosition !== n) {
            toast.success(`Position set to ${res.currentLessonPosition} (the API capped your value of ${n})`);
          } else {
            toast.success(`Lesson position set to ${res.currentLessonPosition}`);
          }
          onDone();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Set lesson position">
      <Field
        label="Lesson position"
        htmlFor="enr-position"
        required
        error={error}
        hint={row.currentLevel ? `Within level ${row.currentLevel.position}: ${row.currentLevel.name}` : undefined}
      >
        <TextInput
          id="enr-position"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={value}
          aria-invalid={Boolean(error)}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2">
        <UiButton variant="secondary" onClick={onDone} disabled={setPosition.isPending}>
          Cancel
        </UiButton>
        <UiButton type="submit" loading={setPosition.isPending}>
          Save position
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
      <div className="grid gap-3 sm:grid-cols-2">
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
