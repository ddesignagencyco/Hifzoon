'use client';

import React from 'react';
import { Eye } from 'lucide-react';
import { Field } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { QaidaGrid, TILE_SIZE } from '@/components/classroom/LessonBoard';
import { duaWords } from '@/components/duas/DuaReader';
import { useDuaCollection, type DuaItem } from '@/lib/api/modules/duas';
import { meaningTextProps } from '@/lib/api/modules/quran-public';
import type { PracticeBoard, PracticePassage } from '@/lib/api/modules/practice';
import { QAIDA_LESSONS } from '@/lib/data/lesson-boards';
import {
  duaWordRef,
  markedDuaWord,
  practiceDuas,
  practiceQaidaLesson,
  qaidaItemRef,
} from '@/lib/board-practice';
import { cn } from '@/lib/utils';

/** Same Quran face as the Duas reader and the class board. */
const ARABIC: React.CSSProperties = { fontFamily: "var(--font-quran), 'Amiri Quran', 'Amiri', serif" };

/** A mark on a board practice: the dua word / Qaida item reference. */
export interface BoardMark {
  itemRef?: string | null;
  type: string;
}

/**
 * What a dua or Qaida practice shows in place of Mushaf ayahs: the dua(s) as the Duas reader shows
 * them (Arabic, transliteration, meaning), or the Qaida lesson's tiles as on the class board.
 *
 * - `hidden` (Test myself): the Arabic of each dua (each Qaida tile) stays covered until tapped.
 * - `onPick` (teacher review): each dua word, the whole dua, or each Qaida tile can be tapped to
 *   mark it; the reference is the classroom logger's.
 */
export function BoardPassage({
  passage,
  hidden = false,
  revealed,
  onReveal,
  marks = [],
  pending,
  onPick,
}: {
  passage: Pick<PracticePassage, 'board' | 'boardLesson' | 'boardItem' | 'label'>;
  hidden?: boolean;
  revealed?: ReadonlySet<string>;
  onReveal?: (key: string) => void;
  /** The teacher's marks, underlined. */
  marks?: BoardMark[];
  /** References chosen in this review, not yet saved. */
  pending?: ReadonlySet<string>;
  onPick?: (pick: { itemRef: string; text: string }) => void;
}) {
  const duas = useDuaCollection(passage.board === 'DUAS');
  if (passage.board === 'QAIDA') {
    const lesson = practiceQaidaLesson(passage);
    if (!lesson) return <p className="text-xs text-muted">This Qaida lesson is not in the Qaida any more.</p>;
    const markedItems = new Set(
      marks
        .map((m) => m.itemRef ?? '')
        .filter((r) => r.startsWith(`${lesson.title}: `))
        .map((r) => r.slice(lesson.title.length + 2)),
    );
    const size = TILE_SIZE[lesson.size ?? 'md'];
    return (
      <div className="space-y-3" data-testid="board-passage">
        <p className="text-xs text-muted">{lesson.aim}</p>
        {hidden ? (
          <div dir="rtl" lang="ar" className={cn('grid gap-2', size.grid)}>
            {lesson.items.map((text, i) => {
              const key = `qaida:${i}`;
              const shown = revealed?.has(key);
              return shown ? (
                <div
                  key={key}
                  className={cn(
                    'flex items-center justify-center rounded-xl border border-gold/30 bg-[#fbf5ea] leading-[1.6] text-ink',
                    size.tile,
                  )}
                >
                  <span style={ARABIC}>{text}</span>
                </div>
              ) : (
                <button
                  key={key}
                  type="button"
                  aria-label={`Hidden item ${i + 1}, tap to show`}
                  onClick={() => onReveal?.(key)}
                  className={cn('rounded-xl border border-line bg-line/60 hover:bg-line', size.tile)}
                />
              );
            })}
          </div>
        ) : (
          <QaidaGrid
            lesson={lesson}
            selected={null}
            canSelect={Boolean(onPick)}
            onSelect={(i) => onPick?.({ itemRef: qaidaItemRef(lesson, lesson.items[i]), text: lesson.items[i] })}
          />
        )}
        {(markedItems.size > 0 || (pending && pending.size > 0)) && (
          <p className="text-[11px] text-muted">
            Marked:{' '}
            <span dir="rtl" lang="ar" style={ARABIC} className="text-base text-red-800">
              {[...markedItems, ...[...(pending ?? [])].map((r) => r.slice(lesson.title.length + 2))].join('  ')}
            </span>
          </p>
        )}
        {onPick && <p className="text-[11px] text-muted">Tap an item that was read wrongly to mark it.</p>}
      </div>
    );
  }

  if (duas.isLoading) return <p className="text-sm text-muted">Loading the duas…</p>;
  const found = practiceDuas(passage, duas.data?.categories);
  if (duas.isError || !found) {
    return (
      <p className="text-sm text-muted">
        {duas.isError ? 'The duas could not be loaded.' : 'This dua is not in the collection any more.'}
      </p>
    );
  }
  return (
    <div className="space-y-3" data-testid="board-passage">
      {found.duas.length > 1 && (
        <div className="text-center">
          <p className="text-sm font-semibold text-ink">{found.chapter.title}</p>
          <p dir="rtl" lang="ar" className="text-sm text-ink-2" style={ARABIC}>
            {found.chapter.titleAr}
          </p>
        </div>
      )}
      {found.duas.map((dua) => (
        <PracticeDua
          key={dua.id}
          dua={dua}
          hidden={hidden && !revealed?.has(`dua:${dua.id}`)}
          onReveal={() => onReveal?.(`dua:${dua.id}`)}
          marks={marks}
          pending={pending}
          onPick={onPick}
        />
      ))}
      <p className="text-[10px] text-muted">
        From Hisn al-Muslim by Saʿid ibn ʿAli ibn Wahf al-Qahtani, as published by hisnmuslim.com.
      </p>
    </div>
  );
}

/** One dua, rendered as the Duas reader does, with its Arabic covered in Test myself. */
function PracticeDua({
  dua,
  hidden,
  onReveal,
  marks,
  pending,
  onPick,
}: {
  dua: DuaItem;
  hidden: boolean;
  onReveal: () => void;
  marks: BoardMark[];
  pending?: ReadonlySet<string>;
  onPick?: (pick: { itemRef: string; text: string }) => void;
}) {
  const marked = new Set(marks.map((m) => markedDuaWord(m.itemRef, dua)).filter((n): n is number => n !== null));
  const chosen = new Set([...(pending ?? [])].map((r) => markedDuaWord(r, dua)).filter((n): n is number => n !== null));
  const wholeMarked = marks.some((m) => m.itemRef === dua.title) || pending?.has(dua.title);
  return (
    <article
      data-testid={`dua-${dua.id}`}
      className={cn(
        'rounded-2xl border bg-[#fbf5ea] px-4 py-5 text-center sm:px-8',
        wholeMarked ? 'border-red-300' : 'border-gold/40',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-600">{dua.title}</p>
      {hidden ? (
        <button
          type="button"
          onClick={onReveal}
          className="mt-3 inline-flex min-h-24 w-full items-center justify-center gap-2 rounded-xl bg-line/60 text-sm font-semibold text-ink-2 hover:bg-line"
        >
          <Eye className="h-4 w-4" aria-hidden /> Say it from memory, then tap to check
        </button>
      ) : (
        <p
          dir="rtl"
          lang="ar"
          style={ARABIC}
          className="mt-3 whitespace-pre-line text-[1.6rem] leading-[2.1] text-ink sm:text-[2rem]"
        >
          {duaWords(dua.arabic).map((p, i) => {
            if (p.n === null) return <React.Fragment key={i}>{p.text}</React.Fragment>;
            const n = p.n;
            const tone = chosen.has(n)
              ? 'bg-amber-200 text-amber-950 ring-2 ring-amber-500'
              : marked.has(n)
                ? 'text-red underline decoration-red decoration-2 underline-offset-8'
                : '';
            return onPick ? (
              <button
                key={i}
                type="button"
                aria-label={`Word ${n}: ${p.text}`}
                aria-pressed={chosen.has(n)}
                onClick={() => onPick({ itemRef: duaWordRef(dua, n, p.text), text: p.text })}
                className={cn('rounded-md px-0.5 transition-colors hover:bg-gold/20', tone)}
              >
                {p.text}
              </button>
            ) : tone ? (
              <span key={i} className={tone}>
                {p.text}
              </span>
            ) : (
              <React.Fragment key={i}>{p.text}</React.Fragment>
            );
          })}
        </p>
      )}
      {dua.transliteration && <p className="mt-2 text-sm italic text-ink-2">{dua.transliteration}</p>}
      {dua.translation.en ? (
        <p {...meaningTextProps('en')} className="mt-2 text-sm text-green-800">
          {dua.translation.en}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">No translation is given in the source for this entry.</p>
      )}
      <p className="mt-2 text-[11px] text-muted">
        {dua.reference}
        {dua.repeat > 1 && ` · say ${dua.repeat} times`}
      </p>
      {onPick && (
        <button
          type="button"
          onClick={() => onPick({ itemRef: dua.title, text: dua.title })}
          className="mt-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-sand"
        >
          Mark the whole dua
        </button>
      )}
    </article>
  );
}

/**
 * Teacher, Set practice for a Duas or Qaida student: a dua chapter and optionally one dua of it
 * (both searchable), or a Qaida lesson.
 */
export function BoardPracticeFields({
  board,
  lesson,
  item,
  onChange,
}: {
  board: PracticeBoard;
  lesson: number | null;
  item: number | null;
  onChange: (next: { lesson: number | null; item: number | null }) => void;
}) {
  const duas = useDuaCollection(board === 'DUAS');
  if (board === 'QAIDA') {
    return (
      <Field label="Qaida lesson" htmlFor="practice-qaida-lesson" required>
        <Select
          id="practice-qaida-lesson"
          value={lesson ? String(lesson) : ''}
          onChange={(e) => onChange({ lesson: Number(e.target.value) || null, item: null })}
          options={[
            { value: '', label: 'Choose a lesson…' },
            ...QAIDA_LESSONS.map((l, i) => ({ value: String(i + 1), label: `Lesson ${i + 1} — ${l.title}` })),
          ]}
          searchable
          noOptionsText="No lesson matches"
        />
      </Field>
    );
  }
  const categories = duas.data?.categories ?? [];
  const chapter = categories.find((c) => c.id === lesson);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field
        label="Dua chapter"
        htmlFor="practice-dua-chapter"
        required
        hint={duas.isLoading ? 'Loading the duas…' : duas.isError ? 'The duas could not be loaded.' : undefined}
      >
        <Select
          id="practice-dua-chapter"
          value={lesson ? String(lesson) : ''}
          onChange={(e) => onChange({ lesson: Number(e.target.value) || null, item: null })}
          options={[
            { value: '', label: 'Choose a chapter…' },
            ...categories.map((c) => ({ value: String(c.id), label: `${c.id}. ${c.title}` })),
          ]}
          searchable
          noOptionsText="No chapter matches"
        />
      </Field>
      <Field label="One dua" htmlFor="practice-dua-item" hint="Optional: leave as the whole chapter">
        <Select
          id="practice-dua-item"
          value={item === null ? '' : String(item)}
          disabled={!chapter}
          onChange={(e) => onChange({ lesson, item: e.target.value === '' ? null : Number(e.target.value) })}
          options={[
            { value: '', label: 'The whole chapter' },
            ...(chapter?.duas ?? []).map((d, i) => ({
              value: String(i),
              label: d.title,
              description: d.translation.en ? d.translation.en.slice(0, 90) : undefined,
            })),
          ]}
          searchable
          noOptionsText="No dua matches"
        />
      </Field>
    </div>
  );
}
