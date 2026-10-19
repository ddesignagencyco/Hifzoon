'use client';

import React, { useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
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
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  useAdminEnrolments,
  useAdminMatching,
  useAdminTeacherAvailability,
  useCreateSchedule,
} from '@/hooks/useAdminScheduling';
import {
  CreateScheduleInput,
  CreatedSchedule,
  RRuleWeekday,
  RecurrenceSpec,
  RoomType,
  ScheduleFormErrors,
  WEEKDAYS,
  buildRRule,
  describeRRule,
  listTimeZones,
  validateScheduleInput,
  viewerTimeZone,
} from '@/lib/api/modules/scheduling-admin';
import { cn } from '@/lib/utils';
import { toLocalDateValue } from '../shared/AdminUi';
import { PickedTeacher, TeacherPicker, useLoadErrorToast } from '../shared/Pickers';

type EndKind = 'never' | 'count' | 'until';

/**
 * Recurring schedule builder (`POST /scheduling/schedules`). Serialises a weekday
 * picker + interval + end condition to the RRULE subset the API accepts.
 */
export function ScheduleBuilder({
  initialEnrolmentId = '',
  initialTeacherId = '',
  onCreated,
}: {
  initialEnrolmentId?: string;
  initialTeacherId?: string;
  onCreated?: (result: CreatedSchedule) => void;
}) {
  const toast = useToast();
  const create = useCreateSchedule();
  const enrolments = useAdminEnrolments();
  useLoadErrorToast(enrolments.isError, 'Could not load enrolments.');
  const zones = useMemo(() => listTimeZones(), []);

  const [enrolmentId, setEnrolmentId] = useState(initialEnrolmentId);
  const [teacherId, setTeacherId] = useState(initialTeacherId);
  const [freq, setFreq] = useState<'WEEKLY' | 'DAILY'>('WEEKLY');
  const [interval, setIntervalValue] = useState(1);
  const [byDay, setByDay] = useState<RRuleWeekday[]>([]);
  const [endKind, setEndKind] = useState<EndKind>('never');
  const [count, setCount] = useState(12);
  const [untilDate, setUntilDate] = useState('');
  const [localStartTime, setLocalStartTime] = useState('16:00');
  const [familyTimeZone, setFamilyTimeZone] = useState(viewerTimeZone);
  const [durationMinutes, setDuration] = useState(30);
  const [roomType, setRoomType] = useState<RoomType>('ONE_TO_ONE');
  const [startsOn, setStartsOn] = useState(() => toLocalDateValue(new Date()));
  const [endsOn, setEndsOn] = useState('');
  const [errors, setErrors] = useState<ScheduleFormErrors>({});

  const schedulable = (enrolments.data ?? []).filter((e) => !['CANCELLED', 'COMPLETED'].includes(e.status));
  const enrolment = enrolments.data?.find((e) => e.id === enrolmentId);
  const matching = useAdminMatching(enrolment?.student.id, enrolment?.course.id);
  const availability = useAdminTeacherAvailability(teacherId || null);

  const suggestions: PickedTeacher[] = (matching.data?.suggestions ?? []).map((s) => ({ id: s.teacherId, name: `${s.name} (suggested)` }));

  const recurrence: RecurrenceSpec = {
    freq,
    interval,
    byDay,
    end:
      endKind === 'count' ? { kind: 'count', count } : endKind === 'until' ? { kind: 'until', date: untilDate } : { kind: 'never' },
  };
  const rrule = buildRRule(recurrence);

  const toggleDay = (code: RRuleWeekday) =>
    setByDay((days) => (days.includes(code) ? days.filter((d) => d !== code) : [...days, code]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: Omit<CreateScheduleInput, 'rrule'> = {
      enrolmentId,
      teacherId,
      localStartTime,
      familyTimeZone,
      durationMinutes,
      roomType,
      startsOn,
      endsOn: endsOn || undefined,
    };
    const found = validateScheduleInput(input, recurrence);
    setErrors(found);
    if (Object.keys(found).length > 0) return toast.error(Object.values(found).find(Boolean) ?? 'Please fix the highlighted fields');
    create.mutate(
      { ...input, rrule },
      {
        onSuccess: (res) => {
          toast.success(`Schedule created — ${res.sessions.length} classes materialised`);
          onCreated?.(res);
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Create recurring schedule" className="grid gap-6 lg:grid-cols-2 items-start">
      <Card>
        <CardHeader title="Who" description="Only fully cleared teachers can be scheduled." />
        <CardBody className="space-y-4">
          <Field label="Enrolment" htmlFor="sched-enrolment" required error={errors.enrolmentId}>
            <Select id="sched-enrolment" value={enrolmentId} onChange={(e) => setEnrolmentId(e.target.value)}>
              <option value="">{enrolments.isLoading ? 'Loading enrolments…' : 'Select an enrolment'}</option>
              {schedulable.map((en) => (
                <option key={en.id} value={en.id}>
                  {en.student.displayName} · {en.course.name} · {humanize(en.status)}
                  {en.teacher ? ` · ${en.teacher.user.name}` : ''}
                </option>
              ))}
              {enrolmentId && !schedulable.some((e) => e.id === enrolmentId) && <option value={enrolmentId}>Enrolment {enrolmentId.slice(0, 8)}…</option>}
            </Select>
          </Field>
          {matching.data && matching.data.suggestions.length > 0 && (
            <div className="space-y-2" aria-label="Suggested teachers">
              <p className="text-[11px] font-semibold text-ink-2">Suggested for this student (best match first)</p>
              <ul className="space-y-1.5">
                {matching.data.suggestions.slice(0, 3).map((s) => (
                  <li
                    key={s.teacherId}
                    className={`rounded-xl border px-3 py-2 flex items-start justify-between gap-3 ${
                      s.teacherId === teacherId ? 'border-green-800 bg-green-50' : 'border-line'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-semibold text-ink">
                        {s.name}
                        {(s.ratingCount ?? 0) > 0 && (
                          <span className="ml-1.5 font-normal text-muted">
                            ★ {Number(s.ratingAvg).toFixed(1)} ({s.ratingCount})
                          </span>
                        )}
                      </p>
                      {(s.reasons ?? []).length > 0 && <p className="text-[11px] text-muted">{s.reasons.join(' · ')}</p>}
                      <p className="text-[11px] text-muted">
                        {(s.availableWeekdays ?? []).length > 0
                          ? `Available ${s.availableWeekdays.map((d) => WEEKDAYS[d]?.short).filter(Boolean).join(', ')}`
                          : 'No weekly availability set'}{' '}
                        {s.timeZone ? `· ${s.timeZone}` : ''}
                      </p>
                    </div>
                    <UiButton
                      size="sm"
                      variant={s.teacherId === teacherId ? 'primary' : 'secondary'}
                      onClick={() => setTeacherId(s.teacherId)}
                      aria-pressed={s.teacherId === teacherId}
                    >
                      {s.teacherId === teacherId ? 'Selected' : 'Use'}
                    </UiButton>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <TeacherPicker
            id="sched-teacher"
            required
            value={teacherId}
            extra={suggestions}
            error={errors.teacherId}
            onChange={(t) => setTeacherId(t?.id ?? '')}
          />
          {teacherId && availability.data && (
            <div className="rounded-xl bg-cream border border-line px-3 py-2">
              <p className="text-[11px] font-semibold text-ink-2">Weekly availability ({availability.data.timeZone})</p>
              {availability.data.slots.length === 0 ? (
                <p className="text-[11px] text-muted">No availability set.</p>
              ) : (
                <ul className="text-[11px] text-ink-2 mt-1 grid grid-cols-2 gap-x-3">
                  {availability.data.slots.map((s, i) => (
                    <li key={i}>
                      {WEEKDAYS[s.weekday]?.short} {s.startTime}–{s.endTime}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <Field label="Room" htmlFor="sched-room">
            <Select id="sched-room" value={roomType} onChange={(e) => setRoomType(e.target.value as RoomType)}>
              <option value="ONE_TO_ONE">One to one</option>
              <option value="CIRCLE">Circle</option>
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="When" description="Times are in the family's zone and keep their wall-clock time across DST." />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Repeats" htmlFor="sched-freq">
              <Select id="sched-freq" value={freq} onChange={(e) => setFreq(e.target.value as 'WEEKLY' | 'DAILY')}>
                <option value="WEEKLY">Weekly</option>
                <option value="DAILY">Daily</option>
              </Select>
            </Field>
            <Field label={`Every (${freq === 'WEEKLY' ? 'weeks' : 'days'})`} htmlFor="sched-interval">
              <TextInput
                id="sched-interval"
                type="number"
                min={1}
                max={12}
                value={interval}
                onChange={(e) => setIntervalValue(Number(e.target.value))}
              />
            </Field>
          </div>
          {freq === 'WEEKLY' && (
            <fieldset>
              <legend className={cn('text-xs font-semibold mb-1.5', errors.recurrence ? 'text-red' : 'text-ink-2')}>
                On<span className="text-red ml-0.5" aria-hidden>*</span>
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = byDay.includes(d.code);
                  return (
                    <button
                      key={d.code}
                      type="button"
                      aria-pressed={on}
                      aria-label={d.long}
                      onClick={() => toggleDay(d.code)}
                      className={cn(
                        'w-11 h-9 rounded-full text-xs font-semibold border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                        on ? 'bg-green-800 border-green-800 text-white' : 'bg-white border-line text-ink-2 hover:bg-sand',
                      )}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time" htmlFor="sched-time" required error={errors.localStartTime}>
              <TextInput id="sched-time" type="time" value={localStartTime} onChange={(e) => setLocalStartTime(e.target.value)} />
            </Field>
            <Field label="Duration (min)" htmlFor="sched-duration" required error={errors.durationMinutes}>
              <TextInput
                id="sched-duration"
                type="number"
                min={5}
                max={480}
                step={5}
                value={durationMinutes}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label="Family time zone" htmlFor="sched-zone" required error={errors.familyTimeZone}>
            <Select id="sched-zone" value={familyTimeZone} onChange={(e) => setFamilyTimeZone(e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts on" htmlFor="sched-starts" required error={errors.startsOn}>
              <TextInput id="sched-starts" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </Field>
            <Field label="Schedule ends on" htmlFor="sched-ends" hint="Optional" error={errors.endsOn}>
              <TextInput id="sched-ends" type="date" min={startsOn} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </Field>
          </div>
          <fieldset>
            <legend className="text-xs font-semibold text-ink-2 mb-1.5">Recurrence ends</legend>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="sched-end" checked={endKind === 'never'} onChange={() => setEndKind('never')} className="accent-green-800" />
                Never
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="sched-end" checked={endKind === 'count'} onChange={() => setEndKind('count')} className="accent-green-800" />
                After
                <input
                  aria-label="Number of classes"
                  type="number"
                  min={1}
                  value={count}
                  disabled={endKind !== 'count'}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-20 h-8 rounded-lg border border-line px-2 text-sm disabled:bg-sand"
                />
                classes
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="sched-end" checked={endKind === 'until'} onChange={() => setEndKind('until')} className="accent-green-800" />
                On
                <input
                  aria-label="Recurrence end date"
                  type="date"
                  value={untilDate}
                  min={startsOn}
                  disabled={endKind !== 'until'}
                  onChange={(e) => setUntilDate(e.target.value)}
                  className="h-8 rounded-lg border border-line px-2 text-sm disabled:bg-sand"
                />
              </label>
            </div>
          </fieldset>
          <div className="rounded-xl bg-sand px-3 py-2">
            <p className="text-[11px] font-semibold text-ink-2">Preview</p>
            <p className="text-sm text-ink">
              {describeRRule(rrule)} at {localStartTime} ({familyTimeZone})
            </p>
            <code className="text-[11px] text-muted break-all" data-testid="rrule-preview">
              {rrule}
            </code>
          </div>
          {errors.recurrence && <p className="sr-only">{errors.recurrence}</p>}
          <UiButton type="submit" loading={create.isPending} className="w-full" icon={<CalendarPlus className="w-4 h-4" />}>
            Create schedule
          </UiButton>
        </CardBody>
      </Card>
    </form>
  );
}

/** Result of a created schedule: materialised sessions and skipped clashes. */
export function CreatedScheduleSummary({ result, onView }: { result: CreatedSchedule; onView: (id: string) => void }) {
  const skipped = typeof result.skippedConflicts === 'number' ? result.skippedConflicts : 0;
  return (
    <Alert tone="success" title={`Schedule created · ${describeRRule(result.rrule)} at ${result.localStartTime}`}>
      <span className="block">
        {result.sessions.length} classes materialised{result.materialisedUntil ? ` up to ${result.materialisedUntil.slice(0, 10)}` : ''} ({result.familyTimeZone}).
        {skipped > 0 && <Badge tone="amber" className="ml-2">{skipped} double-booking clash(es) skipped in this run</Badge>}
      </span>
      {result.sessions.length > 0 && (
        <span className="block mt-1">First: {result.sessions.slice(0, 3).map((s) => s.localStart).join(' · ')}</span>
      )}
      <span className="mt-2 block">
        <UiButton size="sm" variant="secondary" onClick={() => onView(result.scheduleId)}>
          View schedule
        </UiButton>
      </span>
    </Alert>
  );
}
