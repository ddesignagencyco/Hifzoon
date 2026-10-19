'use client';

import React, { useState } from 'react';
import { CalendarClock, XCircle } from 'lucide-react';
import {
  Alert,
  Badge,
  Field,
  Modal,
  StatusBadge,
  TextArea,
  TextInput,
  UiButton,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useCancelTeacherClass, useRescheduleTeacherClass } from '@/hooks/useTeacherSchedule';
import {
  CANCEL_REASON_MAX,
  DURATION_MAX,
  DURATION_MIN,
  classStudentNames,
  TimetableClass,
} from '@/lib/api/modules/teacher-schedule';
import { BriefLink, ClassroomLink, canEnterClassroom } from './ClassListItem';
import { formatInZone, splitInZone, zonedTimeToUtc } from './zoned-time';

type Mode = 'view' | 'cancel' | 'reschedule';

/** Class details with cancel / reschedule actions (FR-SCH-04). Remount per class via `key`. */
export function ClassDetailModal({ cls, zone, onClose }: { cls: TimetableClass; zone: string; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('view');
  const durationMinutes = Math.round((new Date(cls.endsAt).getTime() - new Date(cls.startsAt).getTime()) / 60_000);
  const canCancel = cls.status === 'SCHEDULED' || cls.status === 'LIVE';
  const canReschedule = cls.status === 'SCHEDULED';

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={classStudentNames(cls) || 'Class'}
      description={`${cls.course?.name ?? 'Course not set'} · ${formatInZone(cls.startsAt, zone, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })} (${zone})`}
    >
      {mode === 'view' && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Type</dt>
              <dd className="mt-0.5"><Badge>{humanize(cls.type)}</Badge></dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Status</dt>
              <dd className="mt-0.5"><StatusBadge status={cls.status} /></dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Duration</dt>
              <dd className="mt-0.5 text-ink">{durationMinutes} minutes</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Students</dt>
              <dd className="mt-0.5 text-ink">{cls.students.length}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <BriefLink classId={cls.id} />
            {canEnterClassroom(cls.status) && <ClassroomLink classId={cls.id} live={cls.status === 'LIVE'} />}
          </div>
          {(canCancel || canReschedule) && (
            <div className="flex flex-wrap gap-2 pt-3 border-t border-line">
              {canReschedule && (
                <UiButton
                  variant="secondary"
                  size="sm"
                  icon={<CalendarClock className="w-3.5 h-3.5" aria-hidden />}
                  onClick={() => setMode('reschedule')}
                >
                  Reschedule
                </UiButton>
              )}
              {canCancel && (
                <UiButton
                  variant="ghost"
                  size="sm"
                  className="text-red"
                  icon={<XCircle className="w-3.5 h-3.5" aria-hidden />}
                  onClick={() => setMode('cancel')}
                >
                  Cancel class
                </UiButton>
              )}
            </div>
          )}
        </div>
      )}
      {mode === 'cancel' && <CancelForm cls={cls} onBack={() => setMode('view')} onDone={onClose} />}
      {mode === 'reschedule' && (
        <RescheduleForm
          cls={cls}
          zone={zone}
          durationMinutes={durationMinutes}
          onBack={() => setMode('view')}
          onDone={onClose}
        />
      )}
    </Modal>
  );
}

function CancelForm({ cls, onBack, onDone }: { cls: TimetableClass; onBack: () => void; onDone: () => void }) {
  const toast = useToast();
  const cancel = useCancelTeacherClass();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    const problem = !trimmed
      ? 'Tell the family why the class is cancelled.'
      : trimmed.length > CANCEL_REASON_MAX
        ? `Keep the reason under ${CANCEL_REASON_MAX} characters.`
        : null;
    setError(problem);
    if (problem) {
      toast.error(problem);
      return;
    }
    cancel.mutate(
      { classId: cls.id, reason: trimmed },
      {
        onSuccess: (result) => {
          toast.success(
            result.makeUpCredits > 0
              ? `Class cancelled. ${result.makeUpCredits} make-up credit${result.makeUpCredits === 1 ? '' : 's'} issued to the family.`
              : 'Class cancelled.',
          );
          onDone();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Alert tone="warning" title="Cancelling as the teacher">
        The family will see this on their timetable.
      </Alert>
      <Field label="Reason" htmlFor="cancel-reason" required error={error} hint={`${reason.trim().length}/${CANCEL_REASON_MAX}`}>
        <TextArea
          id="cancel-reason"
          value={reason}
          maxLength={CANCEL_REASON_MAX}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={Boolean(error)}
          rows={3}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <UiButton variant="secondary" onClick={onBack} disabled={cancel.isPending}>
          Back
        </UiButton>
        <UiButton type="submit" variant="danger" loading={cancel.isPending}>
          Cancel class
        </UiButton>
      </div>
    </form>
  );
}

function RescheduleForm({
  cls,
  zone,
  durationMinutes,
  onBack,
  onDone,
}: {
  cls: TimetableClass;
  zone: string;
  durationMinutes: number;
  onBack: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const reschedule = useRescheduleTeacherClass();
  const initial = splitInZone(cls.startsAt, zone);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [duration, setDuration] = useState(String(durationMinutes));
  const [errors, setErrors] = useState<{ when?: string; duration?: string }>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    let newStartsAt: Date | null = null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      next.when = 'Choose a date and time.';
    } else {
      newStartsAt = zonedTimeToUtc(date, time, zone);
      if (newStartsAt.getTime() <= Date.now()) next.when = 'A class cannot be moved into the past.';
    }
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < DURATION_MIN || minutes > DURATION_MAX) {
      next.duration = `Duration must be a whole number between ${DURATION_MIN} and ${DURATION_MAX} minutes.`;
    }
    setErrors(next);
    if (next.when || next.duration || !newStartsAt) {
      toast.error(next.when ?? next.duration ?? 'Please fix the highlighted fields');
      return;
    }

    reschedule.mutate(
      {
        classId: cls.id,
        newStartsAt: newStartsAt.toISOString(),
        ...(minutes !== durationMinutes ? { durationMinutes: minutes } : {}),
      },
      {
        onSuccess: (moved) => {
          toast.success(
            `Class moved to ${formatInZone(moved.startsAt, zone, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`,
          );
          onDone();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-xs text-muted">
        Times are in <span className="font-semibold text-ink-2">{zone}</span>. The family&apos;s reminders are re-planned
        automatically.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="New date" htmlFor="resched-date" required error={errors.when}>
          <TextInput id="resched-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={Boolean(errors.when)} />
        </Field>
        <Field label="New start time" htmlFor="resched-time" required>
          <TextInput id="resched-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field label="Duration (minutes)" htmlFor="resched-duration" error={errors.duration} hint={`${DURATION_MIN}–${DURATION_MAX} minutes`}>
        <TextInput
          id="resched-duration"
          type="number"
          inputMode="numeric"
          min={DURATION_MIN}
          max={DURATION_MAX}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          aria-invalid={Boolean(errors.duration)}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <UiButton variant="secondary" onClick={onBack} disabled={reschedule.isPending}>
          Back
        </UiButton>
        <UiButton type="submit" loading={reschedule.isPending}>
          Move class
        </UiButton>
      </div>
    </form>
  );
}
