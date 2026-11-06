'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardBody, ErrorState, LoadingState, PageHeader } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { FilterSearch, matchesSearch } from '@/components/ui/FilterSelect';
import { useDuaCollection, type DuaItem } from '@/lib/api/modules/duas';
import { meaningTextProps } from '@/lib/api/modules/quran-public';
import { cn } from '@/lib/utils';
import { BackLink } from '@/components/ui/BackLink';

const ARABIC: React.CSSProperties = { fontFamily: "var(--font-quran), 'Amiri Quran', 'Amiri', serif" };

/** The dua's words, numbered from 1, with the whitespace between them kept. */
export function duaWords(text: string): Array<{ text: string; n: number | null }> {
  return text.split(/(\s+)/).reduce<Array<{ text: string; n: number | null }>>((acc, part) => {
    const count = acc.filter((p) => p.n !== null).length;
    acc.push({ text: part, n: part.trim() ? count + 1 : null });
    return acc;
  }, []);
}

/**
 * Hisn al-Muslim for reading at home, the Duas counterpart of the Quran reader. Opened at
 * `?dua=<entry number>` (a mistake's Read link), with `&word=` underlining the word the teacher
 * marked; otherwise at `?chapter=`, or the first chapter.
 */
export function DuaReader({ eyebrow, basePath }: { eyebrow: string; basePath: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useDuaCollection();
  const duaParam = Number(params.get('dua')) || null;
  const word = Number(params.get('word')) || null;
  const chapterParam = Number(params.get('chapter')) || null;
  // `?q=` (a mistake whose dua wasn't found by name) starts the page searching for it.
  const [query, setQuery] = useState(() => params.get('q') ?? '');

  const categories = useMemo(() => data?.categories ?? [], [data]);
  const chapter =
    categories.find((c) => (duaParam ? c.duas.some((d) => d.id === duaParam) : c.id === chapterParam)) ??
    categories[0];

  const found = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return categories
      .flatMap((c) => c.duas.map((d) => ({ chapter: c, dua: d })))
      .filter(({ chapter: c, dua: d }) =>
        matchesSearch(q, c.title, d.title, d.translation.en, d.transliteration, d.arabic),
      )
      .slice(0, 20);
  }, [categories, query]);

  const go = (search: string) => router.replace(`${basePath}?${search}`, { scroll: false });

  return (
    <>
      {duaParam && <BackLink fallback={basePath.replace(/\/duas$/, '/mistakes')} label="Back to mistakes" />}
      <PageHeader
        eyebrow={eyebrow}
        title="Duas"
        description={
          duaParam
            ? 'Opened at the dua from class. Read it, learn it, and say it again in the next class.'
            : 'Hisn al-Muslim (Fortress of the Muslim): the duas from class, to read and learn at home.'
        }
      />
      {isLoading ? (
        <LoadingState label="Loading the duas…" />
      ) : isError || !chapter ? (
        <ErrorState error={error} title="Could not load the duas" onRetry={() => refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-96">
              <label htmlFor="dua-chapter" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Chapter
              </label>
              <Select
                id="dua-chapter"
                value={String(chapter.id)}
                onChange={(e) => go(`chapter=${e.target.value}`)}
                options={categories.map((c, i) => ({ value: String(c.id), label: `${i + 1}. ${c.title}` }))}
                searchable
              />
            </div>
            <FilterSearch id="dua-search" label="Search" value={query} onChange={setQuery} placeholder="e.g. sleep, travel, rain" />
          </div>
          {query.trim() && (
            <Card>
              <CardBody className="space-y-1">
                {found.length === 0 ? (
                  <p className="text-sm text-muted">No dua matches.</p>
                ) : (
                  found.map(({ chapter: c, dua: d }) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setQuery('');
                        go(`dua=${d.id}`);
                      }}
                      className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-sand"
                    >
                      <span className="font-medium text-ink">{d.title}</span>
                      <span className="block text-xs text-muted">{c.title}</span>
                    </button>
                  ))
                )}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardBody className="space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-ink">{chapter.title}</h2>
                <p dir="rtl" lang="ar" className="text-sm text-ink-2" style={ARABIC}>
                  {chapter.titleAr}
                </p>
              </div>
              {chapter.duas.map((d) => (
                <DuaBlock key={d.id} dua={d} active={d.id === duaParam} word={d.id === duaParam ? word : null} />
              ))}
              <p className="text-[10px] text-muted">
                From Hisn al-Muslim by Saʿid ibn ʿAli ibn Wahf al-Qahtani, as published by hisnmuslim.com. The reference is
                the entry number in the book.
              </p>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}

function DuaBlock({ dua, active, word }: { dua: DuaItem; active: boolean; word: number | null }) {
  return (
    <article
      id={`dua-${dua.id}`}
      ref={active ? (el) => el?.scrollIntoView({ block: 'center' }) : undefined}
      className={cn(
        'rounded-2xl border px-4 py-5 text-center sm:px-8',
        active ? 'border-gold bg-[#fbf5ea] ring-2 ring-gold/40' : 'border-line bg-white',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-600">{dua.title}</p>
      <p dir="rtl" lang="ar" style={ARABIC} className="mt-3 whitespace-pre-line text-[1.6rem] leading-[2.1] text-ink sm:text-[2rem]">
        {duaWords(dua.arabic).map((p, i) =>
          p.n !== null && p.n === word ? (
            <span key={i} className="text-red underline decoration-red decoration-2 underline-offset-8">
              {p.text}
            </span>
          ) : (
            <React.Fragment key={i}>{p.text}</React.Fragment>
          ),
        )}
      </p>
      {dua.transliteration && <p className="mt-2 text-sm italic text-ink-2">{dua.transliteration}</p>}
      {dua.translation.en && (
        <p {...meaningTextProps('en')} className="mt-2 text-sm text-green-800">
          {dua.translation.en}
        </p>
      )}
      {active && word !== null && (
        <p className="mt-2 flex items-center justify-center gap-2 text-xs text-muted" role="note">
          <span className="inline-block h-0.5 w-6 bg-red" aria-hidden />
          Red underline: the word your teacher marked to practise.
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted">
        {dua.reference}
        {dua.repeat > 1 && ` · say ${dua.repeat} times`}
      </p>
    </article>
  );
}
