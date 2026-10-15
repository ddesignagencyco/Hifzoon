'use client';

import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Alert,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  Select,
  TextArea,
  UiButton,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useBookClass, useCancelClass, useOpenSlots, useRateClass, useRescheduleClass } from '@/hooks/useParentSchedule';
import {
  CANCELLATION_NOTICE_HOURS,
  classDurationMinutes,
  formatSlotTime,
  groupSlotsByDay,
  hoursUntil,
  isLateCancellation,
  OpenSlot,
  slotsInWindow,
  TimetableEntry,
  validateCancelReason,
} from '@/lib/api/modules/scheduling-family';
import { validateRating } from '@/lib/api/modules/quality-rating';
import { EnrolmentRecord } from '@/lib/api/modules/enrolments';
import { ApiClientError } from '@/lib/api/http';
import { formatClassTime, StarRatingInput, viewerTimeZone } from './shared';

// ── Slot picker ──────────────────────────────────────────────────────────────

const WINDOW_DAYS = 14;

function useSlotWindow() {
  // Fixed per modal open: from "now" to +14 days.
  return useMemo(() => {
    const from = new Date();
    const to = new Date(from.getTime() + WINDOW_DAYS * 86_400_000);
    return { from, to };
  }, []);
}

/**
 * Lists bookable open slots for one teacher, grouped by day in the viewer's zone.
 * The open-slot search cannot filter by teacher, so slots are filtered client-side.
 */
function SlotPicker({
  durationMinutes,
  matches,
  value,
  onChange,
}: {
  durationMinutes: number;
  matches: (slot: OpenSlot) => boolean;
  value: string | null;
  onChange: (slot: OpenSlot) => void;
}) {
  const zone = viewerTimeZone();
  const { from, to } = useSlotWindow();
  const slots = useOpenSlots({
    from: from.toISOString(),
    to: to.toISOString(),
    visitorZone: zone,
    durationMinutes: Math.min(240, Math.max(15, durationMinutes)),
    limit: 500,
  });
  const [dayIndex, setDayIndex] = useState(0);

  if (slots.isLoading) return <LoadingState label="Finding open times…" />;
  if (slots.isError) return <ErrorState error={slots.error} onRetry={() => slots.refetch()} />;
  const usable = slotsInWindow(slots.data ?? [], from, to).filter(matches);
  if (usable.length === 0) {
    return <EmptyState title="No open times" description={`The teacher has no free ${durationMinutes}-minute slots in the next ${WINDOW_DAYS} days.`} />;
  }
  const days = groupSlotsByDay(usable, zone);
  const day = days[Math.min(dayIndex, days.length - 1)];

  return (
    <div className="space-y-3">
      <Field label="Day" htmlFor="slot-day" hint={`Times shown in ${zone}`}>
        <Select id="slot-day" value={String(Math.min(dayIndex, days.length - 1))} onChange={(e) => setDayIndex(Number(e.target.value))}>
          {days.map((d, i) => (
            <option key={d.day} value={i}>{d.day} ({d.slots.length} times)</option>
          ))}
        </Select>
      </Field>
      <fieldset>
        <legend className="block text-xs font-semibold text-ink-2 mb-1.5">Start time</legend>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto p-0.5">
          {day.slots.map((slot) => {
            const selected = value === slot.startsAt;
            return (
              <label
                key={`${slot.teacherId}-${slot.startsAt}`}
                className={cn(
                  'flex items-center justify-center h-9 rounded-xl border text-sm cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold',
                  selected ? 'bg-green-800 text-white border-green-800' : 'bg-white border-line text-ink hover:bg-sand',
                )}
              >
                <input
                  type="radio"
                  name="slot"
                  className="sr-only"
                  checked={selected}
                  onChange={() => onChange(slot)}
                />
                {formatSlotTime(slot.startsAt, zone)}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

// ── Cancel ───────────────────────────────────────────────────────────────────

export function CancelClassModal({ entry, onClose }: { entry: TimetableEntry | null; onClose: () => void }) {
  const toast = useToast();
  const cancel = useCancelClass();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!entry) return null;
  const late = isLateCancellation(entry.startsAt);
  const hours = Math.max(0, hoursUntil(entry.startsAt));
  const names = entry.students.map((s) => s.student.displayName).join(', ');

  const close = () => {
    if (cancel.isPending) return;
    setReason('');
    setError(null);
    onClose();
  };

  const submit = () => {
    const problem = validateCancelReason(reason);
    setError(problem);
    if (problem) return toast.error(problem);
    cancel.mutate(
      { classId: entry.id, reason },
      {
        onSuccess: (res) => {
          toast.success(
            res.charged
              ? `Class cancelled. It was inside the ${res.noticeHours}-hour notice window, so it is still charged.`
              : 'Class cancelled. You will not be charged.',
          );
          setReason('');
          onClose();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <Modal
      open
      onClose={close}
      title="Cancel this class?"
      description={`${names} · ${formatClassTime(entry.startsAt, entry.endsAt)}`}
      footer={
        <>
          <UiButton variant="secondary" onClick={close} disabled={cancel.isPending}>Keep class</UiButton>
          <UiButton variant="danger" onClick={submit} loading={cancel.isPending}>Cancel class</UiButton>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone={late ? 'warning' : 'neutral'} title="Cancellation policy">
          Cancel at least {CANCELLATION_NOTICE_HOURS} hours before the start and you won’t be charged. Inside that window the
          teacher has kept the time free, so the class is still charged.{' '}
          {late
            ? `This class starts in ${hours < 1 ? 'less than an hour' : `about ${Math.floor(hours)} hours`} — it will be charged.`
            : 'This cancellation is within the free window.'}
          {' '}Consider rescheduling instead.
        </Alert>
        <Field label="Reason for the teacher" htmlFor="cancel-reason" required error={error}>
          <TextArea id="cancel-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// ── Reschedule ───────────────────────────────────────────────────────────────

export function RescheduleModal({ entry, onClose }: { entry: TimetableEntry | null; onClose: () => void }) {
  const toast = useToast();
  const reschedule = useRescheduleClass();
  const [slot, setSlot] = useState<OpenSlot | null>(null);
  if (!entry) return null;
  const duration = classDurationMinutes(entry);
  const teacherName = entry.teacher.user.name;

  const close = () => {
    if (reschedule.isPending) return;
    setSlot(null);
    onClose();
  };

  const submit = () => {
    if (!slot) return;
    reschedule.mutate(
      { classId: entry.id, newStartsAt: slot.startsAt },
      {
        onSuccess: (res) => {
          toast.success(`Class moved to ${formatClassTime(res.startsAt, res.endsAt)}.`);
          setSlot(null);
          onClose();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <Modal
      open
      onClose={close}
      size="lg"
      title="Reschedule class"
      description={`Currently ${formatClassTime(entry.startsAt, entry.endsAt)} with ${teacherName}. Pick a new time with the same teacher.`}
      footer={
        <>
          <UiButton variant="secondary" onClick={close} disabled={reschedule.isPending}>Cancel</UiButton>
          <UiButton onClick={submit} loading={reschedule.isPending} disabled={!slot}>Move class</UiButton>
        </>
      }
    >
      <SlotPicker
        durationMinutes={duration}
        // The timetable row carries only the teacher's name, so match on it.
        matches={(s) => s.teacherName === teacherName}
        value={slot?.startsAt ?? null}
        onChange={setSlot}
      />
    </Modal>
  );
}

// ── Book ─────────────────────────────────────────────────────────────────────

const DURATIONS = [30, 45, 60];

export function BookClassModal({ enrolment, onClose }: { enrolment: EnrolmentRecord | null; onClose: () => void }) {
  const toast = useToast();
  const book = useBookClass();
  const [duration, setDuration] = useState(30);
  const [slot, setSlot] = useState<OpenSlot | null>(null);
  if (!enrolment || !enrolment.teacher) return null;
  const teacherId = enrolment.teacher.id;

  const close = () => {
    if (book.isPending) return;
    setSlot(null);
    onClose();
  };

  const submit = () => {
    if (!slot) return;
    book.mutate(
      {
        teacherId,
        courseId: enrolment.course.id,
        studentId: enrolment.student.id,
        enrolmentId: enrolment.id,
        startsAt: slot.startsAt,
        durationMinutes: duration,
        type: enrolment.status === 'TRIAL' ? 'TRIAL' : 'REGULAR',
      },
      {
        onSuccess: (res) => {
          toast.success(`Class booked for ${formatClassTime(res.startsAt, res.endsAt)}.`);
          setSlot(null);
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiClientError && err.code === 'CONSENT_REQUIRED') {
            toast.error(`Give consent for lesson records for ${enrolment.student.displayName} before booking.`);
            return;
          }
          toast.error(err);
        },
      },
    );
  };

  return (
    <Modal
      open
      onClose={close}
      size="lg"
      title={`Book a ${enrolment.course.name} class`}
      description={`For ${enrolment.student.displayName} with ${enrolment.teacher.user.name}.`}
      footer={
        <>
          <UiButton variant="secondary" onClick={close} disabled={book.isPending}>Cancel</UiButton>
          <UiButton onClick={submit} loading={book.isPending} disabled={!slot}>Book class</UiButton>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Length" htmlFor="book-duration">
          <Select
            id="book-duration"
            value={duration}
            onChange={(e) => {
              setDuration(Number(e.target.value));
              setSlot(null);
            }}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>{d} minutes</option>
            ))}
          </Select>
        </Field>
        <SlotPicker
          key={duration}
          durationMinutes={duration}
          matches={(s) => s.teacherId === teacherId}
          value={slot?.startsAt ?? null}
          onChange={setSlot}
        />
      </div>
    </Modal>
  );
}

// ── Rate ─────────────────────────────────────────────────────────────────────

export function RateClassModal({ entry, onClose }: { entry: TimetableEntry | null; onClose: () => void }) {
  const toast = useToast();
  const rate = useRateClass();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<{ stars?: string; comment?: string }>({});
  if (!entry) return null;

  const close = () => {
    if (rate.isPending) return;
    setStars(0);
    setComment('');
    setErrors({});
    onClose();
  };

  const submit = () => {
    const found = validateRating({ stars, comment });
    setErrors(found);
    if (Object.keys(found).length > 0) return toast.error(Object.values(found).find(Boolean) ?? 'Please fix the highlighted fields');
    rate.mutate(
      { classId: entry.id, stars, comment, studentId: entry.students[0]?.student.id },
      {
        onSuccess: () => {
          toast.success('Thank you — your rating was sent.');
          close();
        },
        onError: (err) => {
          if (err instanceof ApiClientError && err.status === 403) {
            toast.error('Only a guardian who joined this class can rate it.');
            return;
          }
          toast.error(err);
        },
      },
    );
  };

  return (
    <Modal
      open
      onClose={close}
      title="Rate this class"
      description={`${formatClassTime(entry.startsAt, entry.endsAt)} with ${entry.teacher.user.name}`}
      footer={
        <>
          <UiButton variant="secondary" onClick={close} disabled={rate.isPending}>Cancel</UiButton>
          <UiButton onClick={submit} loading={rate.isPending}>Send rating</UiButton>
        </>
      }
    >
      <div className="space-y-4">
        <StarRatingInput value={stars} onChange={setStars} label="How was the class?" error={errors.stars} />
        <Field label="Comment (optional)" htmlFor="rate-comment" error={errors.comment} hint="Shared with the academy’s quality team.">
          <TextArea id="rate-comment" value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
