'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardBody, LoadingState, PageHeader, Select } from '@/components/ui/primitives';
import { MushafViewer, type WordPosition } from '@/components/mushaf/MushafViewer';
import { lessonsReadApi } from '@/lib/api/modules/lessons-read';
import { enrolmentsApi } from '@/lib/api/modules/enrolments';
import { splitOpenMistakes } from '@/lib/mistakes-practice';
import { PageNavigator } from '@/components/mushaf/PageNavigator';
import { WordMeaningPicker, useWordMeaningLanguage } from '@/components/classroom/WordMeanings';
import { useMushafLayouts } from '@/hooks/useMushaf';
import { http } from '@/lib/api/http';
import { clampPage, layoutLabel, type MushafLayout } from '@/lib/api/modules/mushaf';
import { BackLink } from '@/components/ui/BackLink';

const LAST_PAGE_KEY = 'hifzoon.quran-reader.page';

/**
 * The Mushaf for reading at home: homework, revision, the practice passage. The same licensed
 * text as the classroom, opened at `?page=` or at the page of `?surah=&ayah=` (homework links),
 * else where the reader last stopped on this device.
 */
export function QuranReader({ eyebrow, self = false }: { eyebrow: string; self?: boolean }) {
  const params = useSearchParams();
  const markers = useMistakeMarkers(params.get('marks') === '1', params.get('student'), self);
  const surah = Number(params.get('surah')) || null;
  const ayah = Number(params.get('ayah')) || 1;
  const pageParam = Number(params.get('page')) || null;
  const layouts = useMushafLayouts();
  const [layout, setLayout] = useState<MushafLayout>('MADANI_15');
  const [page, setPage] = useState<number | null>(() => {
    if (pageParam) return pageParam;
    if (typeof window === 'undefined') return null;
    return Number(window.localStorage.getItem(LAST_PAGE_KEY)) || null;
  });
  const [wordLanguage, setWordLanguage] = useWordMeaningLanguage();

  // A homework link names an ayah: find the (Madani) page it starts on.
  const pageOf = useQuery({
    queryKey: ['mushaf', 'page-of', surah, ayah],
    queryFn: () => http.get<{ page: number }>('/mushaf/page-of', { query: { surah: String(surah), ayah: String(ayah) } }),
    enabled: Boolean(surah) && !pageParam,
    staleTime: Infinity,
  });
  const target = pageOf.data?.page;
  const [jumped, setJumped] = useState<number | null>(null);
  if (target && jumped !== target) {
    setJumped(target);
    setLayout('MADANI_15');
    setPage(target);
  }

  const maxPage = layouts.data?.find((l) => l.layout === layout)?.maxPage ?? 604;
  const current = clampPage(page ?? 1, maxPage);
  useEffect(() => {
    window.localStorage.setItem(LAST_PAGE_KEY, String(current));
  }, [current]);

  const available = layouts.data?.filter((l) => l.available !== false) ?? [];

  return (
    <>
      {markers && <BackLink fallback={self ? '/student/mistakes' : '/parent/mistakes'} label="Back to mistakes" />}
      <PageHeader
        eyebrow={eyebrow}
        title="Quran"
        description={
          surah
            ? `Opened at Surah ${surah}:${ayah}, for your homework or practice.`
            : 'Read your homework and revision at home, in the same Mushaf as class.'
        }
      />
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <PageNavigator page={current} onChange={setPage} idPrefix="reader" maxPage={maxPage} />
            {available.length > 1 && (
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink-2">
                Mushaf
                <Select
                  value={layout}
                  onChange={(e) => {
                    setLayout(e.target.value as MushafLayout);
                    setPage(1);
                  }}
                  aria-label="Mushaf layout"
                >
                  {available.map((l) => (
                    <option key={l.layout} value={l.layout}>
                      {layoutLabel(l.layout)}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <WordMeaningPicker value={wordLanguage} onChange={setWordLanguage} />
          </div>
          {pageOf.isLoading ? (
            <LoadingState label="Finding the page…" />
          ) : (
            <MushafViewer layout={layout} page={current} wordLanguage={wordLanguage} markers={markers ?? undefined} />
          )}
          {markers && (
            <p className="flex items-center gap-2 text-xs text-muted" role="note">
              <span className="inline-block h-0.5 w-6 bg-red" aria-hidden />
              Red underline: words your teacher marked to practise.
            </p>
          )}
        </CardBody>
      </Card>
    </>
  );
}

/**
 * `?marks=1`: the student's open Mushaf mistakes as word markers. The family names the child
 * with `?student=`; the student's own portal (`self`) uses their own record.
 */
function useMistakeMarkers(enabled: boolean, studentParam: string | null, self: boolean): WordPosition[] | null {
  const own = useQuery({
    queryKey: ['student', 'enrolments'],
    queryFn: () => enrolmentsApi.list(),
    enabled: enabled && self && !studentParam,
    staleTime: 60_000,
  });
  const studentId = studentParam ?? (self ? own.data?.[0]?.student.id : undefined) ?? null;
  const mistakes = useQuery({
    queryKey: ['parent', 'mistakes', studentId ?? '', { limit: 500 }],
    queryFn: () => lessonsReadApi.mistakes(studentId as string, { limit: 500 }),
    enabled: enabled && Boolean(studentId),
  });
  return useMemo(() => {
    if (!enabled || !studentId) return null;
    return splitOpenMistakes(mistakes.data ?? [])
      .mushaf.filter((m) => m.wordIndex !== null)
      .map((m) => ({ surah: m.surah, ayah: m.ayah, wordIndex: m.wordIndex as number }));
  }, [enabled, studentId, mistakes.data]);
}
