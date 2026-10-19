'use client';

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Field, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { AvailabilitySlotInput, SetAvailabilityInput } from '@/lib/api/modules/teacher-schedule';
import { cn } from '@/lib/utils';
import {
  AvailabilityRow,
  newRowKey,
  serialiseAvailability,
  toRows,
  validateAvailability,
} from './availability-form';
import { WEEKDAY_NAMES, WEEKDAY_ORDER } from './zoned-time';

/**
 * Weekly recurring availability editor. Presentational: it validates and serialises to the
 * exact `SetAvailabilityDto` and hands the body to `onSave`.
 */
export function AvailabilityEditor({
  initialSlots,
  zone,
  saving = false,
  onSave,
}: {
  initialSlots: AvailabilitySlotInput[];
  zone: string;
  saving?: boolean;
  onSave: (body: SetAvailabilityInput) => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<AvailabilityRow[]>(() => toRows(initialSlots));
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [attempted, setAttempted] = useState(false);

  const effective = { from: effectiveFrom || undefined, to: effectiveTo || undefined };
  const validation = validateAvailability(rows, effective);
  const show = attempted;

  const update = (key: string, patch: Partial<AvailabilityRow>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((current) => current.filter((r) => r.key !== key));
  const add = (weekday: number) =>
    setRows((current) => {
      const sameDay = current.filter((r) => r.weekday === weekday);
      const last = sameDay[sameDay.length - 1];
      // Suggest the hour after the last range on that day, or a sensible afternoon block.
      const start = last && last.endTime < '23:00' ? last.endTime : '16:00';
      const [h, m] = start.split(':').map(Number);
      // `start` is at most 22:59, so one hour later is always a valid HH:mm.
      const end = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      return [...current, { key: newRowKey(), weekday, startTime: start, endTime: end }];
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!validation.valid) {
      toast.error(validation.formError ?? 'Fix the highlighted time ranges before saving.');
      return;
    }
    onSave(serialiseAvailability(rows, effective));
  };

  const reset = () => {
    setRows(toRows(initialSlots));
    setEffectiveFrom('');
    setEffectiveTo('');
    setAttempted(false);
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Weekly availability" className="space-y-5">
      <p className="text-xs text-muted">
        All times are local to <span className="font-semibold text-ink-2">{zone}</span>. Ranges on the same day may touch
        (16:00–18:00 and 18:00–20:00) but must not overlap.
      </p>

      <ul className="divide-y divide-line/70 rounded-2xl border border-line">
        {WEEKDAY_ORDER.map((weekday) => {
          const dayRows = rows.filter((r) => r.weekday === weekday);
          return (
            <li key={weekday} className="p-3 sm:p-4 flex flex-col sm:flex-row gap-3">
              <div className="sm:w-32 shrink-0 flex sm:flex-col items-center sm:items-start justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{WEEKDAY_NAMES[weekday]}</p>
                <p className="text-[11px] text-muted">{dayRows.length === 0 ? 'Unavailable' : `${dayRows.length} range${dayRows.length === 1 ? '' : 's'}`}</p>
              </div>
              <div className="flex-1 space-y-2">
                {dayRows.map((row, index) => {
                  const error = show ? validation.rowErrors[row.key] : undefined;
                  const label = `${WEEKDAY_NAMES[weekday]} range ${index + 1}`;
                  const errorId = `${row.key}-error`;
                  return (
                    <div key={row.key}>
                      <div className="flex items-center gap-2">
                        <TextInput
                          type="time"
                          aria-label={`${label} start`}
                          value={row.startTime}
                          onChange={(e) => update(row.key, { startTime: e.target.value })}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? errorId : undefined}
                          className={cn('w-full sm:w-32', error && 'border-red')}
                        />
                        <span className="text-xs text-muted" aria-hidden>to</span>
                        <TextInput
                          type="time"
                          aria-label={`${label} end`}
                          value={row.endTime}
                          onChange={(e) => update(row.key, { endTime: e.target.value })}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? errorId : undefined}
                          className={cn('w-full sm:w-32', error && 'border-red')}
                        />
                        <button
                          type="button"
                          onClick={() => remove(row.key)}
                          aria-label={`Remove ${label}`}
                          className="p-2 rounded-lg text-muted hover:text-red hover:bg-red/10 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden />
                        </button>
                      </div>
                      {error && (
                        <p id={errorId} className="sr-only">
                          {error}
                        </p>
                      )}
                    </div>
                  );
                })}
                <UiButton
                  variant="ghost"
                  size="sm"
                  onClick={() => add(weekday)}
                  icon={<Plus className="w-3.5 h-3.5" aria-hidden />}
                  aria-label={`Add a time range on ${WEEKDAY_NAMES[weekday]}`}
                >
                  Add range
                </UiButton>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Effective from (optional)" htmlFor="avail-from" hint="Defaults to today.">
          <TextInput id="avail-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </Field>
        <Field label="Effective until (optional)" htmlFor="avail-to" hint="Leave empty for no end date.">
          <TextInput id="avail-to" type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <UiButton variant="secondary" onClick={reset} disabled={saving}>
          Reset
        </UiButton>
        <UiButton type="submit" loading={saving}>
          Save availability
        </UiButton>
      </div>
    </form>
  );
}
