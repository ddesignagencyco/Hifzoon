'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  OpenSlot,
  formatSlotTime,
  groupSlotsByDay,
  isValidTimeZone,
} from '@/lib/api/modules/public-booking';
import { Select } from '@/components/ui/select';

const COMMON_ZONES = [
  'America/Los_Angeles', 'America/Chicago', 'America/New_York', 'America/Toronto', 'Europe/London',
  'Europe/Paris', 'Africa/Cairo', 'Africa/Lagos', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Karachi',
  'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Kuala_Lumpur', 'Australia/Sydney', 'UTC',
];

function allZones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    const zones = fn ? fn('timeZone') : [];
    return zones.length > 0 ? zones : COMMON_ZONES;
  } catch {
    return COMMON_ZONES;
  }
}

/** IANA time-zone select; the visitor's detected zone is always listed first. */
export function TimezoneSelect({
  value,
  onChange,
  detected,
  id = 'booking-timezone',
}: {
  value: string;
  onChange: (zone: string) => void;
  detected: string;
  id?: string;
}) {
  const zones = useMemo(() => {
    const list = allZones().filter((z) => z !== detected);
    return isValidTimeZone(detected) ? [detected, ...list] : list;
  }, [detected]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[#3c4a45]">
      <Globe className="w-4 h-4 text-[#1c4c3e]" aria-hidden />
      <label htmlFor={id} className="font-semibold">
        Times shown in
      </label>
      <Select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        appearance="pill"
        size="sm"
        searchable
        className="min-w-[220px] max-w-full"
        controlClassName="bg-white"
      >
        {zones.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, ' ')}
            {z === detected ? ' (detected)' : ''}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function slotKey(slot: Pick<OpenSlot, 'teacherId' | 'startsAt'>): string {
  return `${slot.teacherId}|${slot.startsAt}`;
}

const WEEK_HEADINGS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday-first grid of `YYYY-MM-DD` keys for a `YYYY-MM` month; `null` pads the first week. */
export function calendarCells(month: string): Array<string | null> {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leading = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  return [...Array<null>(leading).fill(null), ...days];
}

function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Drops repeated teacher+time rows (overlapping availability makes the API return some twice). */
export function uniqueSlots(slots: OpenSlot[]): OpenSlot[] {
  const seen = new Set<string>();
  return slots.filter((s) => {
    const key = slotKey(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const PERIODS = [
  { label: 'Early hours', from: 0, to: 5 },
  { label: 'Morning', from: 5, to: 12 },
  { label: 'Afternoon', from: 12, to: 17 },
  { label: 'Evening', from: 17, to: 21 },
  { label: 'Night', from: 21, to: 24 },
];

function localHour(iso: string, timeZone: string): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  return Number(h) % 24;
}

/** One entry per start time; `slots` holds every teacher free then, in API order. */
export function groupTimes(slots: OpenSlot[], timeZone: string) {
  const byStart = new Map<string, OpenSlot[]>();
  for (const s of slots) byStart.set(s.startsAt, [...(byStart.get(s.startsAt) ?? []), s]);
  const times = [...byStart.entries()]
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([startsAt, list]) => ({ startsAt, slots: list, hour: localHour(startsAt, timeZone) }));
  return PERIODS.map((p) => ({ label: p.label, times: times.filter((t) => t.hour >= p.from && t.hour < p.to) })).filter(
    (p) => p.times.length > 0,
  );
}

const ANY_TEACHER = '';

/**
 * Real open slots on a month calendar in the visitor's zone. A day shows one chip per start
 * time, grouped by part of the day; the teacher is chosen once above the grid ("any available"
 * books the first teacher free at that time).
 */
export function SlotPicker({
  slots,
  timeZone,
  selectedKey,
  onSelect,
  defaultTeacherId,
}: {
  slots: OpenSlot[];
  timeZone: string;
  selectedKey?: string | null;
  onSelect: (slot: OpenSlot) => void;
  /** Teacher chosen earlier in the flow (e.g. `?teacher=`), preselected in the dropdown. */
  defaultTeacherId?: string;
}) {
  const [teacherId, setTeacherId] = useState<string>(defaultTeacherId || ANY_TEACHER);
  const unique = useMemo(() => uniqueSlots(slots), [slots]);
  const teachers = useMemo(() => {
    const names = new Map<string, string>();
    for (const s of unique) if (!names.has(s.teacherId)) names.set(s.teacherId, s.teacherName);
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [unique]);
  const visible = useMemo(
    () => (teacherId === ANY_TEACHER ? unique : unique.filter((s) => s.teacherId === teacherId)),
    [unique, teacherId],
  );
  const days = useMemo(() => groupSlotsByDay(visible, timeZone), [visible, timeZone]);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const activeDay = days.find((d) => d.key === chosenDay) ?? days[0];
  const months = useMemo(() => [...new Set(days.map((d) => d.key.slice(0, 7)))], [days]);
  const [monthIndex, setMonthIndex] = useState(0);
  const month = months[Math.min(monthIndex, months.length - 1)] ?? activeDay?.key.slice(0, 7);
  const byKey = useMemo(() => new Map(days.map((d) => [d.key, d])), [days]);
  const periods = useMemo(() => (activeDay ? groupTimes(activeDay.slots, timeZone) : []), [activeDay, timeZone]);
  const selected = unique.find((s) => slotKey(s) === selectedKey) ?? null;
  const timesOn = (day: { slots: OpenSlot[] }) => new Set(day.slots.map((s) => s.startsAt)).size;

  if (unique.length === 0) {
    return <p className="text-sm text-[#6b7772]">No open times in this period.</p>;
  }

  return (
    <div className="space-y-4">
      {(teachers.length > 1 || (teacherId !== ANY_TEACHER && teachers.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#3c4a45]">
          <label htmlFor="slot-teacher" className="font-semibold">
            Teacher
          </label>
          <Select
            id="slot-teacher"
            value={teacherId}
            onChange={(e) => {
              setTeacherId(e.target.value);
              setChosenDay(null);
              setMonthIndex(0);
            }}
            appearance="pill"
            size="sm"
            className="min-w-[220px] max-w-full"
            controlClassName="bg-white"
          >
            <option value={ANY_TEACHER}>Any available teacher</option>
            {teachers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {!activeDay || !month ? (
        <p className="text-sm text-[#6b7772]">This teacher has no open times in this period.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,300px)_1fr] items-start">
          <div className="rounded-2xl border border-[#e6dfd1] bg-[#faf7f1] p-3">
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                aria-label="Previous month"
                disabled={monthIndex === 0}
                onClick={() => setMonthIndex((i) => Math.max(0, i - 1))}
                className="p-1.5 rounded-full text-[#1c4c3e] hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden />
              </button>
              <p className="text-sm font-bold text-[#10201b]" aria-live="polite">
                {monthTitle(month)}
              </p>
              <button
                type="button"
                aria-label="Next month"
                disabled={monthIndex >= months.length - 1}
                onClick={() => setMonthIndex((i) => Math.min(months.length - 1, i + 1))}
                className="p-1.5 rounded-full text-[#1c4c3e] hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
              >
                <ChevronRight className="w-4 h-4" aria-hidden />
              </button>
            </div>
            <div role="tablist" aria-label="Day" className="grid grid-cols-7 gap-1 text-center">
              {WEEK_HEADINGS.map((h) => (
                <span key={h} className="text-[10px] font-semibold uppercase tracking-wide text-[#6b7772] py-1" aria-hidden>
                  {h}
                </span>
              ))}
              {calendarCells(month).map((key, i) => {
                if (!key) return <span key={`pad-${i}`} aria-hidden />;
                const day = byKey.get(key);
                const dayNumber = Number(key.slice(-2));
                if (!day) {
                  return (
                    <span key={key} className="h-11 flex items-center justify-center text-xs text-[#b8b2a6]" aria-hidden>
                      {dayNumber}
                    </span>
                  );
                }
                const active = day.key === activeDay.key;
                const count = timesOn(day);
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-label={`${day.label}, ${count} time${count === 1 ? '' : 's'}`}
                    onClick={() => setChosenDay(day.key)}
                    className={cn(
                      'h-11 rounded-xl flex flex-col items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c49a55]',
                      active ? 'bg-[#143a2f] text-white' : 'bg-white text-[#10201b] border border-[#e6dfd1] hover:border-[#143a2f]',
                    )}
                  >
                    <span className="text-sm font-bold leading-none">{dayNumber}</span>
                    <span className={cn('text-[9px] leading-none mt-1', active ? 'text-white/80' : 'text-[#a97f3c]')}>{count}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-[#6b7772]">Numbers show open times that day.</p>
          </div>

          <div role="tabpanel" aria-label={activeDay.label} className="space-y-4">
            <p className="text-sm font-bold text-[#10201b]">{activeDay.label}</p>
            {periods.map((period) => (
              <section key={period.label} aria-label={period.label}>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7772] mb-2">{period.label}</h4>
                <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2">
                  {period.times.map((time) => {
                    const isSelected = selected?.startsAt === time.startsAt;
                    return (
                      <button
                        key={time.startsAt}
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`${formatSlotTime(time.startsAt, timeZone)}${
                          time.slots.length > 1 ? `, ${time.slots.length} teachers free` : `, ${time.slots[0].teacherName}`
                        }`}
                        onClick={() => onSelect(time.slots[0])}
                        className={cn(
                          'h-10 rounded-xl text-sm font-semibold border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c49a55]',
                          isSelected
                            ? 'bg-[#143a2f] text-white border-[#143a2f]'
                            : 'bg-[#faf7f1] text-[#3c4a45] border-[#e6dfd1] hover:bg-white hover:border-[#143a2f]',
                        )}
                      >
                        {formatSlotTime(time.startsAt, timeZone)}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {selected && (
              <p className="flex items-center gap-1.5 text-xs text-[#3c4a45]" role="status">
                <Clock className="w-3.5 h-3.5 text-[#1c4c3e]" aria-hidden />
                {formatSlotTime(selected.startsAt, timeZone)} with <span className="font-semibold">{selected.teacherName}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
