'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  QueryState,
  TextInput,
  UiButton,
  formatDateTime,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useMonthlyAvailability, useSetMonthlyAvailability, useSetMonthlyLeave } from '@/hooks/useTeacherSchedule';
import type { MonthlyAvailabilityAndLeave } from '@/lib/api/modules/backend-updates-oct2026';
import type { AvailabilitySlotInput } from '@/lib/api/modules/teacher-schedule';
import { cn } from '@/lib/utils';
import { AvailabilityEditor } from './AvailabilityEditor';

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
}: {
  teacherId: string;
  zone: string;
  weeklySlots: AvailabilitySlotInput[];
}) {
  const [month, setMonth] = useState(() => currentMonth());
  const minMonth = useMemo(() => currentMonth(), []);
  const query = useMonthlyAvailability(teacherId, month);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UiButton
            size="sm"
            variant="secondary"
            aria-label="Previous month"
            disabled={month <= minMonth}
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            icon={<ChevronLeft className="w-4 h-4" aria-hidden />}
          />
          <h2 className="text-lg font-semibold text-ink min-w-44 text-center" aria-live="polite">
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
          <div className="grid xl:grid-cols-[1fr_380px] gap-6 items-start">
            <MonthHours key={`${month}-${data.submittedAt ?? 'new'}`} teacherId={teacherId} month={month} zone={zone} data={data} weeklySlots={weeklySlots} />
            <LeaveCalendar key={`${month}-leave-${data.leaveDays.map((d) => d.date).join(',')}`} teacherId={teacherId} month={month} data={data} />
          </div>
        )}
      </QueryState>
    </div>
  );
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
  const save = useSetMonthlyAvailability(teacherId, month);
  const fresh = !data.submittedAt && data.slots.length === 0;
  const [seed, setSeed] = useState<AvailabilitySlotInput[]>(() =>
    fresh ? weeklySlots : data.slots.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })),
  );
  const [version, setVersion] = useState(0);

  return (
    <Card>
      <CardHeader
        title={`Hours for ${monthLabel(month)}`}
        description="Replaces your weekly hours for this month only. Save again any time to change a day."
        action={
          !fresh && weeklySlots.length > 0 ? (
            <UiButton
              size="sm"
              variant="ghost"
              onClick={() => {
                setSeed(weeklySlots);
                setVersion((v) => v + 1);
              }}
            >
              Start from weekly hours
            </UiButton>
          ) : undefined
        }
      />
      <CardBody>
        {fresh && weeklySlots.length > 0 && (
          <Alert tone="neutral" className="mb-4">
            Pre-filled from your weekly hours. Adjust them for this month and save to submit.
          </Alert>
        )}
        <AvailabilityEditor
          key={version}
          initialSlots={seed}
          zone={zone}
          allowEmpty
          showEffective={false}
          label={`Hours for ${monthLabel(month)}`}
          submitLabel={data.submittedAt ? 'Update this month' : 'Submit this month'}
          saving={save.isPending}
          onSave={(body) =>
            save.mutate(body.slots, {
              onSuccess: () => toast.success(`Hours for ${monthLabel(month)} saved.`),
              onError: (err) => toast.error(err),
            })
          }
        />
      </CardBody>
    </Card>
  );
}

function LeaveCalendar({ teacherId, month, data }: { teacherId: string; month: string; data: MonthlyAvailabilityAndLeave }) {
  const toast = useToast();
  const save = useSetMonthlyLeave(teacherId, month);
  const { days, leading } = useMemo(() => monthGrid(month), [month]);
  const saved = useMemo(
    () => new Map(data.leaveDays.filter((d) => d.date).map((d) => [d.date as string, d.reason ?? ''])),
    [data.leaveDays],
  );
  const [leave, setLeave] = useState<Map<string, string>>(() => new Map(saved));
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
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
