'use client';

import React, { useMemo, useState } from 'react';
import { Alert, ErrorState, Field, LoadingState, Modal, Select, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useChangeWeeklyTimes } from '@/hooks/useBilling';
import { FamilySubscription, WeekdayCode } from '@/lib/api/modules/billing-family';
import { viewerTimeZone } from '@/lib/api/modules/scheduling-admin';
import { dateInZone } from '@/lib/continue-with-teacher';
import {
  LOOKAHEAD_DAYS,
  PickedTimes,
  WeeklyTimesGrid,
  pickedSlots,
  togglePicked,
  useWeeklyOptions,
} from '../parent/WeeklyTimes';

/**
 * Moves a child's regular classes to new weekly times with the same teacher (R18): after a
 * plan change with a different number of classes, or whenever the family's week changes.
 */
export function WeeklyTimesModal({
  subscription: s,
  classMinutes,
  onClose,
}: {
  subscription: FamilySubscription;
  classMinutes: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const change = useChangeWeeklyTimes();
  const zone = useMemo(() => viewerTimeZone(), []);
  const enrolments = (s.enrolments ?? []).filter((e) => e.status === 'ACTIVE' && e.teacher);
  const [enrolmentId, setEnrolmentId] = useState(enrolments[0]?.id ?? '');
  const enrolment = enrolments.find((e) => e.id === enrolmentId);
  const [startsOn, setStartsOn] = useState(() => dateInZone(zone, 1));
  const [picked, setPicked] = useState<PickedTimes>({});
  const needed = s.plan.classesPerWeek;
  const { slots, options, noTimes } = useWeeklyOptions(enrolment?.teacher?.id, classMinutes, zone);
  const chosen = pickedSlots(picked);

  const toggle = (day: WeekdayCode, time: string) => {
    const next = togglePicked(picked, day, time, needed);
    if (next) setPicked(next);
    else toast.error(`This plan has ${needed} classes a week. Remove a day first.`);
  };

  const save = () =>
    change.mutate(
      { subscriptionId: s.id, body: { enrolmentId, timeZone: zone, startsOn, slots: chosen } },
      {
        onSuccess: () => {
          toast.success('Weekly times updated. The new classes are in your timetable.');
          onClose();
        },
        onError: (error) => toast.error(error),
      },
    );

  return (
    <Modal
      open
      size="lg"
      onClose={change.isPending ? () => undefined : onClose}
      title="Change weekly times"
      description={`${needed} ${needed === 1 ? 'class' : 'classes'} a week · times in ${zone}`}
      footer={
        <>
          <UiButton variant="secondary" onClick={onClose} disabled={change.isPending}>
            Back
          </UiButton>
          <UiButton onClick={save} loading={change.isPending} disabled={!enrolment || chosen.length !== needed || !startsOn}>
            Save new times
          </UiButton>
        </>
      }
    >
      {enrolments.length === 0 ? (
        <Alert tone="warning">No teacher is assigned yet. The academy will agree the times with you.</Alert>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {enrolments.length > 1 && (
              <Field label="Child" htmlFor="wt-child">
                <Select
                  id="wt-child"
                  value={enrolmentId}
                  onChange={(e) => {
                    setEnrolmentId(e.target.value);
                    setPicked({});
                  }}
                >
                  {enrolments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.student.displayName} · {e.course.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="New times start on" htmlFor="wt-start" hint="Classes from this day on move to the new times.">
              <TextInput
                id="wt-start"
                type="date"
                min={dateInZone(zone, 1)}
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </Field>
          </div>
          {slots.isLoading ? (
            <LoadingState label={`Checking ${enrolment?.teacher?.user.name ?? 'the teacher'}’s free times…`} />
          ) : slots.isError ? (
            <ErrorState error={slots.error} onRetry={() => slots.refetch()} />
          ) : noTimes ? (
            <Alert tone="warning">
              {enrolment?.teacher?.user.name ?? 'The teacher'} has no free times in the next {LOOKAHEAD_DAYS} days. Please
              message the academy to arrange times.
            </Alert>
          ) : (
            <>
              <p className="text-xs font-semibold text-ink-2" aria-live="polite">
                {chosen.length} of {needed} chosen · with {enrolment?.teacher?.user.name}
              </p>
              <WeeklyTimesGrid options={options} picked={picked} onToggle={toggle} />
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
