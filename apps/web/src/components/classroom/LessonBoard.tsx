'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { DUA_LESSONS, LessonBoardKind, QAIDA_LESSONS } from '@/lib/data/lesson-boards';

export interface LessonPosition {
  board: LessonBoardKind;
  lesson: number;
  item: number | null;
}

const ARABIC: React.CSSProperties = { fontFamily: "var(--font-quran), 'Amiri Quran', 'Amiri', serif" };

/**
 * The shared board for a Qaida or Duas class. The teacher picks the lesson and the item;
 * everyone else sees the same thing, as with the Mushaf page.
 */
export function LessonBoard({
  board,
  position,
  isTeacher,
  onSelect,
  meaningLanguage,
}: {
  board: LessonBoardKind;
  position: LessonPosition | null;
  isTeacher: boolean;
  onSelect: (next: LessonPosition) => void;
  /** The language picked for meanings; duas have English and Urdu. */
  meaningLanguage: string | null;
}) {
  const lessons = board === 'QAIDA' ? QAIDA_LESSONS : DUA_LESSONS;
  const current = position && position.board === board ? position : { board, lesson: 1, item: null };
  const lessonIndex = Math.min(Math.max(current.lesson, 1), lessons.length) - 1;
  const lesson = lessons[lessonIndex];
  const choose = (lessonNumber: number, item: number | null) => {
    if (isTeacher) onSelect({ board, lesson: lessonNumber, item });
  };

  return (
    <div className="space-y-4">
      <nav aria-label={board === 'QAIDA' ? 'Qaida lessons' : 'Dua lessons'} className="flex flex-wrap gap-1.5">
        {lessons.map((l, i) => (
          <button
            key={l.title}
            type="button"
            disabled={!isTeacher}
            aria-current={i === lessonIndex ? 'true' : undefined}
            onClick={() => choose(i + 1, null)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              i === lessonIndex ? 'border-green-800 bg-green-800 text-white' : 'border-line bg-white text-ink-2',
              isTeacher ? 'cursor-pointer hover:border-gold/60' : 'cursor-default',
            )}
          >
            {i + 1}. {l.title}
          </button>
        ))}
      </nav>
      <p className="text-xs text-muted">{lesson.aim}</p>

      {board === 'QAIDA' ? (
        <QaidaGrid items={QAIDA_LESSONS[lessonIndex].items} selected={current.item} canSelect={isTeacher} onSelect={(i) => choose(lessonIndex + 1, i)} />
      ) : (
        <DuaList
          lesson={DUA_LESSONS[lessonIndex]}
          selected={current.item}
          canSelect={isTeacher}
          onSelect={(i) => choose(lessonIndex + 1, i)}
          urdu={meaningLanguage === 'ur'}
        />
      )}
      <p className="text-[10px] text-muted">Draft lesson content — to be checked by the academy’s teachers.</p>
    </div>
  );
}

function QaidaGrid({
  items,
  selected,
  canSelect,
  onSelect,
}: {
  items: string[];
  selected: number | null;
  canSelect: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <div dir="rtl" lang="ar" className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
      {items.map((text, i) => (
        <button
          key={`${text}-${i}`}
          type="button"
          disabled={!canSelect}
          aria-pressed={selected === i}
          aria-label={`Item ${i + 1}`}
          onClick={() => onSelect(i)}
          style={ARABIC}
          className={cn(
            'flex aspect-square items-center justify-center rounded-xl border bg-[#fbf5ea] text-3xl leading-none text-ink transition-colors sm:text-4xl',
            selected === i ? 'border-green-700 bg-green-50 ring-2 ring-green-600' : 'border-gold/30',
            canSelect ? 'cursor-pointer hover:border-gold' : 'cursor-default',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function DuaList({
  lesson,
  selected,
  canSelect,
  onSelect,
  urdu,
}: {
  lesson: (typeof DUA_LESSONS)[number];
  selected: number | null;
  canSelect: boolean;
  onSelect: (index: number) => void;
  urdu: boolean;
}) {
  const open = lesson.items[selected ?? 0];
  return (
    <div className="space-y-3">
      <article className="rounded-2xl border border-gold/40 bg-[#fbf5ea] px-4 py-5 text-center sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-600">{open.title}</p>
        <p dir="rtl" lang="ar" style={ARABIC} className="mt-3 text-[1.7rem] leading-[2.1] text-ink sm:text-[2.2rem]">
          {open.arabic}
        </p>
        <p className="mt-2 text-sm italic text-ink-2">{open.transliteration}</p>
        <p dir={urdu ? 'rtl' : 'ltr'} lang={urdu ? 'ur' : 'en'} className="mt-2 text-sm text-green-800">
          {urdu ? open.meaning.ur : open.meaning.en}
        </p>
        {open.source && <p className="mt-1 text-[11px] text-muted">{open.source}</p>}
      </article>
      <ol className="grid gap-2 sm:grid-cols-2">
        {lesson.items.map((d, i) => (
          <li key={d.title}>
            <button
              type="button"
              disabled={!canSelect}
              aria-pressed={(selected ?? 0) === i}
              onClick={() => onSelect(i)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                (selected ?? 0) === i ? 'border-green-700 bg-green-50' : 'border-line bg-white',
                canSelect ? 'cursor-pointer hover:border-gold/60' : 'cursor-default',
              )}
            >
              <span className="font-medium text-ink">
                {i + 1}. {d.title}
              </span>
              <span dir="rtl" lang="ar" style={ARABIC} className="truncate text-base text-ink-2">
                {d.arabic}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
