'use client';

import React, { useMemo, useState } from 'react';
import { Clock, Globe } from 'lucide-react';
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

/**
 * Real open slots grouped by day in the visitor's zone. Each button is a teacher at a
 * time, so two teachers free at 17:00 appear as two choices.
 */
export function SlotPicker({
  slots,
  timeZone,
  selectedKey,
  onSelect,
}: {
  slots: OpenSlot[];
  timeZone: string;
  selectedKey?: string | null;
  onSelect: (slot: OpenSlot) => void;
}) {
  const days = useMemo(() => groupSlotsByDay(slots, timeZone), [slots, timeZone]);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const activeDay = days.find((d) => d.key === chosenDay) ?? days[0];

  if (days.length === 0) {
    return <p className="text-sm text-[#6b7772]">No open times in this period.</p>;
  }

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Day" className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {days.map((d) => {
          const active = d.key === activeDay.key;
          return (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setChosenDay(d.key)}
              className={cn(
                'shrink-0 px-3.5 py-2 rounded-2xl border text-left transition-all cursor-pointer',
                active ? 'border-[#143a2f] bg-[#f0f6f3]' : 'border-[#e6dfd1] bg-[#faf7f1] hover:bg-white',
              )}
            >
              <span className="block text-xs font-bold text-[#10201b]">{d.label}</span>
              <span className="block text-[11px] text-[#6b7772]">
                {d.slots.length} time{d.slots.length === 1 ? '' : 's'}
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={activeDay.label} className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {activeDay.slots.map((slot) => {
          const key = slotKey(slot);
          const selected = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(slot)}
              className={cn(
                'py-2.5 px-3 rounded-2xl text-left transition-all border cursor-pointer',
                selected ? 'bg-[#143a2f] text-white border-[#143a2f]' : 'bg-[#faf7f1] text-[#3c4a45] border-[#e6dfd1] hover:bg-white',
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Clock className="w-3.5 h-3.5" aria-hidden />
                {formatSlotTime(slot.startsAt, timeZone)}
              </span>
              <span className={cn('block text-[11px] truncate', selected ? 'text-white/80' : 'text-[#6b7772]')}>
                {slot.teacherName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
