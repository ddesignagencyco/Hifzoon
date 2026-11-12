'use client';

import React from 'react';
import { Field, Select, TextInput } from '@/components/ui/primitives';
import { MatchingFilters, WEEKDAYS } from '@/lib/api/modules/scheduling-admin';
import { cn } from '@/lib/utils';

/** Hard filters on teacher suggestions: gender, language, age group, weekdays, minimum rating. */
export function MatchingFilterChips({ value, onChange }: { value: MatchingFilters; onChange: (f: MatchingFilters) => void }) {
  const set = (patch: Partial<MatchingFilters>) => {
    const next = { ...value, ...patch };
    // Keep the object free of empty values so "no filters" is detectable.
    for (const k of Object.keys(next) as Array<keyof MatchingFilters>) {
      const v = next[k];
      if (v === '' || v === undefined || v === 0 || (Array.isArray(v) && v.length === 0)) delete next[k];
    }
    onChange(next);
  };
  const days = value.weekdays ?? [];
  return (
    <fieldset className="rounded-xl border border-line p-3 space-y-3">
      <legend className="px-1 text-[11px] font-semibold text-ink-2">Narrow the suggestions</legend>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teacher gender" htmlFor="mf-gender">
          <Select id="mf-gender" value={value.teacherGender ?? ''} onChange={(e) => set({ teacherGender: e.target.value as MatchingFilters['teacherGender'] })}>
            <option value="">Any</option><option value="FEMALE">Female</option><option value="MALE">Male</option>
          </Select>
        </Field>
        <Field label="Minimum rating" htmlFor="mf-rating">
          <Select id="mf-rating" value={String(value.minRating ?? 0)} onChange={(e) => set({ minRating: Number(e.target.value) })}>
            <option value="0">Any</option>{[3, 3.5, 4, 4.5].map((r) => <option key={r} value={r}>{r}+</option>)}
          </Select>
        </Field>
        <Field label="Language(s), comma separated" htmlFor="mf-lang"><TextInput id="mf-lang" value={value.language ?? ''} placeholder="en, ar" onChange={(e) => set({ language: e.target.value })} /></Field>
        <Field label="Age group" htmlFor="mf-age"><TextInput id="mf-age" value={value.ageGroup ?? ''} placeholder="4-6" onChange={(e) => set({ ageGroup: e.target.value })} /></Field>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-ink-2 mb-1">Teacher offers at least one of</p>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d, i) => {
            const on = days.includes(i);
            return (
              <button key={d.code} type="button" aria-pressed={on}
                onClick={() => set({ weekdays: on ? days.filter((x) => x !== i) : [...days, i].sort() })}
                className={cn('h-8 rounded-full border px-3 text-xs font-semibold cursor-pointer', on ? 'bg-green-800 text-white border-green-800' : 'bg-white text-ink border-line hover:bg-sand')}>
                {d.short}
              </button>
            );
          })}
        </div>
      </div>
    </fieldset>
  );
}
