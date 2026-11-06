'use client';

import React from 'react';
import { Checkbox, Field, Select, TextInput } from '@/components/ui/primitives';
import type { LessonCardPrefill } from '@/lib/api/modules/lessons';
import type { AssignPracticeInput, PracticeMode } from '@/lib/api/modules/practice';
import { boardForCourse, type LessonBoardKind } from '@/lib/data/lesson-boards';

/**
 * "Set practice before the next class" on the end-of-class lesson card. Optional: when ticked,
 * submitting the card also creates a practice assignment (POST /practice-assignments), the same
 * one the student's page sets.
 *
 * Mushaf courses practise a surah/ayah range, from the card's portions or the class's mistakes.
 * Qaida and Duas practise a board lesson shown in class (`board` + `boardLesson`, + `label`).
 */

const MODE_LABEL: Record<PracticeMode, string> = { READING: 'Reading', MEMORISATION: 'Memorisation' };

export interface PracticeDraft {
  enabled: boolean;
  /** Mushaf courses. */
  fromSurah: string;
  fromAyah: string;
  toSurah: string;
  toAyah: string;
  /** Qaida/Duas: index into `boardLessons` below. */
  lessonIndex: string;
  mode: PracticeMode;
  targetMinutes: string;
  /** `YYYY-MM-DD`. */
  dueOn: string;
}

interface BoardLesson {
  board: LessonBoardKind;
  lesson: number;
  label: string;
}

/** The board lessons the class showed, named as the card's portions name them. */
export function practiceBoardLessons(prefill: LessonCardPrefill): BoardLesson[] {
  // The API builds one labelled portion per coverage lesson, in the same order.
  return (prefill.coverage?.lessons ?? []).map((l, i) => ({
    board: l.board,
    lesson: l.lesson,
    label: prefill.portions[i]?.label || `${l.board === 'QAIDA' ? 'Qaida lesson' : 'Dua chapter'} ${l.lesson}`,
  }));
}

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Due by the next class, or in three days when none is booked. */
export function defaultDueOn(nextClassAt: string | null | undefined, now = new Date()): string {
  const next = nextClassAt ? new Date(nextClassAt) : null;
  if (next && !Number.isNaN(next.getTime()) && next.getTime() > now.getTime()) return isoDate(next);
  return isoDate(new Date(now.getTime() + 3 * 86_400_000));
}

/** The passage to practise on a Mushaf course: the first full portion range, else the mistakes' span. */
function mushafRange(prefill: LessonCardPrefill) {
  const full = prefill.portions.find((p) => p.fromSurah && p.fromAyah && p.toSurah && p.toAyah);
  if (full) return { fromSurah: full.fromSurah!, fromAyah: full.fromAyah!, toSurah: full.toSurah!, toAyah: full.toAyah! };
  const student = prefill.students.find((s) => s.id === prefill.primaryStudentId);
  const marks = (student?.mistakes ?? prefill.mistakes)
    .filter((m) => m.surah && m.ayah)
    .map((m) => (m.surah as number) * 1000 + (m.ayah as number));
  if (!marks.length) return null;
  const from = Math.min(...marks);
  const to = Math.max(...marks);
  return { fromSurah: Math.floor(from / 1000), fromAyah: from % 1000, toSurah: Math.floor(to / 1000), toAyah: to % 1000 };
}

export function initialPracticeDraft(prefill: LessonCardPrefill, now = new Date()): PracticeDraft {
  const board = boardForCourse(prefill.course.type);
  const range = board ? null : mushafRange(prefill);
  const lessons = board ? practiceBoardLessons(prefill) : [];
  const type = prefill.course.type;
  return {
    enabled: false,
    fromSurah: range ? String(range.fromSurah) : '',
    fromAyah: range ? String(range.fromAyah) : '',
    toSurah: range ? String(range.toSurah) : '',
    toAyah: range ? String(range.toAyah) : '',
    // The last lesson shown is where the class stopped.
    lessonIndex: lessons.length ? String(lessons.length - 1) : '',
    mode: type === 'HIFZ' || type === 'DUAS' ? 'MEMORISATION' : 'READING',
    targetMinutes: board ? '15' : '30',
    dueOn: defaultDueOn(prefill.nextClassAt, now),
  };
}

/** POST /practice-assignments body for a board lesson. Mirrors the practice module's board fields. */
type BoardPracticeBody = Omit<AssignPracticeInput, 'fromSurah' | 'fromAyah' | 'toSurah' | 'toAyah'> & {
  board: LessonBoardKind;
  boardLesson: number;
  label: string;
};

/** The assignment to create, or why it cannot be; `null` when practice is not set. */
export function practicePayload(
  draft: PracticeDraft,
  prefill: LessonCardPrefill,
  studentId: string | null,
): { error: string } | { body: AssignPracticeInput | BoardPracticeBody } | null {
  if (!draft.enabled) return null;
  if (!studentId) return { error: 'Practice needs a student.' };
  const whole = (v: string) => /^\d+$/.test(v.trim());
  if (!whole(draft.targetMinutes) || +draft.targetMinutes < 5 || +draft.targetMinutes > 600)
    return { error: 'Set practice between 5 and 600 minutes.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dueOn)) return { error: 'Choose when the practice is due.' };
  if (draft.dueOn < isoDate(new Date())) return { error: 'The practice due date cannot be in the past.' };
  const common = { studentId, mode: draft.mode, targetMinutes: +draft.targetMinutes, dueOn: draft.dueOn };

  if (boardForCourse(prefill.course.type)) {
    const lesson = practiceBoardLessons(prefill)[Number(draft.lessonIndex)];
    if (draft.lessonIndex === '' || !lesson) return { error: 'Choose the lesson to practise.' };
    return { body: { ...common, board: lesson.board, boardLesson: lesson.lesson, label: lesson.label.slice(0, 200) } };
  }

  const fields = [draft.fromSurah, draft.fromAyah, draft.toSurah, draft.toAyah];
  if (!fields.every(whole)) return { error: 'Give the practice passage as whole surah and ayah numbers.' };
  const [fs, fa, ts, ta] = fields.map(Number);
  if (fs < 1 || fs > 114 || ts < 1 || ts > 114) return { error: 'Practice surahs are 1 to 114.' };
  if (fa < 1 || ta < 1 || fa > 286 || ta > 286) return { error: 'Practice ayahs are 1 to 286.' };
  if (ts * 1000 + ta < fs * 1000 + fa) return { error: 'The practice passage ends before it starts.' };
  return { body: { ...common, fromSurah: fs, fromAyah: fa, toSurah: ts, toAyah: ta } };
}

export function LessonCardPractice({
  prefill,
  value,
  onChange,
  idPrefix = 'card-practice',
}: {
  prefill: LessonCardPrefill;
  value: PracticeDraft;
  onChange: (next: PracticeDraft) => void;
  idPrefix?: string;
}) {
  const id = (f: string) => `${idPrefix}-${f}`;
  const set = (patch: Partial<PracticeDraft>) => onChange({ ...value, ...patch });
  const board = boardForCourse(prefill.course.type);
  const lessons = board ? practiceBoardLessons(prefill) : [];

  return (
    <section className="rounded-xl border border-line bg-white p-3 space-y-3" aria-label="Practice before the next class">
      <Checkbox
        id={id('enabled')}
        label="Set practice before the next class"
        description="Submitting the card also gives the family this practice."
        checked={value.enabled}
        onChange={(enabled) => set({ enabled })}
      />
      {value.enabled && (
        <>
          {board ? (
            <Field label="Lesson to practise" htmlFor={id('lesson')} required>
              {lessons.length ? (
                <Select
                  id={id('lesson')}
                  value={value.lessonIndex}
                  onChange={(e) => set({ lessonIndex: e.target.value })}
                  options={lessons.map((l, i) => ({ value: String(i), label: l.label }))}
                />
              ) : (
                <p className="text-xs text-muted">No board lesson was opened in this class, so there is nothing to set.</p>
              )}
            </Field>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(
                [
                  ['fromSurah', 'From surah'],
                  ['fromAyah', 'From ayah'],
                  ['toSurah', 'To surah'],
                  ['toAyah', 'To ayah'],
                ] as const
              ).map(([field, label]) => (
                <Field key={field} label={label} htmlFor={id(field)} required>
                  <TextInput
                    id={id(field)}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={value[field]}
                    onChange={(e) => set({ [field]: e.target.value } as Partial<PracticeDraft>)}
                  />
                </Field>
              ))}
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Kind" htmlFor={id('mode')}>
              <Select
                id={id('mode')}
                value={value.mode}
                onChange={(e) => set({ mode: e.target.value as PracticeMode })}
                options={(Object.keys(MODE_LABEL) as PracticeMode[]).map((m) => ({ value: m, label: MODE_LABEL[m] }))}
              />
            </Field>
            <Field label="Target minutes" htmlFor={id('minutes')} hint="5–600">
              <TextInput
                id={id('minutes')}
                type="number"
                inputMode="numeric"
                min={5}
                max={600}
                value={value.targetMinutes}
                onChange={(e) => set({ targetMinutes: e.target.value })}
              />
            </Field>
            <Field
              label="Due"
              htmlFor={id('due')}
              hint={prefill.nextClassAt ? 'Defaults to the next class' : 'Defaults to three days from now'}
            >
              <TextInput id={id('due')} type="date" value={value.dueOn} onChange={(e) => set({ dueOn: e.target.value })} />
            </Field>
          </div>
        </>
      )}
    </section>
  );
}
