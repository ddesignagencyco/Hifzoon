'use client';

import React, { useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  UiButton,
  formatDate,
  formatDateTime,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useHifzPage, useHifzPages, useInitializeHifz } from '@/hooks/useHifz';
import {
  JUZ_START_PAGES,
  MUSHAF_PAGE_COUNT,
  PAGE_STATES,
  PageState,
  PageStateRow,
  countByState,
  duePages,
  juzOfPage,
  juzRange,
} from '@/lib/api/modules/hifz';
import { cn } from '@/lib/utils';

/**
 * Family-friendly names for the API's page states. "Fragile" reads as "broken" to a parent;
 * Hifz teachers say a page is firm ("pakka") or needs revision ("kacha").
 */
const STATE_META: Record<PageState, { label: string; cell: string; swatch: string; bar: string; tone: 'neutral' | 'gold' | 'amber' | 'green' }> = {
  NOT_STARTED: { label: 'Not started', cell: 'bg-sand border-line', swatch: 'bg-sand border-line', bar: 'bg-line', tone: 'neutral' },
  IN_PROGRESS: { label: 'Memorising', cell: 'bg-gold-100 border-gold', swatch: 'bg-gold-100 border-gold', bar: 'bg-gold', tone: 'gold' },
  FRAGILE: { label: 'Needs revision', cell: 'bg-amber border-amber', swatch: 'bg-amber border-amber', bar: 'bg-amber', tone: 'amber' },
  SOLID: { label: 'Memorised', cell: 'bg-green-600 border-green-700', swatch: 'bg-green-600 border-green-700', bar: 'bg-green-600', tone: 'green' },
};

/** Traditional juz names (the opening words of each juz), transliterated. */
const JUZ_NAMES = [
  'Alif Lam Mim', 'Sayaqul', 'Tilka r-Rusul', 'Lan Tanalu', 'Wal-Muhsanat', 'La Yuhibbullah', 'Wa Idha Sami’u',
  'Wa Law Annana', 'Qal al-Mala’', 'Wa’lamu', 'Ya’tadhirun', 'Wa Ma Min Dabbah', 'Wa Ma Ubarri’u', 'Rubama',
  'Subhan alladhi', 'Qal Alam', 'Iqtaraba', 'Qad Aflaha', 'Wa Qal alladhina', 'Amman Khalaq', 'Utlu Ma Uhiya',
  'Wa Man Yaqnut', 'Wa Mali', 'Fa Man Azlam', 'Ilayhi Yuraddu', 'Ha Mim', 'Qala Fa Ma Khatbukum', 'Qad Sami’a',
  'Tabarak alladhi', '‘Amma',
];

/** The same names in Arabic — the opening words of each juz, as they appear in the Mushaf. */
const JUZ_NAMES_AR = [
  'الٓمٓ', 'سَيَقُولُ', 'تِلْكَ ٱلرُّسُلُ', 'لَن تَنَالُوا', 'وَٱلْمُحْصَنَاتُ', 'لَا يُحِبُّ ٱللَّهُ', 'وَإِذَا سَمِعُوا',
  'وَلَوْ أَنَّنَا', 'قَالَ ٱلْمَلَأُ', 'وَٱعْلَمُوا', 'يَعْتَذِرُونَ', 'وَمَا مِن دَابَّةٍ', 'وَمَا أُبَرِّئُ', 'رُبَمَا',
  'سُبْحَانَ ٱلَّذِي', 'قَالَ أَلَمْ', 'ٱقْتَرَبَ', 'قَدْ أَفْلَحَ', 'وَقَالَ ٱلَّذِينَ', 'أَمَّنْ خَلَقَ', 'ٱتْلُ مَا أُوحِيَ',
  'وَمَن يَقْنُتْ', 'وَمَا لِيَ', 'فَمَنْ أَظْلَمُ', 'إِلَيْهِ يُرَدُّ', 'حمٓ', 'قَالَ فَمَا خَطْبُكُمْ', 'قَدْ سَمِعَ ٱللَّهُ',
  'تَبَارَكَ ٱلَّذِي', 'عَمَّ',
];

/** Order of the segments in a juz progress bar. */
const BAR_ORDER: PageState[] = ['SOLID', 'FRAGILE', 'IN_PROGRESS'];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Hifz heat map (FR-HFZ-01 / FR-HFZ-05): the student's 604 Mushaf pages grouped by juz,
 * coloured by memorisation state, with pages due for revision ringed.
 *
 * `canInitialize` — teachers and staff may create the 604 rows (`POST …/initialize`);
 * families and students only read.
 */
export function HifzPageMap({
  studentId,
  canInitialize = false,
  stacked = false,
}: {
  studentId: string;
  canInitialize?: boolean;
  /** One juz card per row (full width) instead of a 2–3 column grid. */
  stacked?: boolean;
}) {
  const pages = useHifzPages(studentId);
  const [focus, setFocus] = useState<PageState | null>(null);
  const [openPage, setOpenPage] = useState<number | null>(null);
  // Captured once per mount so render stays pure.
  const [today] = useState(todayIso);

  return (
    <Card>
      <CardHeader
        title="Hifz tracker"
        description="All 604 pages of the Madani Mushaf, by juz. Tap a page for its revision details."
      />
      <CardBody>
        {pages.isLoading ? (
          <LoadingState label="Loading pages…" />
        ) : pages.isError ? (
          <ErrorState error={pages.error} onRetry={() => pages.refetch()} />
        ) : !pages.data || pages.data.length === 0 ? (
          <NotSetUp studentId={studentId} canInitialize={canInitialize} />
        ) : (
          <PageGrid rows={pages.data} today={today} focus={focus} onFocus={setFocus} onOpen={setOpenPage} studentId={studentId} canInitialize={canInitialize} stacked={stacked} />
        )}
      </CardBody>
      {openPage !== null && <PageDetail studentId={studentId} page={openPage} today={today} onClose={() => setOpenPage(null)} />}
    </Card>
  );
}

function NotSetUp({ studentId, canInitialize }: { studentId: string; canInitialize: boolean }) {
  const init = useInitializeHifz(studentId);
  const toast = useToast();
  return (
    <EmptyState
      icon={<BookOpen className="w-5 h-5" aria-hidden />}
      title="Hifz tracker not set up yet"
      description={
        canInitialize
          ? 'Set it up once to create a record for each of the 604 pages. Nothing is shared until progress is recorded.'
          : 'The teacher sets this up when Hifz lessons begin.'
      }
      action={
        canInitialize ? (
          <UiButton
            size="sm"
            loading={init.isPending}
            onClick={() =>
              init.mutate(undefined, {
                onSuccess: (r) => toast.success(r.created > 0 ? `Hifz tracker ready — ${r.total} pages` : 'Hifz tracker was already set up'),
                onError: (e) => toast.error(e),
              })
            }
          >
            Set up Hifz tracker
          </UiButton>
        ) : undefined
      }
    />
  );
}

function PageGrid({
  rows,
  today,
  focus,
  onFocus,
  onOpen,
  studentId,
  canInitialize,
  stacked,
}: {
  rows: PageStateRow[];
  today: string;
  focus: PageState | null;
  onFocus: (s: PageState | null) => void;
  onOpen: (page: number) => void;
  studentId: string;
  canInitialize: boolean;
  stacked: boolean;
}) {
  const byPage = useMemo(() => new Map(rows.map((r) => [r.pageNumber, r])), [rows]);
  const counts = useMemo(() => countByState(rows), [rows]);
  const due = useMemo(() => new Set(duePages(rows, today).map((r) => r.pageNumber)), [rows, today]);
  const untouched = counts.NOT_STARTED === rows.length;
  const missing = MUSHAF_PAGE_COUNT - rows.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {PAGE_STATES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onFocus(focus === s ? null : s)}
            aria-pressed={focus === s}
            className={cn(
              'rounded-xl border px-3 py-2 text-left transition-colors',
              focus === s ? 'border-gold bg-gold-100/60' : 'border-line bg-white hover:bg-cream',
            )}
          >
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className={cn('inline-block w-2.5 h-2.5 rounded-sm border', STATE_META[s].swatch)} aria-hidden />
              {STATE_META[s].label}
            </span>
            <span className="block text-lg font-semibold text-ink tabular-nums">{counts[s]}</span>
          </button>
        ))}
        <div className="rounded-xl border border-line bg-white px-3 py-2">
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="inline-block w-2.5 h-2.5 rounded-sm border border-line ring-2 ring-red" aria-hidden />
            Due for revision
          </span>
          <span className="block text-lg font-semibold text-ink tabular-nums">{due.size}</span>
        </div>
      </div>

      {untouched && (
        <Alert tone="neutral" title="Every page is still “Not started”">
          Pages change state automatically once lesson results feed the Hifz rules engine, which the academy is still
          building. The map will fill in from then on.
        </Alert>
      )}
      {missing > 0 && (
        <Alert tone="warning" title={`${missing} page${missing === 1 ? '' : 's'} missing from this tracker`}>
          {canInitialize ? <RepairButton studentId={studentId} /> : 'The teacher can repair this from their view.'}
        </Alert>
      )}

      <JuzCards byPage={byPage} due={due} focus={focus} onOpen={onOpen} stacked={stacked} />
    </div>
  );
}

function RepairButton({ studentId }: { studentId: string }) {
  const init = useInitializeHifz(studentId);
  const toast = useToast();
  return (
    <UiButton
      size="sm"
      variant="secondary"
      loading={init.isPending}
      onClick={() => init.mutate(undefined, { onSuccess: (r) => toast.success(`Added ${r.created} missing pages`), onError: (e) => toast.error(e) })}
    >
      Add missing pages
    </UiButton>
  );
}

function PageDetail({ studentId, page, today, onClose }: { studentId: string; page: number; today: string; onClose: () => void }) {
  const detail = useHifzPage(studentId, page);
  const row = detail.data;
  const isDue = Boolean(row?.nextDueAt && row.nextDueAt.slice(0, 10) <= today);
  return (
    <Modal open onClose={onClose} size="sm" title={`Page ${page}`} description={`Juz ${juzOfPage(page)}`}>
      {detail.isLoading ? (
        <LoadingState />
      ) : detail.isError || !row ? (
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      ) : (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2 flex items-center gap-2">
            <Badge tone={STATE_META[row.state].tone}>{STATE_META[row.state].label}</Badge>
            {isDue && <Badge tone="red">Due for revision</Badge>}
          </div>
          <div>
            <dt className="text-[11px] text-muted">Recent mistakes</dt>
            <dd className="text-ink tabular-nums">{row.mistakeCountRecent}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted">Revision interval</dt>
            <dd className="text-ink">{row.intervalDays > 0 ? `${row.intervalDays} day${row.intervalDays === 1 ? '' : 's'}` : '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted">Last revised</dt>
            <dd className="text-ink">{row.lastRevisedAt ? formatDateTime(row.lastRevisedAt) : 'Not yet'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted">Next revision</dt>
            {/* A date column: format in UTC so it never shifts a day. */}
            <dd className="text-ink">{row.nextDueAt ? formatDate(row.nextDueAt, { timeZone: 'UTC' }) : 'Not scheduled'}</dd>
          </div>
        </dl>
      )}
    </Modal>
  );
}

/**
 * The Mushaf as 30 juz cards: name, a segmented progress bar, "n of m memorised" and the
 * page tiles. "In progress" (the default once anything has started) hides untouched juz.
 */
function JuzCards({
  byPage,
  due,
  focus,
  onOpen,
  stacked,
}: {
  byPage: Map<number, PageStateRow>;
  due: Set<number>;
  focus: PageState | null;
  onOpen: (page: number) => void;
  stacked: boolean;
}) {
  const juzList = JUZ_START_PAGES.map((_, i) => {
    const juz = i + 1;
    const [first, last] = juzRange(juz);
    const pages = Array.from({ length: last - first + 1 }, (_, k) => first + k);
    const counts: Record<PageState, number> = { NOT_STARTED: 0, IN_PROGRESS: 0, FRAGILE: 0, SOLID: 0 };
    for (const p of pages) counts[byPage.get(p)?.state ?? 'NOT_STARTED']++;
    const dueCount = pages.filter((p) => due.has(p)).length;
    return { juz, first, last, pages, counts, dueCount, started: counts.NOT_STARTED < pages.length };
  });
  const anyStarted = juzList.some((j) => j.started);
  const [showAll, setShowAll] = useState(!anyStarted);
  // Hifz usually begins with Juz 30, so progress is listed from the end.
  const shown = showAll ? juzList : juzList.filter((j) => j.started).reverse();

  return (
    <section aria-label="Pages by juz" className="space-y-3">
      {anyStarted && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which juz to show">
          {([['In progress', false], ['All 30 juz', true]] as const).map(([label, all]) => (
            <button
              key={label}
              type="button"
              aria-pressed={showAll === all}
              onClick={() => setShowAll(all)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                showAll === all ? 'border-green-800 bg-green-800 text-white' : 'border-line bg-white text-ink-2 hover:bg-cream',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <ol className={cn('grid gap-3', !stacked && 'sm:grid-cols-2 xl:grid-cols-3')}>
        {shown.map((j) => {
          const total = j.pages.length;
          const complete = j.counts.SOLID === total;
          return (
            <li
              key={j.juz}
              className={cn(
                'rounded-2xl border bg-white p-3.5 shadow-sm',
                complete ? 'border-gold ring-1 ring-gold/40' : 'border-line',
                !j.started && 'opacity-80',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 pt-0.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-600">Juz {j.juz}</p>
                  <p className="truncate text-[11px] text-muted">{JUZ_NAMES[j.juz - 1]}</p>
                  <p className="text-[11px] text-muted tabular-nums">
                    Pages {j.first}–{j.last}
                  </p>
                </div>
                <h3
                  lang="ar"
                  dir="rtl"
                  className="shrink-0 text-right text-[1.65rem] leading-[1.9] text-green-900"
                  style={{ fontFamily: "var(--font-quran), 'Amiri Quran', 'Amiri', serif" }}
                >
                  {JUZ_NAMES_AR[j.juz - 1]}
                </h3>
              </div>

              <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                {BAR_ORDER.filter((st) => j.counts[st] > 0).map((st) => (
                  <span key={st} className={STATE_META[st].bar} style={{ width: `${(j.counts[st] / total) * 100}%` }} />
                ))}
              </div>
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-2">
                <span>
                  <span className="font-semibold text-ink tabular-nums">
                    {j.counts.SOLID}/{total}
                  </span>{' '}
                  memorised
                </span>
                {j.counts.FRAGILE > 0 && <span>{j.counts.FRAGILE} need revision</span>}
                {j.counts.IN_PROGRESS > 0 && <span>{j.counts.IN_PROGRESS} memorising</span>}
                {j.dueCount > 0 && <span className="font-semibold text-red">{j.dueCount} due</span>}
                {complete && <span className="font-semibold text-gold-600">Juz complete</span>}

              </p>

              <div className="mt-2.5 flex flex-wrap gap-1">
                {j.pages.map((p) => {
                  const row = byPage.get(p);
                  const state = row?.state ?? 'NOT_STARTED';
                  const dimmed = focus !== null && state !== focus;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onOpen(p)}
                      disabled={!row}
                      aria-label={`Page ${p}: ${row ? STATE_META[state].label : 'no record'}${due.has(p) ? ', due for revision' : ''}`}
                      title={`Page ${p} · ${row ? STATE_META[state].label : 'no record'}${due.has(p) ? ' · due' : ''}`}
                      className={cn(
                        'h-4 w-4 rounded border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold hover:scale-110',
                        row ? STATE_META[state].cell : 'border-dashed border-line bg-white',
                        due.has(p) && 'ring-2 ring-red ring-offset-1',
                        dimmed && 'opacity-20',
                      )}
                    />
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
