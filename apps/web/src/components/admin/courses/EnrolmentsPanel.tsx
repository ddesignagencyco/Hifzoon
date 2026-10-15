'use client';

import React, { useState } from 'react';
import { ListOrdered, Plus, RefreshCcw } from 'lucide-react';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
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
import {
  ENROLMENT_STATUSES,
  EnrolmentFilters,
  EnrolmentRow,
  EnrolmentStatus,
  isUuid,
} from '@/lib/api/modules/courses-admin';
import { useLoadErrorToast } from '../shared/Pickers';

/** Statuses an operator can set. COMPLETED is refused by the API for every role today. */
const SETTABLE: EnrolmentStatus[] = ['TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED'];

/** Enrolments tab: filters + status / lesson-position actions + new enrolment (FR-CRS-02). */
export function EnrolmentsPanel() {
  const [form, setForm] = useState<EnrolmentFilters>({ status: '', studentId: '', teacherUserId: '' });
  const [filters, setFilters] = useState<EnrolmentFilters>({ status: '' });
  const [filterErrors, setFilterErrors] = useState<{ studentId?: string; teacherUserId?: string }>({});
  const query = useAdminEnrolments(filters);
  const [statusRow, setStatusRow] = useState<EnrolmentRow | null>(null);
  const [positionRow, setPositionRow] = useState<EnrolmentRow | null>(null);
  const [creating, setCreating] = useState(false);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof filterErrors = {};
    if (form.studentId?.trim() && !isUuid(form.studentId)) errs.studentId = 'Student ID must be a UUID.';
    if (form.teacherUserId?.trim() && !isUuid(form.teacherUserId)) errs.teacherUserId = 'Teacher user ID must be a UUID.';
    setFilterErrors(errs);
    if (Object.keys(errs).length === 0) setFilters({ ...form });
  };

  return (
    <Card>
      <CardHeader
        title="Enrolments"
        description="Newest first; the API returns at most 200 rows, so narrow with filters."
        action={
          <UiButton icon={<Plus className="w-4 h-4" aria-hidden />} onClick={() => setCreating(true)}>
            New enrolment
          </UiButton>
        }
      />
      <CardBody>
        <form onSubmit={apply} noValidate className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4" aria-label="Filter enrolments">
          <Field label="Status" htmlFor="enr-status">
            <Select
              id="enr-status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as EnrolmentStatus | '' }))}
            >
              <option value="">All statuses</option>
              {ENROLMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Student ID" htmlFor="enr-student" error={filterErrors.studentId}>
            <TextInput
              id="enr-student"
              value={form.studentId}
              placeholder="UUID"
              onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))}
            />
          </Field>
          <Field label="Teacher user ID" htmlFor="enr-teacher" error={filterErrors.teacherUserId}>
            <TextInput
              id="enr-teacher"
              value={form.teacherUserId}
              placeholder="UUID"
              onChange={(e) => setForm((f) => ({ ...f, teacherUserId: e.target.value }))}
            />
          </Field>
          <div className="flex items-end">
            <UiButton type="submit" variant="secondary" loading={query.isFetching}>
              Apply filters
            </UiButton>
          </div>
        </form>

        <div className="-mx-5 sm:mx-0">
          <QueryState query={query} empty={<EmptyState title="No enrolments match these filters" />}>
            {(rows) => (
              <DataTable
                rows={rows}
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
                  { key: 'teacher', header: 'Teacher', render: (r) => r.teacher?.user.name ?? <span className="text-muted">Unassigned</span> },
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

      <StatusModal row={statusRow} onClose={() => setStatusRow(null)} />
      <PositionModal row={positionRow} onClose={() => setPositionRow(null)} />
      <CreateEnrolmentModal open={creating} onClose={() => setCreating(false)} />
    </Card>
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
  const [status, setStatus] = useState<EnrolmentStatus>(row.status === 'COMPLETED' ? 'ACTIVE' : row.status);
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
  const [values, setValues] = useState({ studentId: '', courseId: '', teacherId: '', status: 'TRIAL' as EnrolmentStatus });
  const [errors, setErrors] = useState<Partial<Record<'studentId' | 'courseId' | 'teacherId', string>>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!isUuid(values.studentId)) next.studentId = 'Student ID must be a UUID.';
    if (!values.courseId) next.courseId = 'Choose a course.';
    if (values.teacherId.trim() && !isUuid(values.teacherId)) next.teacherId = 'Teacher profile ID must be a UUID.';
    setErrors(next);
    if (Object.keys(next).length > 0) return toast.error(Object.values(next).find(Boolean) ?? 'Please fix the highlighted fields');
    create.mutate(
      {
        studentId: values.studentId.trim(),
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
      <Field label="Student ID" htmlFor="new-enr-student" required error={errors.studentId}>
        <TextInput
          id="new-enr-student"
          value={values.studentId}
          placeholder="UUID"
          aria-invalid={Boolean(errors.studentId)}
          onChange={(e) => setValues((v) => ({ ...v, studentId: e.target.value }))}
        />
      </Field>
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
        <Field label="Teacher profile ID (optional)" htmlFor="new-enr-teacher" error={errors.teacherId} hint="Must be ready to match.">
          <TextInput
            id="new-enr-teacher"
            value={values.teacherId}
            placeholder="UUID"
            aria-invalid={Boolean(errors.teacherId)}
            onChange={(e) => setValues((v) => ({ ...v, teacherId: e.target.value }))}
          />
        </Field>
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
