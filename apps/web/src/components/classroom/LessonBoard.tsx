'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Select } from '@/components/ui/select';
import { meaningTextProps } from '@/lib/api/modules/quran-public';
import { DuaCategory, useDuaCollection } from '@/lib/api/modules/duas';
import { LessonBoardKind, QAIDA_LESSONS, QaidaLesson } from '@/lib/data/lesson-boards';

export interface LessonPosition {
  board: LessonBoardKind;
  lesson: number;
  item: number | null;
}

const ARABIC: React.CSSProperties = {
  fontFamily: "var(--font-quran), 'Amiri Quran', 'Amiri', serif",
};

/**
 * The shared board for a Qaida or Duas class. The teacher picks the lesson and the item;
 * everyone else sees the same thing, as with the Mushaf page.
 */
/** A logged mistake drawn on the board: a red underline (green once fixed), lighter for earlier classes. */
export interface BoardMark {
  lesson: number;
  item: number | null;
  /** The dua word (1-based), when the mistake was on one. */
  word: number | null;
  fixed: boolean;
  earlier?: boolean;
}

type MarkTone = 'open' | 'fixed' | 'earlier';

/** The strongest mark per key: this class's open mistake, then fixed, then an earlier open one. */
function markTones<K>(marks: BoardMark[], keyOf: (m: BoardMark) => K | null): Map<K, MarkTone> {
  const rank: Record<MarkTone, number> = { open: 3, fixed: 2, earlier: 1 };
  const out = new Map<K, MarkTone>();
  for (const m of marks) {
    const key = keyOf(m);
    if (key === null) continue;
    const tone: MarkTone = m.earlier ? 'earlier' : m.fixed ? 'fixed' : 'open';
    const had = out.get(key);
    if (!had || rank[tone] > rank[had]) out.set(key, tone);
  }
  return out;
}

const MARK_UNDERLINE: Record<MarkTone, string> = {
  open: 'underline decoration-red decoration-2 underline-offset-[10px]',
  fixed: 'underline decoration-emerald-600 decoration-2 underline-offset-[10px]',
  earlier: 'underline decoration-red/45 decoration-dotted decoration-2 underline-offset-[10px]',
};
const MARK_BAR: Record<MarkTone, string> = {
  open: 'bg-red',
  fixed: 'bg-emerald-600',
  earlier: 'bg-red/40',
};
const MARK_LABEL: Record<MarkTone, string> = {
  open: 'mistake logged',
  fixed: 'mistake fixed',
  earlier: 'open mistake from an earlier class',
};

export function LessonBoard({
  board,
  position,
  isTeacher,
  onSelect,
  meaningLanguage,
  selectedWord = null,
  onPickWord,
  marks = [],
}: {
  board: LessonBoardKind;
  position: LessonPosition | null;
  isTeacher: boolean;
  onSelect: (next: LessonPosition) => void;
  /** The language picked for meanings (en or ur). */
  meaningLanguage: string | null;
  /** The word of the open dua the teacher tapped (1-based), to log a mistake on it. */
  selectedWord?: number | null;
  /** Given, the words of the open dua can be tapped one by one, like Mushaf words. */
  onPickWord?: (word: { index: number; text: string } | null) => void;
  /** Mistakes to underline (both the teacher's and the family's boards). */
  marks?: BoardMark[];
}) {
  const current =
    position && position.board === board ? position : { board, lesson: 1, item: null };
  const choose = (lessonNumber: number, item: number | null) => {
    if (isTeacher) onSelect({ board, lesson: lessonNumber, item });
  };
  return board === 'QAIDA' ? (
    <QaidaBoard current={current} isTeacher={isTeacher} choose={choose} marks={marks} />
  ) : (
    <DuasBoard
      current={current}
      isTeacher={isTeacher}
      choose={choose}
      meaningLanguage={meaningLanguage}
      selectedWord={selectedWord}
      onPickWord={onPickWord}
      marks={marks}
    />
  );
}

type Choose = (lessonNumber: number, item: number | null) => void;

/** Lesson dropdown with previous/next, for long lesson lists. */
function LessonNav({
  label,
  titles,
  index,
  isTeacher,
  onGo,
}: {
  label: string;
  titles: string[];
  index: number;
  isTeacher: boolean;
  onGo: (index: number) => void;
}) {
  const button =
    'rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-2 disabled:opacity-40';
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={button}
        disabled={!isTeacher || index <= 0}
        onClick={() => onGo(index - 1)}
        aria-label="Previous lesson"
      >
        ‹ Prev
      </button>
      <Select
        aria-label={label}
        value={String(index)}
        disabled={!isTeacher}
        onChange={(e) => onGo(Number(e.target.value))}
        options={titles.map((t, i) => ({ value: String(i), label: `${i + 1}. ${t}` }))}
        searchable
        size="sm"
        noOptionsText="No lesson matches"
        className="min-w-0 max-w-full flex-1"
      />
      <button
        type="button"
        className={button}
        disabled={!isTeacher || index >= titles.length - 1}
        onClick={() => onGo(index + 1)}
        aria-label="Next lesson"
      >
        Next ›
      </button>
    </nav>
  );
}

function QaidaBoard({
  current,
  isTeacher,
  choose,
  marks,
}: {
  current: LessonPosition;
  isTeacher: boolean;
  choose: Choose;
  marks: BoardMark[];
}) {
  const index = Math.min(Math.max(current.lesson, 1), QAIDA_LESSONS.length) - 1;
  const lesson = QAIDA_LESSONS[index];
  return (
    <div className="space-y-4">
      <LessonNav
        label="Qaida lessons"
        titles={QAIDA_LESSONS.map((l) => l.title)}
        index={index}
        isTeacher={isTeacher}
        onGo={(i) => choose(i + 1, null)}
      />
      <p className="text-xs text-muted">{lesson.aim}</p>
      <QaidaGrid
        lesson={lesson}
        selected={current.item}
        canSelect={isTeacher}
        onSelect={(i) => choose(index + 1, i)}
        marked={markTones(marks, (m) => (m.lesson === index + 1 ? m.item : null))}
      />
      <p className="text-[10px] text-muted">
        Noorani Qaida, 17 lessons. Letter and vowel drills are built from the alphabet; word lessons
        use Quranic words (surah:ayah shown).
      </p>
    </div>
  );
}

export const TILE_SIZE: Record<NonNullable<QaidaLesson['size']>, { grid: string; tile: string }> = {
  lg: {
    grid: 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-8',
    tile: 'aspect-square text-4xl sm:text-5xl',
  },
  md: {
    grid: 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-6',
    tile: 'aspect-[4/3] text-3xl sm:text-4xl',
  },
  sm: {
    grid: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
    tile: 'min-h-24 py-3 text-2xl sm:text-3xl',
  },
};

/** A Qaida lesson's tiles; also shown read-only (or tappable for review) on the practice screen. */
export function QaidaGrid({
  lesson,
  selected,
  canSelect,
  onSelect,
  marked,
}: {
  lesson: QaidaLesson;
  selected: number | null;
  canSelect: boolean;
  onSelect: (index: number) => void;
  /** Tiles with a logged mistake, underlined. */
  marked?: Map<number, MarkTone>;
}) {
  const size = TILE_SIZE[lesson.size ?? 'md'];
  return (
    <div dir="rtl" lang="ar" className={cn('grid gap-2', size.grid)}>
      {lesson.items.map((text, i) => {
        const mark = marked?.get(i);
        return (
          <button
            key={`${text}-${i}`}
            type="button"
            disabled={!canSelect}
            aria-pressed={selected === i}
            aria-label={`Item ${i + 1}${mark ? `, ${MARK_LABEL[mark]}` : ''}`}
            data-mark={mark}
            onClick={() => onSelect(i)}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1 rounded-xl border bg-[#fbf5ea] leading-[1.6] text-ink transition-colors',
              size.tile,
              selected === i
                ? 'border-green-700 bg-green-50 ring-2 ring-green-600'
                : 'border-gold/30',
              canSelect ? 'cursor-pointer hover:border-gold' : 'cursor-default',
            )}
          >
            <span style={ARABIC}>{text}</span>
            {mark && <span className={cn('absolute inset-x-4 bottom-1.5 h-0.5 rounded-full', MARK_BAR[mark])} aria-hidden />}
            {lesson.refs?.[i] && (
              <span dir="ltr" lang="en" className="text-[10px] font-normal leading-tight text-muted">
                {lesson.refs[i]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DuasBoard({
  current,
  isTeacher,
  choose,
  meaningLanguage,
  selectedWord,
  onPickWord,
  marks,
}: {
  current: LessonPosition;
  isTeacher: boolean;
  choose: Choose;
  meaningLanguage: string | null;
  selectedWord: number | null;
  onPickWord?: (word: { index: number; text: string } | null) => void;
  marks: BoardMark[];
}) {
  const { data, isLoading, isError, refetch } = useDuaCollection();
  if (isLoading) return <p className="text-sm text-muted">Loading the duas…</p>;
  if (isError || !data || data.categories.length === 0) {
    return (
      <div className="space-y-2 text-sm text-muted">
        <p>The duas could not be loaded.</p>
        <button
          type="button"
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold"
          onClick={() => refetch()}
        >
          Try again
        </button>
      </div>
    );
  }
  const categories = data.categories;
  const index = Math.min(Math.max(current.lesson, 1), categories.length) - 1;
  const category = categories[index];
  return (
    <div className="space-y-4">
      {isTeacher && <DuaSearch categories={categories} onPick={(c, d) => choose(c + 1, d)} />}
      <LessonNav
        label="Dua chapters"
        titles={categories.map((c) => c.title)}
        index={index}
        isTeacher={isTeacher}
        onGo={(i) => choose(i + 1, null)}
      />
      <DuaList
        category={category}
        selected={current.item}
        canSelect={isTeacher}
        onSelect={(i) => choose(index + 1, i)}
        language={meaningLanguage}
        selectedWord={selectedWord}
        onPickWord={isTeacher ? onPickWord : undefined}
        marks={marks.filter((m) => m.lesson === index + 1)}
      />
      <p className="text-[10px] text-muted">
        From Hisn al-Muslim (Fortress of the Muslim) by Saʿid ibn ʿAli ibn Wahf al-Qahtani, as
        published by hisnmuslim.com. The reference is the entry number in the book.
      </p>
    </div>
  );
}

/** Find a dua by chapter title, meaning or transliteration, across every chapter. */
function DuaSearch({
  categories,
  onPick,
}: {
  categories: DuaCategory[];
  onPick: (category: number, dua: number) => void;
}) {
  const [query, setQuery] = React.useState('');
  const q = query.trim().toLowerCase();
  const results = React.useMemo(() => {
    if (q.length < 2) return [];
    // Chapter titles first ("sleep" finds "What to say before sleeping"), then the text itself.
    const byTitle: Array<{ c: number; d: number; title: string; snippet: string }> = [];
    const byText: typeof byTitle = [];
    categories.forEach((cat, c) =>
      cat.duas.forEach((dua, d) => {
        const hit = { c, d, title: dua.title, snippet: dua.translation.en ?? '' };
        if (`${cat.title} ${cat.titleAr}`.toLowerCase().includes(q)) byTitle.push(hit);
        else if (
          `${dua.translation.en ?? ''} ${dua.transliteration} ${dua.arabic}`
            .toLowerCase()
            .includes(q)
        )
          byText.push(hit);
      }),
    );
    return [...byTitle, ...byText].slice(0, 20);
  }, [categories, q]);
  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search duas, e.g. sleep, travel, rain…"
        aria-label="Search duas"
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
      />
      {q.length >= 2 && (
        <ul
          role="listbox"
          aria-label="Matching duas"
          className="mt-1 max-h-64 overflow-auto rounded-lg border border-line bg-white text-sm shadow-sm"
        >
          {results.length === 0 && (
            <li className="px-3 py-2 text-muted">No dua matches “{query.trim()}”.</li>
          )}
          {results.map((r) => (
            <li key={`${r.c}-${r.d}`}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="block w-full px-3 py-2 text-left hover:bg-[#fbf5ea]"
                onClick={() => {
                  onPick(r.c, r.d);
                  setQuery('');
                }}
              >
                <span className="font-medium text-ink">
                  {r.c + 1}. {r.title}
                </span>
                {r.snippet && (
                  <span className="block truncate text-xs text-muted">{r.snippet}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DuaList({
  category,
  selected,
  canSelect,
  onSelect,
  language,
  selectedWord = null,
  onPickWord,
  marks = [],
}: {
  category: DuaCategory;
  selected: number | null;
  canSelect: boolean;
  onSelect: (index: number) => void;
  language: string | null;
  selectedWord?: number | null;
  onPickWord?: (word: { index: number; text: string } | null) => void;
  /** This chapter's marks. */
  marks?: BoardMark[];
}) {
  const openIndex = Math.min(selected ?? 0, category.duas.length - 1);
  const open = category.duas[openIndex];
  const wanted = language === 'ur' ? 'ur' : 'en';
  const meaning = open.translation[wanted] || open.translation.en || '';
  const meaningLang = open.translation[wanted] ? wanted : 'en';
  const wordMarks = markTones(marks, (m) => ((m.item ?? 0) === openIndex ? m.word : null));
  return (
    <div className="space-y-3">
      <article className="rounded-2xl border border-gold/40 bg-[#fbf5ea] px-4 py-5 text-center sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-600">
          {open.title}
        </p>
        <p dir="rtl" lang="ar" className="mt-1 text-sm text-ink-2" style={ARABIC}>
          {category.titleAr}
        </p>
        <p
          dir="rtl"
          lang="ar"
          style={ARABIC}
          className="mt-3 whitespace-pre-line text-[1.7rem] leading-[2.1] text-ink sm:text-[2.2rem]"
        >
          {onPickWord ? (
            <DuaWords
              text={open.arabic}
              selected={selectedWord}
              marks={wordMarks}
              onPick={(word) => onPickWord(word.index === selectedWord ? null : word)}
            />
          ) : selectedWord !== null || wordMarks.size > 0 ? (
            // The class follows the word the teacher is pointing at, and sees the marked ones.
            <DuaWords text={open.arabic} selected={selectedWord} marks={wordMarks} />
          ) : (
            open.arabic
          )}
        </p>
        {onPickWord && (
          <p className="mt-1 text-[11px] text-muted">Tap a word to point the class at it; tap it again to clear.</p>
        )}
        {open.transliteration && (
          <p className="mt-2 text-sm italic text-ink-2">{open.transliteration}</p>
        )}
        {meaning ? (
          <p {...meaningTextProps(meaningLang)} className="mt-2 text-sm text-green-800">
            {meaning}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted">
            No translation is given in the source for this entry.
          </p>
        )}
        {language && language !== meaningLang && meaning && (
          <p className="mt-1 text-[11px] text-muted">
            The source has no Urdu meanings, so English is shown.
          </p>
        )}
        <p className="mt-2 text-[11px] text-muted">
          {open.reference}
          {open.repeat > 1 && ` · say ${open.repeat} times`}
        </p>
      </article>
      {category.duas.length > 1 && (
        <ol className="grid gap-2 sm:grid-cols-2">
          {category.duas.map((d, i) => (
            <li key={d.id}>
              <button
                type="button"
                disabled={!canSelect}
                aria-pressed={openIndex === i}
                onClick={() => onSelect(i)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                  openIndex === i ? 'border-green-700 bg-green-50' : 'border-line bg-white',
                  canSelect ? 'cursor-pointer hover:border-gold/60' : 'cursor-default',
                )}
              >
                <span className="shrink-0 font-medium text-ink">{i + 1}.</span>
                <span
                  dir="rtl"
                  lang="ar"
                  style={ARABIC}
                  className="min-w-0 truncate text-base text-ink-2"
                >
                  {d.arabic}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The dua's words as buttons (1-based index), keeping its line breaks. */
function DuaWords({
  text,
  selected,
  onPick,
  marks,
}: {
  text: string;
  selected: number | null;
  /** Words with a logged mistake (1-based), underlined. */
  marks?: Map<number, MarkTone>;
  /** Teacher: tap to point at a word. Without it the words are read-only, the selected one highlighted. */
  onPick?: (word: { index: number; text: string }) => void;
}) {
  // Number the words (1-based); the whitespace between them is kept as it is.
  const parts = text.split(/(\s+)/).reduce<Array<{ text: string; n: number | null }>>((acc, part) => {
    const count = acc.filter((p) => p.n !== null).length;
    acc.push({ text: part, n: part.trim() ? count + 1 : null });
    return acc;
  }, []);
  return (
    <>
      {parts.map(({ text: part, n }, i) =>
        n === null ? (
          part
        ) : !onPick ? (
          <span
            key={i}
            aria-current={selected === n ? 'true' : undefined}
            data-mark={marks?.get(n)}
            title={marks?.get(n) ? MARK_LABEL[marks.get(n) as MarkTone] : undefined}
            className={cn(
              'rounded-md px-0.5',
              selected === n && 'bg-gold/30 ring-2 ring-gold',
              marks?.get(n) && MARK_UNDERLINE[marks.get(n) as MarkTone],
            )}
          >
            {part}
          </span>
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => onPick({ index: n, text: part })}
            aria-pressed={selected === n}
            aria-label={`Word ${n}: ${part}${marks?.get(n) ? `, ${MARK_LABEL[marks.get(n) as MarkTone]}` : ''}`}
            data-mark={marks?.get(n)}
            className={cn(
              'rounded-md px-0.5 transition-colors hover:bg-gold/20',
              selected === n && 'bg-gold/30 ring-2 ring-gold',
              marks?.get(n) && MARK_UNDERLINE[marks.get(n) as MarkTone],
            )}
          >
            {part}
          </button>
        ),
      )}
    </>
  );
}
