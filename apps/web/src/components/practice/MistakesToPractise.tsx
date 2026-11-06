'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { BookOpen, Volume2 } from 'lucide-react';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorState,
  formatDate,
  LoadingState,
  UiButton,
  type Column,
} from '@/components/ui/primitives';
import { parentKeys } from '@/hooks/useParentProgress';
import { lessonsReadApi, mistakeLabel, type MistakeRecord } from '@/lib/api/modules/lessons-read';
import { useDuaCollection, type DuaItem } from '@/lib/api/modules/duas';
import {
  isMushafMistake,
  mistakesPracticeApi,
  readerHref,
  splitOpenMistakes,
} from '@/lib/mistakes-practice';

export const NO_OPEN_MISTAKES = 'No open mistakes — new ones from class appear here.';

/** Enough history to find every open mistake; the list is filtered here. */
const HISTORY = { limit: 500 } as const;

export type ReaderBase = '/parent/quran' | '/student/quran';

export interface MistakeStudent {
  id: string;
  displayName: string;
}

/** One open mistake, with whose it is. */
export interface OpenMistakeRow {
  studentId: string;
  studentName: string;
  mistake: MistakeRecord;
}

/** "Surah 112:2 · word 1" for a Mushaf mistake; the item reference for Qaida, Duas and the rest. */
export function mistakeWhereLabel(m: MistakeRecord): string {
  if (isMushafMistake(m)) {
    return `Surah ${m.surah}:${m.ayah}${m.wordIndex !== null ? ` · word ${m.wordIndex + 1}` : ''}`;
  }
  return m.itemRef || mistakeLabel(m.type);
}

/** Every open mistake of these children, newest first. */
export function useOpenMistakes(students: MistakeStudent[], { includeResolved = false }: { includeResolved?: boolean } = {}) {
  const queries = useQueries({
    queries: students.map((s) => ({
      queryKey: parentKeys.mistakes(s.id, HISTORY),
      queryFn: () => lessonsReadApi.mistakes(s.id, HISTORY),
    })),
  });
  const rows: OpenMistakeRow[] = [];
  queries.forEach((q, i) => {
    const s = students[i];
    // The badge and the default view count open ones; the page can also list the fixed ones.
    const list = includeResolved
      ? (q.data ?? []).filter((m) => m.confirmed && !m.dismissedAt)
      : (() => {
          const { mushaf, items } = splitOpenMistakes(q.data ?? []);
          return [...mushaf, ...items];
        })();
    for (const m of list) {
      rows.push({ studentId: s.id, studentName: s.displayName, mistake: m });
    }
  });
  rows.sort((a, b) => Date.parse(b.mistake.occurredAt) - Date.parse(a.mistake.occurredAt));
  const failed = queries.find((q) => q.isError);
  return {
    rows,
    isLoading: queries.some((q) => q.isLoading),
    error: failed?.error ?? null,
    refetch: () => queries.forEach((q) => void q.refetch()),
  };
}

/**
 * Open mistakes as a table: where, what kind, when it was marked, and for a Mushaf mistake the
 * ayah's recitation and a link to read it with the wrong words underlined.
 */
export function MistakesTable({
  rows,
  readerBase,
  passStudent = readerBase === '/parent/quran',
  showChild = false,
}: {
  rows: OpenMistakeRow[];
  readerBase: ReaderBase;
  /** The family reader needs to know whose mistakes to underline. */
  passStudent?: boolean;
  showChild?: boolean;
}) {
  const [playing, setPlaying] = useState<string | null>(null);
  // Duas mistakes name the dua by its title; the collection gives its text to read at home.
  const duas = useDuaCollection(rows.some((r) => !isMushafMistake(r.mistake) && r.mistake.itemRef));
  const [audio, setAudio] = useState<Record<string, string | 'unavailable' | 'loading'>>({});

  const listen = async (rowId: string, surah: number, ayah: number) => {
    if (playing === rowId) {
      setPlaying(null);
      return;
    }
    setPlaying(rowId);
    const key = `${surah}:${ayah}`;
    if (audio[key] && audio[key] !== 'unavailable') return;
    setAudio((a) => ({ ...a, [key]: 'loading' }));
    try {
      const { url } = await mistakesPracticeApi.ayahAudio(surah, ayah);
      setAudio((a) => ({ ...a, [key]: url }));
    } catch {
      setAudio((a) => ({ ...a, [key]: 'unavailable' }));
    }
  };

  const columns: Column<OpenMistakeRow>[] = [
    ...(showChild
      ? [
          {
            key: 'child',
            header: 'Child',
            render: (r: OpenMistakeRow) => <span className="font-semibold text-ink">{r.studentName}</span>,
            sortValue: (r: OpenMistakeRow) => r.studentName,
          },
        ]
      : []),
    {
      key: 'where',
      header: 'Where',
      render: (r) => <span className="font-semibold text-ink tabular-nums">{mistakeWhereLabel(r.mistake)}</span>,
      sortValue: (r) => (r.mistake.surah ?? 999) * 1000 + (r.mistake.ayah ?? 0),
    },
    {
      key: 'mistake',
      header: 'Mistake',
      render: (r) => (
        <span className="text-ink-2">
          {mistakeLabel(r.mistake.type)}
          {r.mistake.note && <span className="text-muted"> · {r.mistake.note}</span>}
        </span>
      ),
      sortValue: (r) => mistakeLabel(r.mistake.type),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        r.mistake.resolvedAt ? (
          <Badge tone="green">Fixed {formatDate(r.mistake.resolvedAt)}</Badge>
        ) : (
          <Badge tone="amber">To practise</Badge>
        ),
      sortValue: (r) => (r.mistake.resolvedAt ? 1 : 0),
    },
    {
      key: 'marked',
      header: 'Marked on',
      render: (r) => formatDate(r.mistake.occurredAt),
      sortValue: (r) => Date.parse(r.mistake.occurredAt),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      sortable: false,
      render: (r) => {
        const m = r.mistake;
        if (!isMushafMistake(m)) {
          if (!m.itemRef) return null;
          const found = findDua(m.itemRef, duas.data?.categories);
          const duasBase = readerBase.replace(/\/quran$/, '/duas');
          // No exact match (an older or hand-typed reference): open the Duas page searching for it.
          const href = found
            ? `${duasBase}?dua=${found.dua.id}${found.word !== null ? `&word=${found.word}` : ''}`
            : found === null && duas.data
              ? `${duasBase}?q=${encodeURIComponent(m.itemRef.split(' · word ')[0])}`
              : null;
          if (!href) return null;
          return (
            <div className="flex justify-end">
              <Link
                href={href}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-sand"
                aria-label={`Read ${found?.dua.title ?? m.itemRef}`}
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden /> Read
              </Link>
            </div>
          );
        }
        const where = mistakeWhereLabel(m);
        const src = audio[`${m.surah}:${m.ayah}`];
        const on = playing === m.id;
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <UiButton
                size="sm"
                variant="secondary"
                icon={<Volume2 className="h-3.5 w-3.5" aria-hidden />}
                aria-pressed={on}
                aria-label={`Listen to ${where}`}
                loading={on && src === 'loading'}
                onClick={() => void listen(m.id, m.surah, m.ayah)}
              >
                {on ? 'Stop' : 'Listen'}
              </UiButton>
              <Link
                href={readerHref(readerBase, m.surah, m.ayah, passStudent ? r.studentId : undefined)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-sand"
                aria-label={`Read ${where} in the Mushaf`}
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden /> Read
              </Link>
            </div>
            {on && src === 'unavailable' && (
              <p role="status" className="text-xs text-muted">
                Recitation audio is not available on this deployment yet.
              </p>
            )}
            {on && src && src !== 'loading' && src !== 'unavailable' && (
              <audio
                className="h-9 w-full min-w-48"
                src={src}
                controls
                autoPlay
                onEnded={() => setPlaying(null)}
                aria-label={`Recitation of Surah ${m.surah}:${m.ayah}`}
              />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <DataTable<OpenMistakeRow>
      rows={rows}
      rowKey={(r) => r.mistake.id}
      columns={columns}
      pageSize={20}
      empty={<EmptyState title={NO_OPEN_MISTAKES} />}
    />
  );
}

/** One child's open mistakes, as a table (the child's Mistakes tab). */
export function MistakesToPractise({
  studentId,
  readerBase,
  passStudent,
}: {
  studentId: string;
  readerBase: ReaderBase;
  passStudent?: boolean;
}) {
  const query = useOpenMistakes([{ id: studentId, displayName: '' }]);
  if (query.isLoading) return <LoadingState label="Loading mistakes…" />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  return <MistakesTable rows={query.rows} readerBase={readerBase} passStudent={passStudent} />;
}

/** Section heading on the page background (no card), as on the other list pages. */
export function MistakesToPractiseSection({ children, description }: { children: React.ReactNode; description?: string }) {
  return (
    <section aria-labelledby="mistakes-to-practise" className="mb-8 space-y-3">
      <div>
        <h2 id="mistakes-to-practise" className="text-lg font-semibold text-ink">
          Mistakes to practise
        </h2>
        <p className="text-sm text-muted">
          {description ?? 'Marked by the teacher in class. Listen, read it in the Mushaf, and recite it again next class.'}
        </p>
      </div>
      {children}
    </section>
  );
}

/** The dua a Duas mistake was logged on, and the word (1-based) when the teacher tapped one. */
export function findDua(
  itemRef: string | null | undefined,
  categories: Array<{ duas: DuaItem[] }> | undefined,
): { dua: DuaItem; word: number | null } | null {
  if (!itemRef || !categories) return null;
  const [title] = itemRef.split(' · word ');
  const wordMatch = / · word (\d+)/.exec(itemRef);
  for (const c of categories) {
    const dua = c.duas.find((d) => d.title === title.trim());
    if (dua) return { dua, word: wordMatch ? Number(wordMatch[1]) : null };
  }
  // A chapter title (a whole chapter was marked): open its first dua.
  for (const c of categories as Array<{ title?: string; duas: DuaItem[] }>) {
    if (c.title && c.title === title.trim() && c.duas[0]) return { dua: c.duas[0], word: null };
  }
  return null;
}
