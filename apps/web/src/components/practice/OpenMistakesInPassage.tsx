'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, RotateCcw, Undo2 } from 'lucide-react';
import { Badge, ErrorState, UiButton, formatDate } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { mistakeKeys, useSetMistakeFixed } from '@/hooks/useClassroomMistakes';
import { lessonsApi, MISTAKE_TYPE_LABELS, mistakeWhere, type StudentMistake } from '@/lib/api/modules/lessons';
import { mistakesInPassage } from '@/lib/mistakes-practice';

export const FIXED_NOTE_COPY =
  "A mistake you mark fixed leaves the family's Mistakes to practise and shows as Resolved in their history.";

/**
 * Teacher, practice review: the student's open mistakes inside the recited passage (every open
 * one when the passage is not a surah range). "Fixed ✓" resolves one heard read correctly in
 * this recitation, with Undo; "Still wrong" leaves it open.
 */
export function OpenMistakesInPassage({
  studentId,
  range,
  excludeIds = [],
}: {
  studentId: string;
  range: { fromSurah?: number | null; fromAyah?: number | null; toSurah?: number | null; toAyah?: number | null } | null;
  /** Marks made on this very session: they are listed as "Already marked". */
  excludeIds?: string[];
}) {
  const mistakes = useQuery({
    queryKey: mistakeKeys.forStudent(studentId),
    queryFn: () => lessonsApi.studentMistakes(studentId, { limit: 200 }),
  });
  const setFixed = useSetMistakeFixed();
  const toast = useToast();
  // Acted on while this screen is open: kept in the list (Fixed, with Undo) once resolved.
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [stillWrong, setStillWrong] = useState<Set<string>>(() => new Set());
  const busyId = setFixed.isPending ? setFixed.variables?.mistakeId : undefined;

  const all = (mistakes.data ?? []) as StudentMistake[];
  const rows = mistakesInPassage(
    all
      .filter((m) => !excludeIds.includes(m.id))
      .map((m) => (touched.has(m.id) ? { ...m, resolvedAt: null } : m)),
    range,
  ).map((m) => all.find((x) => x.id === m.id) ?? m);

  const toggle = (m: StudentMistake, reopen: boolean) => {
    setTouched((s) => new Set(s).add(m.id));
    setFixed.mutate(
      { mistakeId: m.id, studentId, reopen },
      {
        onSuccess: () => {
          setStillWrong((s) => {
            const next = new Set(s);
            next.delete(m.id);
            return next;
          });
          toast.success(reopen ? `Open again: ${mistakeWhere(m)}` : `Marked fixed: ${mistakeWhere(m)}`);
        },
        onError: (e) => toast.error(e),
      },
    );
  };

  return (
    <section className="space-y-2" aria-labelledby="open-mistakes-in-passage">
      <div>
        <p id="open-mistakes-in-passage" className="text-xs font-semibold text-ink">
          Open mistakes in this passage
        </p>
        <p className="text-[11px] text-muted">{FIXED_NOTE_COPY}</p>
      </div>
      {mistakes.isLoading ? (
        <p role="status" className="text-[11px] text-muted">
          Loading open mistakes…
        </p>
      ) : mistakes.isError ? (
        <ErrorState error={mistakes.error} onRetry={() => mistakes.refetch()} title="Could not load open mistakes" className="py-3" />
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-muted">No open mistakes in this passage.</p>
      ) : (
        <ul className="space-y-1.5" aria-label="Open mistakes in this passage">
          {rows.map((m) => {
            const fixed = Boolean(m.resolvedAt);
            return (
              <li key={m.id} className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums">{mistakeWhere(m)}</span>
                  {fixed ? (
                    <Badge tone="green">Fixed</Badge>
                  ) : stillWrong.has(m.id) ? (
                    <Badge tone="amber">Still wrong</Badge>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted">
                  {MISTAKE_TYPE_LABELS[m.type] ?? m.type} · {formatDate(m.occurredAt)}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {fixed ? (
                    <UiButton
                      size="sm"
                      variant="ghost"
                      icon={<Undo2 className="h-3.5 w-3.5" aria-hidden />}
                      disabled={busyId === m.id}
                      onClick={() => toggle(m, true)}
                      aria-label={`Undo fixed: ${mistakeWhere(m)}`}
                    >
                      Undo
                    </UiButton>
                  ) : (
                    <>
                      <UiButton
                        size="sm"
                        variant="secondary"
                        icon={<Check className="h-3.5 w-3.5" aria-hidden />}
                        disabled={busyId === m.id}
                        onClick={() => toggle(m, false)}
                        aria-label={`Fixed: ${mistakeWhere(m)}`}
                      >
                        Mark fixed
                      </UiButton>
                      <UiButton
                        size="sm"
                        variant="ghost"
                        icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                        disabled={busyId === m.id || stillWrong.has(m.id)}
                        onClick={() => setStillWrong((s) => new Set(s).add(m.id))}
                        aria-label={`Still wrong: ${mistakeWhere(m)}`}
                      >
                        Still wrong
                      </UiButton>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
