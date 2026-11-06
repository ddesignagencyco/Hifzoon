'use client';

import { layoutLabel } from '@/lib/api/modules/mushaf';
import React, { useState } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import {
  Badge,
  DataTable,
  EmptyState,
  Field,
  Modal,
  QueryState,
  Select,
  TextInput,
  formatDate,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import {
  useLessonCard,
  useLessonCards,
  useResolveMistake,
  useStudentMistakes,
} from '@/hooks/useParentProgress';
import { useToast } from '@/components/ui/toast';
import {
  formatPortionRange,
  MISTAKE_TYPES,
  mistakeLabel,
  MistakeFilters,
  MistakeRecord,
  MistakeType,
  PORTION_LABELS,
} from '@/lib/api/modules/lessons-read';
import { mistakeWhere } from '@/lib/api/modules/lessons';
import { boardForCourse } from '@/lib/data/lesson-boards';
import { AskTeacherAboutCard } from '@/components/lessons/AskTeacherAboutCard';

/** Lesson cards tab: shared cards list, detail in a dialog. */
export function ChildLessonCards({
  studentId,
  initialCardId,
}: {
  studentId: string;
  initialCardId?: string | null;
}) {
  const cards = useLessonCards(studentId);
  const [openId, setOpenId] = useState<string | null>(initialCardId ?? null);

  return (
    <>
      <QueryState
        query={cards}
        empty={
          <EmptyState
            title="No lesson cards yet"
            description="After each class the teacher shares a lesson card with homework and notes."
          />
        }
      >
        {(rows) => (
          <ul className="space-y-2">
            {rows.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(c.id)}
                  className="w-full text-left rounded-xl border border-line px-4 py-3 hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold cursor-pointer flex items-start justify-between gap-3"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">
                      {formatDate(c.sharedAt ?? c.submittedAt)} · {c.teacher.name}
                    </span>
                    <span className="flex flex-wrap gap-1.5 mt-1">
                      {c.portions.map((p, i) => (
                        <Badge
                          key={i}
                          tone={
                            p.grade === 'EXCELLENT' || p.grade === 'GOOD'
                              ? 'green'
                              : p.grade
                                ? 'amber'
                                : 'neutral'
                          }
                        >
                          {p.label && p.kind === 'OTHER'
                            ? p.label
                            : `${humanize(p.kind)} ${formatPortionRange(p)}`}
                          {p.grade ? ` · ${humanize(p.grade)}` : ''}
                        </Badge>
                      ))}
                    </span>
                    {c.homework && (
                      <span className="block text-xs text-muted mt-1 line-clamp-2">
                        Homework: {c.homework}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted shrink-0 mt-1" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <LessonCardModal lessonCardId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

/** The full lesson card in a dialog; also used by the family-wide Lessons page. */
export function LessonCardModal({
  lessonCardId,
  onClose,
}: {
  lessonCardId: string | null;
  onClose: () => void;
}) {
  const card = useLessonCard(lessonCardId);
  return (
    <Modal open={lessonCardId !== null} onClose={onClose} title="Lesson card" size="lg">
      <QueryState query={card}>
        {(c) => (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-ink">
                {c.student.displayName} with {c.teacher.name}
              </p>
              <p className="text-xs text-muted">
                Class {formatDateTime(c.class.startsAt)} · shared {formatDateTime(c.sharedAt)}
                {c.locked && (
                  <span className="inline-flex items-center gap-1 ml-2">
                    <Lock className="w-3 h-3" aria-hidden /> Final
                  </span>
                )}
              </p>
              {!boardForCourse(c.class.course?.type) && (
                <p className="text-[11px] text-muted mt-0.5">
                  Mushaf: {layoutLabel(c.class.mushafLayout)}
                  {c.class.tajweedColours ? ' · tajweed colours' : ''}
                </p>
              )}
            </div>
            {/* Shown only once the teacher has approved it; the API withholds it before that. */}
            {c.summaryApprovedAt && c.aiSummaryDraft && (
              <section className="rounded-xl border border-green-700/15 bg-green-50/60 px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-green-800">
                  From the teacher
                </h3>
                <p className="mt-1 whitespace-pre-line text-sm text-ink">{c.aiSummaryDraft}</p>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold text-ink font-sans mb-2">What was covered</h3>
              {c.portions.length === 0 ? (
                <p className="text-sm text-muted">No portions recorded.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {c.portions.map((p) => (
                    <li
                      key={p.id}
                      className="py-2 flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="text-sm text-ink">
                        {p.label && p.kind === 'OTHER' ? (
                          p.label
                        ) : (
                          <>
                            {PORTION_LABELS[p.kind] ?? humanize(p.kind)}{' '}
                            <span className="text-muted">· {formatPortionRange(p)}</span>
                          </>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        {p.grade && (
                          <Badge
                            tone={p.grade === 'EXCELLENT' || p.grade === 'GOOD' ? 'green' : 'amber'}
                          >
                            {humanize(p.grade)}
                          </Badge>
                        )}
                        {/* Homework and revision are read at home in the same Mushaf as class. */}
                        {p.fromSurah && (
                          <a
                            href={`/parent/quran?surah=${p.fromSurah}&ayah=${p.fromAyah ?? 1}`}
                            className="text-xs font-semibold text-green-700 hover:underline"
                          >
                            Read
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {(c.homework || c.parentNote) && (
              <section className="grid sm:grid-cols-2 gap-3">
                {c.homework && (
                  <div className="rounded-xl bg-gold-100/60 border border-gold/30 px-3 py-2">
                    <h3 className="text-xs font-semibold text-gold-600 font-sans">Homework</h3>
                    <p className="text-sm text-ink mt-1 whitespace-pre-line">{c.homework}</p>
                  </div>
                )}
                {c.parentNote && (
                  <div className="rounded-xl bg-green-50 border border-green-600/20 px-3 py-2">
                    <h3 className="text-xs font-semibold text-green-700 font-sans">Note for you</h3>
                    <p className="text-sm text-ink mt-1 whitespace-pre-line">{c.parentNote}</p>
                  </div>
                )}
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold text-ink font-sans mb-2">
                Mistakes marked ({c.mistakes.length})
              </h3>
              {c.mistakes.length === 0 ? (
                <p className="text-sm text-muted">No mistakes were marked in this class.</p>
              ) : (
                <ul className="space-y-1">
                  {c.mistakes.map((m) => (
                    <li key={m.id} className="text-sm text-ink-2 flex flex-wrap gap-2">
                      <span className="tabular-nums font-semibold text-ink">{mistakeWhere(m)}</span>
                      <span className="text-muted">
                        {mistakeLabel(m.type)}
                        {m.tajweedRule ? ` (${m.tajweedRule})` : ''}
                      </span>
                      {m.resolvedAt && <Badge tone="green">Fixed</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <AskTeacherAboutCard lessonCardId={c.id} />
          </div>
        )}
      </QueryState>
    </Modal>
  );
}

/**
 * Mistakes tab: filterable mistake history. `canResolve` (the teacher's view) adds "Mark
 * fixed" for a mistake heard read correctly in a later class, and "Reopen" if it comes back.
 */
export function ChildMistakes({ studentId, canResolve = false }: { studentId: string; canResolve?: boolean }) {
  const resolve = useResolveMistake(studentId);
  const toast = useToast();
  const [type, setType] = useState<MistakeType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filters: MistakeFilters = {
    ...(type ? { type } : {}),
    ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
    ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
    limit: 100,
  };
  const mistakes = useStudentMistakes(studentId, filters);
  const rangeError = from && to && from > to ? '“From” must be before “To”.' : null;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Type" htmlFor="mistake-type">
          <Select
            id="mistake-type"
            value={type}
            onChange={(e) => setType(e.target.value as MistakeType | '')}
          >
            <option value="">All types</option>
            {MISTAKE_TYPES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="mistake-from">
          <TextInput
            id="mistake-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="To" htmlFor="mistake-to" error={rangeError}>
          <TextInput
            id="mistake-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      <QueryState
        query={mistakes}
        empty={
          <EmptyState title="No mistakes found" description="Nothing matches these filters." />
        }
      >
        {(rows) => (
          <DataTable<MistakeRecord>
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              { key: 'when', header: 'Date', render: (r) => formatDate(r.occurredAt) },
              {
                key: 'where',
                header: 'Where',
                render: (r) => <span className="tabular-nums">{mistakeWhere(r)}</span>,
              },
              {
                key: 'type',
                header: 'Type',
                render: (r) => (
                  <>
                    {mistakeLabel(r.type)}
                    {r.tajweedRule && (
                      <span className="block text-[11px] text-muted">{r.tajweedRule}</span>
                    )}
                  </>
                ),
              },
              {
                key: 'source',
                header: 'Source',
                render: (r) => (r.source === 'AI' ? 'Practice' : 'Class'),
              },
              {
                key: 'state',
                header: 'Status',
                render: (r) =>
                  r.dismissedAt ? (
                    // Dismissed means the teacher judged it was not a mistake, not that it was fixed.
                    <Badge tone="neutral">Not a mistake</Badge>
                  ) : r.resolvedAt ? (
                    <Badge tone="green">Resolved {formatDate(r.resolvedAt)}</Badge>
                  ) : !r.confirmed ? (
                    <Badge>Unconfirmed</Badge>
                  ) : (
                    <Badge tone="amber">Working on it</Badge>
                  ),
              },
              ...(canResolve
                ? [
                    {
                      key: 'action',
                      header: '',
                      render: (r: MistakeRecord) =>
                        r.dismissedAt || !r.confirmed ? null : (
                          <button
                            type="button"
                            disabled={resolve.isPending}
                            onClick={() =>
                              resolve.mutate(
                                { mistakeId: r.id, reopen: Boolean(r.resolvedAt) },
                                {
                                  onSuccess: () =>
                                    toast.success(r.resolvedAt ? 'Reopened — back on the list to work on' : 'Marked fixed'),
                                  onError: (e: unknown) => toast.error(e),
                                },
                              )
                            }
                            className="text-xs font-semibold text-green-700 hover:underline disabled:opacity-50"
                          >
                            {r.resolvedAt ? 'Reopen' : 'Mark fixed'}
                          </button>
                        ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </QueryState>
    </div>
  );
}
