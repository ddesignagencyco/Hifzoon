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

const STATE_META: Record<PageState, { label: string; cell: string; swatch: string; tone: 'neutral' | 'gold' | 'amber' | 'green' }> = {
  NOT_STARTED: { label: 'Not started', cell: 'bg-sand border-line', swatch: 'bg-sand border-line', tone: 'neutral' },
  IN_PROGRESS: { label: 'Learning', cell: 'bg-gold-100 border-gold', swatch: 'bg-gold-100 border-gold', tone: 'gold' },
  FRAGILE: { label: 'Fragile', cell: 'bg-amber/30 border-amber', swatch: 'bg-amber/30 border-amber', tone: 'amber' },
  SOLID: { label: 'Solid', cell: 'bg-green-600 border-green-700', swatch: 'bg-green-600 border-green-700', tone: 'green' },
};

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
export function HifzPageMap({ studentId, canInitialize = false }: { studentId: string; canInitialize?: boolean }) {
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
          <PageGrid rows={pages.data} today={today} focus={focus} onFocus={setFocus} onOpen={setOpenPage} studentId={studentId} canInitialize={canInitialize} />
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
}: {
  rows: PageStateRow[];
  today: string;
  focus: PageState | null;
  onFocus: (s: PageState | null) => void;
  onOpen: (page: number) => void;
  studentId: string;
  canInitialize: boolean;
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

      <ol className="space-y-1.5" aria-label="Pages by juz">
        {JUZ_START_PAGES.map((_, i) => {
          const juz = i + 1;
          const [first, last] = juzRange(juz);
          const pagesInJuz = Array.from({ length: last - first + 1 }, (_, k) => first + k);
          const solid = pagesInJuz.filter((p) => byPage.get(p)?.state === 'SOLID').length;
          return (
            <li key={juz} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] font-medium text-muted tabular-nums" title={`Pages ${first}–${last}`}>
                Juz {juz}
              </span>
              <div className="flex flex-wrap gap-[3px]">
                {pagesInJuz.map((p) => {
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
                        'w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-[3px] border transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                        row ? STATE_META[state].cell : 'bg-white border-dashed border-line',
                        due.has(p) && 'ring-2 ring-red ring-offset-1',
                        dimmed && 'opacity-20',
                      )}
                    />
                  );
                })}
              </div>
              <span className="ml-auto hidden sm:block text-[11px] text-muted tabular-nums">
                {solid}/{pagesInJuz.length}
              </span>
            </li>
          );
        })}
      </ol>
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
