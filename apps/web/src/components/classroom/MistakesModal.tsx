'use client';

import React, { useState } from 'react';
import { BookOpen, Check, Crosshair, RotateCcw, Undo2 } from 'lucide-react';
import { ErrorState, Modal, formatDate } from '@/components/ui/primitives';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { useClassMistakes, useMarkMistake, useSetMistakeFixed, useStudentsMistakes } from '@/hooks/useClassroomMistakes';
import {
  MISTAKE_TYPE_LABELS,
  mistakeWhere,
  type ClassMistake,
  type MarkMistakeInput,
  type StudentMistake,
} from '@/lib/api/modules/lessons';
import { useDuaCollection, type DuaCategory } from '@/lib/api/modules/duas';
import { QAIDA_LESSONS } from '@/lib/data/lesson-boards';
import { isMushafMistake, isOpenMistake, mistakesPracticeApi, readerHref, type MistakeLike } from '@/lib/mistakes-practice';
import { findDua } from '@/components/practice/MistakesToPractise';
import { MakePracticeFromMistakes } from '@/components/practice/MakePracticeFromMistakes';
import type { WordPosition } from '@/components/mushaf/MushafViewer';
import { cn } from '@/lib/utils';
import type { ClassStudent } from './LogMistakeDialog';
import type { LessonPosition } from './LessonBoard';

export type EarlierMistake = StudentMistake & { resolvedAt?: string | null; studentId: string };
export type MistakesTab = 'class' | 'earlier';

/** Rows per page in each tab of the Mistakes window. */
export const MISTAKES_PAGE_SIZE = 8;
/** How often the earlier-classes list checks for mistakes fixed elsewhere (the family did not make the call). */
export const EARLIER_MISTAKES_REFETCH_MS = 15_000;

export interface GoToTarget {
  /** Madani page. */
  page: number;
  /** The word to highlight, when the mistake was on one. */
  position: WordPosition | null;
}

/** The fresh mark "Still wrong" logs: same place and kind, so the brief counts it as recurring. */
export function repeatMark(m: EarlierMistake): MarkMistakeInput {
  return isMushafMistake(m as MistakeLike)
    ? {
        studentId: m.studentId,
        surah: m.surah as number,
        ayah: m.ayah as number,
        ...(m.wordIndex !== null ? { wordIndex: m.wordIndex } : {}),
        type: m.type,
        ...(m.tajweedRule ? { tajweedRule: m.tajweedRule } : {}),
      }
    : {
        studentId: m.studentId,
        ...(m.itemRef ? { itemRef: m.itemRef } : {}),
        ...(m.note ? { note: m.note } : {}),
        type: m.type,
      };
}

/**
 * Open mistakes from earlier classes for these students, newest first: confirmed, not dismissed
 * or resolved, logged outside this class, and of this course's kind (a Mushaf course lists Mushaf
 * mistakes; the others their lesson-item mistakes). Refetched every few seconds so a mistake
 * fixed on the teacher's screen leaves the family's too.
 */
export function useEarlierOpenMistakes(classId: string, students: ClassStudent[], mushaf: boolean) {
  const queries = useStudentsMistakes(
    students.map((s) => s.studentId),
    students.length > 0,
    EARLIER_MISTAKES_REFETCH_MS,
  );
  const rows: EarlierMistake[] = students
    .flatMap((s, i) =>
      ((queries[i]?.data ?? []) as Array<StudentMistake & { resolvedAt?: string | null }>)
        .map((m) => ({ ...m, studentId: s.studentId }))
        .filter((m) => m.classId !== classId && isOpenMistake(m) && isMushafMistake(m as MistakeLike) === mushaf),
    )
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  return { rows, loading: queries.some((q) => q.isLoading), failed: queries.find((q) => q.isError) };
}

/** Open ones first, then fixed; newest first within each. */
export function sortClassMistakes(rows: ClassMistake[]): ClassMistake[] {
  const newest = (a: ClassMistake, b: ClassMistake) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
  return [...rows.filter((m) => !m.resolvedAt).sort(newest), ...rows.filter((m) => m.resolvedAt).sort(newest)];
}

/** The board lesson a Qaida or Duas mistake was logged on, from its item reference. */
export function boardPositionOf(
  itemRef: string | null | undefined,
  board: 'QAIDA' | 'DUAS',
  duas: DuaCategory[] | undefined,
): LessonPosition | null {
  if (!itemRef) return null;
  const title = itemRef.split(' · word ')[0].trim();
  if (board === 'DUAS') {
    if (!duas) return null;
    for (const [ci, c] of duas.entries()) {
      const di = c.duas.findIndex((d) => d.title === title);
      if (di >= 0) return { board, lesson: ci + 1, item: di };
    }
    const ci = duas.findIndex((c) => c.title === title);
    return ci >= 0 ? { board, lesson: ci + 1, item: null } : null;
  }
  for (const [li, l] of QAIDA_LESSONS.entries()) {
    if (title === l.title) return { board, lesson: li + 1, item: null };
    if (title.startsWith(`${l.title}: `)) {
      const ii = l.items.indexOf(title.slice(l.title.length + 2));
      return { board, lesson: li + 1, item: ii >= 0 ? ii : null };
    }
  }
  return null;
}

export const loggedAt = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

function FixedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-green-600/20 bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-green-700">
      <Check className="h-3 w-3" aria-hidden />
      Fixed
    </span>
  );
}

/** One compact mistake: a one-line title, a line for what and when, small actions on the right. */
function Row({
  title,
  badge,
  meta,
  actions,
  muted,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  meta: React.ReactNode;
  actions?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <li className={cn('flex items-center gap-3 px-3 py-2', muted && 'bg-cream/60')}>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium leading-5 text-ink">
          <span className="truncate tabular-nums">{title}</span>
          {badge}
        </p>
        <p className="truncate text-[11px] leading-4 text-muted">{meta}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </li>
  );
}

const ACTION =
  'inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-full border border-line bg-white text-[11px] font-semibold text-ink-2 transition-colors cursor-pointer hover:bg-sand hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50';

/** Small row action. With no children it is icon-only, its label shown as a tooltip. */
function Action({
  label,
  icon,
  children,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & { label: string; icon: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} className={cn(ACTION, children ? 'px-2.5' : 'w-7')} {...rest}>
      {icon}
      {children}
    </button>
  );
}

/** "Read" in a new tab, so the family never leaves the room. */
function ReadLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className={cn(ACTION, 'px-2.5')}>
      <BookOpen className="h-3.5 w-3.5" aria-hidden />
      Read
    </a>
  );
}

function paged<T>(rows: T[], page: number) {
  const pages = Math.max(1, Math.ceil(rows.length / MISTAKES_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  return { current, slice: rows.slice((current - 1) * MISTAKES_PAGE_SIZE, current * MISTAKES_PAGE_SIZE) };
}

/**
 * The classroom's Mistakes window: "This class" and "Earlier classes", each paginated. The
 * teacher marks fixed / undo / still wrong and jumps to a mistake; the student or guardian reads
 * the same lists, with a Read link that opens the passage in a new tab. Both lists come from the
 * room's shared queries, so live marks and refetches keep them current while it is open.
 */
export function MistakesModal({
  open,
  onClose,
  classId,
  viewer,
  students,
  mushaf,
  board,
  tab,
  onTabChange,
  readerBase = '/parent/quran',
  onGoTo,
  onGoToBoard,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
  viewer: 'teacher' | 'family';
  /** Teacher: the class's students. Family: the student signed in, or the guardian's children here. */
  students: ClassStudent[];
  mushaf: boolean;
  board: 'QAIDA' | 'DUAS' | null;
  tab: MistakesTab;
  onTabChange: (tab: MistakesTab) => void;
  readerBase?: '/parent/quran' | '/student/quran';
  onGoTo?: (target: GoToTarget) => void;
  onGoToBoard?: (position: LessonPosition) => void;
}) {
  const teacher = viewer === 'teacher';
  const classList = useClassMistakes(classId);
  const earlier = useEarlierOpenMistakes(classId, students, mushaf);
  const duas = useDuaCollection(open && board === 'DUAS');
  const setFixed = useSetMistakeFixed();
  const mark = useMarkMistake(classId);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [relogged, setRelogged] = useState<Set<string>>(() => new Set());
  const [pages, setPages] = useState<Record<MistakesTab, number>>({ class: 1, earlier: 1 });
  const nameOf = (id: string) => students.find((s) => s.studentId === id)?.displayName ?? 'Student';
  const many = students.length > 1;

  const classRows = sortClassMistakes(classList.data ?? []);
  const fixedCount = classRows.filter((m) => m.resolvedAt).length;

  const run = async (id: string, work: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await work();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };
  const toggleFixed = (m: { id: string; studentId: string }, where: string, reopen: boolean) =>
    run(m.id, async () => {
      await setFixed.mutateAsync({ mistakeId: m.id, studentId: m.studentId, reopen });
      toast.success(reopen ? `Open again: ${where}` : `Marked fixed: ${where}`);
    });
  const stillWrong = (m: EarlierMistake) =>
    run(m.id, async () => {
      await mark.mutateAsync(repeatMark(m));
      setRelogged((s) => new Set(s).add(m.id));
      toast.success(`Logged again: ${mistakeWhere(m)}`);
    });
  const goTo = (m: EarlierMistake) =>
    run(m.id, async () => {
      if (isMushafMistake(m as MistakeLike)) {
        if (!onGoTo) return;
        const { page } = await mistakesPracticeApi.pageOf(m.surah as number, m.ayah as number);
        onGoTo({
          page,
          position: m.wordIndex !== null ? { surah: m.surah as number, ayah: m.ayah as number, wordIndex: m.wordIndex } : null,
        });
      } else {
        const position = board ? boardPositionOf(m.itemRef, board, duas.data?.categories) : null;
        if (!position || !onGoToBoard) return toast.error('Could not find that lesson on the board');
        onGoToBoard(position);
      }
      onClose();
    });

  /** Family: where to read a mistake, in a new tab. */
  const readHref = (m: {
    surah: number | null;
    ayah: number | null;
    itemRef?: string | null;
    studentId: string;
  }): string | null => {
    if (teacher) return null;
    if (m.surah !== null && m.ayah !== null)
      return readerHref(readerBase, m.surah, m.ayah, readerBase === '/parent/quran' ? m.studentId : undefined);
    if (board !== 'DUAS' || !m.itemRef) return null;
    const found = findDua(m.itemRef, duas.data?.categories);
    const base = readerBase.replace(/\/quran$/, '/duas');
    return found ? `${base}?dua=${found.dua.id}${found.word !== null ? `&word=${found.word}` : ''}` : null;
  };
  const canGoTo = (m: EarlierMistake) => (isMushafMistake(m as MistakeLike) ? Boolean(onGoTo) : Boolean(onGoToBoard && board));

  const tabs: Array<{ value: MistakesTab; label: string; count: number }> = [
    { value: 'class', label: 'This class', count: classRows.length },
    { value: 'earlier', label: teacher ? 'Earlier classes' : 'Earlier classes — practise these', count: earlier.rows.length },
  ];
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = tab === 'class' ? 'earlier' : 'class';
    onTabChange(next);
    document.getElementById(`mistakes-tab-${next}`)?.focus();
  };

  const classPage = paged(classRows, pages.class);
  const earlierPage = paged(earlier.rows, pages.earlier);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mistakes"
      description={teacher ? 'This class and the open ones from earlier classes.' : 'Marked by your teacher. Practise the open ones before the next class.'}
      size="lg"
      fullScreenOnMobile
      bodyClassName="sm:min-h-[26rem]"
    >
      <div className="space-y-3">
        <div role="tablist" aria-label="Mistakes" className="flex gap-1 rounded-xl bg-sand p-1">
          {tabs.map((t) => {
            const selected = t.value === tab;
            return (
              <button
                key={t.value}
                id={`mistakes-tab-${t.value}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`mistakes-panel-${t.value}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onTabChange(t.value)}
                onKeyDown={onTabKey}
                className={cn(
                  'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                  selected ? 'bg-white text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
                )}
              >
                <span className="truncate">{t.label}</span>
                <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', selected ? 'bg-green-50 text-green-800' : 'bg-white/70')}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        <div id="mistakes-panel-class" role="tabpanel" aria-labelledby="mistakes-tab-class" hidden={tab !== 'class'} className="space-y-2">
          {classList.isLoading ? (
            <p role="status" className="px-1 py-2 text-xs text-muted">
              Loading mistakes…
            </p>
          ) : classList.isError ? (
            <ErrorState error={classList.error} onRetry={() => classList.refetch()} title="Could not load this class's mistakes" className="py-3" />
          ) : classRows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
              {teacher ? 'No mistakes logged yet. Tap a word to log one; they prefill the lesson card.' : 'No mistakes marked in this class yet.'}
            </p>
          ) : (
            <>
              <p className="px-1 text-[11px] text-muted">
                {classRows.length - fixedCount} open{fixedCount > 0 ? ` · ${fixedCount} fixed (listed last)` : ''}
                {teacher ? ' · these prefill the lesson card' : ' · they are on the lesson card too'}
              </p>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white" aria-label="Mistakes logged in this class">
                {classPage.slice.map((m) => {
                  const fixed = Boolean(m.resolvedAt);
                  const where = mistakeWhere(m);
                  const href = readHref(m);
                  return (
                    <Row
                      key={m.id}
                      muted={fixed}
                      title={MISTAKE_TYPE_LABELS[m.type] ?? m.type}
                      badge={fixed ? <FixedBadge /> : undefined}
                      meta={
                        <>
                          {where}
                          {m.tajweedRule ? ` · ${m.tajweedRule}` : ''}
                          {m.note && m.note !== where ? ` · ${m.note}` : ''}
                          {many ? ` · ${nameOf(m.studentId)}` : ''} · <time dateTime={m.occurredAt}>{loggedAt(m.occurredAt)}</time>
                        </>
                      }
                      actions={
                        teacher ? (
                          m.dismissedAt ? undefined : (
                            <Action
                              disabled={busy === m.id}
                              onClick={() => void toggleFixed(m, where, fixed)}
                              label={fixed ? `Undo fixed: ${where}` : `Fixed: ${where}`}
                              icon={fixed ? <Undo2 className="h-3 w-3" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
                            >
                              {fixed ? 'Undo' : 'Mark fixed'}
                            </Action>
                          )
                        ) : href ? (
                          <ReadLink href={href} label={`Read ${where}`} />
                        ) : undefined
                      }
                    />
                  );
                })}
              </ul>
              <Pagination
                page={classPage.current}
                limit={MISTAKES_PAGE_SIZE}
                total={classRows.length}
                onPageChange={(p) => setPages((s) => ({ ...s, class: p }))}
                itemName="mistakes"
              />
            </>
          )}
        </div>

        <div id="mistakes-panel-earlier" role="tabpanel" aria-labelledby="mistakes-tab-earlier" hidden={tab !== 'earlier'} className="space-y-2">
          {earlier.loading ? (
            <p role="status" className="px-1 py-2 text-xs text-muted">
              Loading earlier mistakes…
            </p>
          ) : earlier.failed ? (
            <ErrorState error={earlier.failed.error} onRetry={() => earlier.failed?.refetch()} title="Could not load earlier mistakes" className="py-3" />
          ) : earlier.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
              No open mistakes from earlier classes.
            </p>
          ) : (
            <>
              <p className="px-1 text-[11px] text-muted">
                {teacher ? 'Still open, newest first. Hear each again, then mark it fixed or still wrong.' : 'Still open, newest first. Your teacher marks each one fixed once it is read right.'}
              </p>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white" aria-label="Open mistakes from earlier classes">
                {earlierPage.slice.map((m) => {
                  const where = mistakeWhere(m);
                  const href = readHref(m);
                  return (
                    <Row
                      key={m.id}
                      title={where}
                      meta={
                        <>
                          {MISTAKE_TYPE_LABELS[m.type] ?? m.type}
                          {m.tajweedRule ? ` · ${m.tajweedRule}` : ''}
                          {many ? ` · ${nameOf(m.studentId)}` : ''} · {formatDate(m.occurredAt)}
                          {relogged.has(m.id) ? ' · logged again' : ''}
                        </>
                      }
                      actions={
                        teacher ? (
                          <>
                            {canGoTo(m) && (
                              <Action
                                label={`Go to ${where}`}
                                icon={<Crosshair className="h-3.5 w-3.5" aria-hidden />}
                                disabled={busy === m.id}
                                onClick={() => void goTo(m)}
                              />
                            )}
                            <Action
                              label={`Still wrong: ${where}`}
                              icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                              disabled={busy === m.id}
                              onClick={() => void stillWrong(m)}
                            />
                            <Action
                              label={`Fixed: ${where}`}
                              icon={<Check className="h-3.5 w-3.5" aria-hidden />}
                              disabled={busy === m.id}
                              onClick={() => void toggleFixed(m, where, false)}
                            >
                              Mark fixed
                            </Action>
                          </>
                        ) : href ? (
                          <ReadLink href={href} label={`Read ${where}`} />
                        ) : undefined
                      }
                    />
                  );
                })}
              </ul>
              <Pagination
                page={earlierPage.current}
                limit={MISTAKES_PAGE_SIZE}
                total={earlier.rows.length}
                onPageChange={(p) => setPages((s) => ({ ...s, earlier: p }))}
                itemName="mistakes"
              />
            </>
          )}
          {teacher && mushaf && students.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {students.map((s) => (
                <MakePracticeFromMistakes key={s.studentId} studentId={s.studentId} studentName={s.displayName} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
