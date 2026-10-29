'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Field,
  QueryState,
  TextInput,
  UiButton,
  formatDateTime,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useMonthlyAvailability, useSetMonthlyAvailability, useSetMonthlyLeave } from '@/hooks/useTeacherSchedule';
import type { MonthlyAvailabilityAndLeave } from '@/lib/api/modules/backend-updates-oct2026';
import { HH_MM, type AvailabilitySlotInput } from '@/lib/api/modules/teacher-schedule';
import { cn } from '@/lib/utils';
import { minutesOf } from './zoned-time';

const WEEK_HEADINGS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** `YYYY-MM` for a month offset from `base`. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Every `YYYY-MM-DD` in the month, plus how many blank cells precede day 1 in a Monday-first grid. */
export function monthGrid(month: string): { days: string[]; leading: number } {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  return { days, leading: (firstWeekday + 6) % 7 };
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Month-by-month hours and days off (Oct 2026 #1). A month's hours override the weekly
 * pattern for that month only; leave days are never offered for booking.
 */
export function MonthlyAvailabilityEditor({
  teacherId,
  zone,
  weeklySlots,
  aside,
}: {
  teacherId: string;
  zone: string;
  weeklySlots: AvailabilitySlotInput[];
  /** Shown under the hours card, so the left column has no empty gap beside the calendar. */
  aside?: React.ReactNode;
}) {
  const [month, setMonth] = useState(() => currentMonth());
  const minMonth = useMemo(() => currentMonth(), []);
  const query = useMonthlyAvailability(teacherId, month);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <UiButton
            size="sm"
            variant="secondary"
            aria-label="Previous month"
            disabled={month <= minMonth}
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            icon={<ChevronLeft className="w-4 h-4" aria-hidden />}
          />
          <h2 className="text-lg font-semibold text-ink w-40 text-center" aria-live="polite">
            {monthLabel(month)}
          </h2>
          <UiButton
            size="sm"
            variant="secondary"
            aria-label="Next month"
            disabled={month >= shiftMonth(minMonth, 11)}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            icon={<ChevronRight className="w-4 h-4" aria-hidden />}
          />
        </div>
        {query.data &&
          (query.data.submittedAt ? (
            <Badge tone="green">Submitted {formatDateTime(query.data.submittedAt)}</Badge>
          ) : (
            <Badge tone="amber">Not submitted yet</Badge>
          ))}
      </div>

      <QueryState query={query} isEmpty={() => false} loadingLabel="Loading this month…">
        {(data) => (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px] gap-6 items-start">
            <div className="space-y-6 min-w-0">
              <MonthHours key={`${month}-${data.submittedAt ?? 'new'}`} teacherId={teacherId} month={month} zone={zone} data={data} weeklySlots={weeklySlots} />
              {aside}
            </div>
            <LeaveCalendar
              key={`${month}-leave-${data.leaveDays.map((d) => d.date).join(',')}`}
              teacherId={teacherId}
              month={month}
              zone={zone}
              data={data}
            />
          </div>
        )}
      </QueryState>
    </div>
  );
}

const QUICK_DAYS = [1, 2, 3, 4, 5, 6, 0];
const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Same range on every chosen weekday: the one-step way to set a month. */
export function quickFillSlots(days: number[], startTime: string, endTime: string): AvailabilitySlotInput[] {
  return QUICK_DAYS.filter((d) => days.includes(d)).map((weekday) => ({ weekday, startTime, endTime }));
}

export function validateQuickFill(days: number[], startTime: string, endTime: string): string | null {
  if (days.length === 0) return 'Choose at least one day.';
  if (!HH_MM.test(startTime) || !HH_MM.test(endTime)) return 'Enter both times.';
  if (minutesOf(endTime) <= minutesOf(startTime)) return 'The end time must be after the start time.';
  return null;
}

/** "Mon, Wed 16:00–20:00 · Sat 10:00–12:00" for the saved pattern. */
function describeSlots(slots: AvailabilitySlotInput[]): string {
  const byRange = new Map<string, number[]>();
  for (const s of slots) {
    const key = `${s.startTime}–${s.endTime}`;
    byRange.set(key, [...(byRange.get(key) ?? []), s.weekday]);
  }
  return [...byRange]
    .map(([range, days]) => {
      const sorted = QUICK_DAYS.filter((d) => days.includes(d));
      return `${sorted.length === 7 ? 'Every day' : sorted.map((d) => SHORT_DAY[d]).join(', ')} ${range}`;
    })
    .join(' · ');
}

function MonthHours({
  teacherId,
  month,
  zone,
  data,
  weeklySlots,
}: {
  teacherId: string;
  month: string;
  zone: string;
  data: MonthlyAvailabilityAndLeave;
  weeklySlots: AvailabilitySlotInput[];
}) {
  const toast = useToast();
  const save = useSetMonthlyAvailability(teacherId, month, zone);
  const saved = data.slots.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime }));
  const reference = saved.length ? saved : weeklySlots;
  const [days, setDays] = useState<number[]>(() =>
    reference.length ? [...new Set(reference.map((s) => s.weekday))] : [...QUICK_DAYS],
  );
  const [startTime, setStartTime] = useState(reference[0]?.startTime ?? '16:00');
  const [endTime, setEndTime] = useState(reference[0]?.endTime ?? '20:00');
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const applyQuick = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateQuickFill(days, startTime, endTime);
    setError(problem);
    if (problem) return;
    const slots = quickFillSlots(days, startTime, endTime);
    save.mutate(slots, {
      onSuccess: () => toast.success(`${monthLabel(month)}: ${describeSlots(slots)} saved.`),
      onError: (err) => toast.error(err),
    });
  };

  return (
    <Card>
      <CardHeader
        title={`Hours for ${monthLabel(month)}`}
        description={
          saved.length
            ? `Saved: ${describeSlots(saved)}`
            : data.submittedAt
              ? 'Saved: no hours this month.'
              : 'Not set yet. Pick your days and time, then apply to the whole month.'
        }
      />
      <CardBody>
        <form onSubmit={applyQuick} noValidate className="space-y-4" aria-label={`Set hours for all of ${monthLabel(month)}`}>
          <fieldset>
            <legend className="text-xs font-semibold text-ink-2 mb-2">Days</legend>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_DAYS.map((d) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(d)}
                    className={cn(
                      'h-9 min-w-12 px-3 rounded-full text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                      on ? 'bg-green-800 border-green-800 text-white' : 'bg-white border-line text-ink-2 hover:bg-sand',
                    )}
                  >
                    {SHORT_DAY[d]}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From" htmlFor="quick-from">
              <TextInput id="quick-from" type="time" className="w-32" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field label="To" htmlFor="quick-to">
              <TextInput id="quick-to" type="time" className="w-32" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </Field>
            <UiButton type="submit" loading={save.isPending}>
              Apply to whole month
            </UiButton>
          </div>
          {error && (
            <p className="text-xs text-red" role="alert">
              {error}
            </p>
          )}
          <p className="text-[11px] text-muted">
            Times are in {zone.replace(/_/g, ' ')}. For a single date you can&apos;t teach, mark it as a day off.
          </p>
        </form>

      </CardBody>
    </Card>
  );
}

/** `YYYY-MM-DD` for "now" in an IANA zone (falls back to the device date for an unknown zone). */
export function todayIn(zone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
}

function LeaveCalendar({
  teacherId,
  month,
  zone,
  data,
}: {
  teacherId: string;
  month: string;
  zone: string;
  data: MonthlyAvailabilityAndLeave;
}) {
  const toast = useToast();
  const save = useSetMonthlyLeave(teacherId, month);
  const { days, leading } = useMemo(() => monthGrid(month), [month]);
  const saved = useMemo(
    () => new Map(data.leaveDays.filter((d) => d.date).map((d) => [d.date as string, d.reason ?? ''])),
    [data.leaveDays],
  );
  const [leave, setLeave] = useState<Map<string, string>>(() => new Map(saved));
  const [today] = useState(() => todayIn(zone));
  const dirty =
    leave.size !== saved.size || [...leave].some(([date, reason]) => saved.get(date) !== reason);

  const toggle = (date: string) =>
    setLeave((prev) => {
      const next = new Map(prev);
      if (next.has(date)) next.delete(date);
      else next.set(date, '');
      return next;
    });

  const submit = () =>
    save.mutate(
      [...leave]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, reason]) => ({ date, ...(reason.trim() ? { reason: reason.trim() } : {}) })),
      {
        onSuccess: () => toast.success(leave.size ? `${leave.size} day${leave.size === 1 ? '' : 's'} off saved.` : 'Days off cleared.'),
        onError: (err) => toast.error(err),
      },
    );

  return (
    <Card>
      <CardHeader title="Days off" description="Tap a day to mark it as leave. Families can't book you on these days." />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label={`Days off in ${monthLabel(month)}`}>
          {WEEK_HEADINGS.map((d) => (
            <span key={d} className="text-[10px] font-semibold uppercase tracking-wide text-muted py-1" aria-hidden>
              {d}
            </span>
          ))}
          {Array.from({ length: leading }, (_, i) => (
            <span key={`blank-${i}`} aria-hidden />
          ))}
          {days.map((date) => {
            const off = leave.has(date);
            const past = date < today;
            return (
              <button
                key={date}
                type="button"
                disabled={past}
                aria-pressed={off}
                aria-label={`${new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}${off ? ', day off' : ''}`}
                onClick={() => toggle(date)}
                className={cn(
                  'h-9 rounded-lg text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                  off ? 'bg-red text-white font-semibold' : 'bg-white border border-line text-ink hover:bg-sand',
                  past && 'opacity-40 cursor-not-allowed hover:bg-white',
                  date === today && !off && 'border-gold',
                )}
              >
                {Number(date.slice(-2))}
              </button>
            );
          })}
        </div>

        {leave.size > 0 && (
          <ul className="space-y-2">
            {[...leave.keys()].sort().map((date) => (
              <li key={date} className="flex items-center gap-2">
                <span className="text-xs font-medium text-ink w-24 shrink-0">
                  {new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                </span>
                <TextInput
                  aria-label={`Reason for ${date} (optional)`}
                  placeholder="Reason (optional)"
                  maxLength={500}
                  value={leave.get(date) ?? ''}
                  onChange={(e) => setLeave((prev) => new Map(prev).set(date, e.target.value))}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {leave.size === 0 ? 'No days off.' : `${leave.size} day${leave.size === 1 ? '' : 's'} off.`}
            {dirty && ' Unsaved changes.'}
          </p>
          <UiButton onClick={submit} loading={save.isPending} disabled={!dirty}>
            Save days off
          </UiButton>
        </div>
      </CardBody>
    </Card>
  );
}
