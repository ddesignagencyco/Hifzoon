'use client';

import { ApiClientError } from '@/lib/api/http';
import React from 'react';
import { Check, X } from 'lucide-react';
import { Badge, ErrorState, LoadingState, UiButton, formatDateTime } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  useClassMistakes,
  useConfirmMistake,
  useDismissMistake,
  useStudentsMistakes,
} from '@/hooks/useClassroomMistakes';
import { MISTAKE_TYPE_LABELS, StudentMistake } from '@/lib/api/modules/lessons';
import type { ClassStudent } from './MistakeLogger';
import { LightSheet } from './MeetingChrome';

/**
 * Mistakes logged in this class, newest first (FR-REC-01/04), as tags on the dark
 * classroom side panel.
 */
export function MistakeList({ classId, students }: { classId: string; students: ClassStudent[] }) {
  const list = useClassMistakes(classId);
  const nameOf = (id: string) => students.find((s) => s.studentId === id)?.displayName ?? 'Student';

  if (list.isLoading) {
    return (
      <p role="status" className="text-xs text-white/70">
        Loading mistakes…
      </p>
    );
  }
  if (list.isError) {
    return (
      <LightSheet>
        <ErrorState error={list.error} onRetry={() => list.refetch()} title="Could not load this class's mistakes" className="py-3" />
      </LightSheet>
    );
  }
  const rows = list.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-white/65">
        No mistakes logged yet. Mistakes you log appear here and prefill the lesson card.
      </p>
    );
  }
  return (
    <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1" aria-label="Mistakes logged in this class">
      {rows
        .slice()
        .reverse()
        .map((m) => (
          <li
            key={m.id}
            className="flex items-start gap-2 rounded-lg border border-[#e08a72]/30 bg-[#b4482d]/20 px-2.5 py-2 text-white"
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#e08a72]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{MISTAKE_TYPE_LABELS[m.type] ?? m.type}</p>
              <p className="text-[11px] text-white/70">
                {nameOf(m.studentId)} · {m.surah}:{m.ayah} word {m.wordIndex}
                {m.tajweedRule ? ` · ${m.tajweedRule}` : ''}
              </p>
            </div>
            <time className="shrink-0 text-[11px] text-white/60" dateTime={m.occurredAt}>
              {new Date(m.occurredAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </time>
          </li>
        ))}
    </ul>
  );
}

function reviewStatus(m: StudentMistake): { label: string; tone: 'green' | 'red' | 'gold' } {
  if (m.dismissedAt) return { label: 'Dismissed', tone: 'red' };
  if (m.confirmed) return { label: 'Confirmed', tone: 'green' };
  return { label: 'Needs review', tone: 'gold' };
}

/**
 * AI-flagged mistakes for this class awaiting the teacher's decision (FR-AIC-07).
 * Read from each student's history because the class list omits `source`.
 */
export function AiFlagReview({ classId, students }: { classId: string; students: ClassStudent[] }) {
  const queries = useStudentsMistakes(students.map((s) => s.studentId));
  const confirm = useConfirmMistake(classId);
  const dismiss = useDismissMistake(classId);
  const toast = useToast();

  if (students.length === 0) return null;
  if (queries.some((q) => q.isLoading)) return <LoadingState label="Checking AI flags…" />;
  // A 403 for one student (e.g. a trial student with no enrolment — backendrequirement B21)
  // must not hide the others or fill the panel with an access-denied card.
  const isForbidden = (e: unknown) => e instanceof ApiClientError && e.status === 403;
  const failed = queries.find((q) => q.isError && !isForbidden(q.error));
  if (failed) return <ErrorState error={failed.error} onRetry={() => queries.forEach((q) => q.refetch())} />;
  const unavailable = students.filter((_, i) => isForbidden(queries[i]?.error));

  const flagged = queries
    .flatMap((q, i) => (q.data ?? []).map((m) => ({ ...m, student: students[i] })))
    .filter((m) => m.classId === classId && m.source === 'AI');

  const unavailableNote =
    unavailable.length > 0 ? (
      <p className="text-xs text-muted">
        AI flags aren&apos;t available for {unavailable.map((s) => s.displayName).join(', ')} yet — they are not enrolled with you
        (for example, a trial student).
      </p>
    ) : null;

  if (flagged.length === 0) {
    return unavailableNote ?? <p className="text-xs text-muted">No AI-flagged mistakes for this class.</p>;
  }

  const busyId = (confirm.isPending && confirm.variables) || (dismiss.isPending && dismiss.variables) || null;

  return (
    <ul className="divide-y divide-line" aria-label="AI-flagged mistakes">
      {flagged.map((m) => {
        const status = reviewStatus(m);
        return (
          <li key={m.id} className="py-2.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-ink font-medium">{MISTAKE_TYPE_LABELS[m.type] ?? m.type}</p>
                <p className="text-[11px] text-muted">
                  {m.student.displayName} · {m.surah}:{m.ayah} word {m.wordIndex} · {formatDateTime(m.occurredAt)}
                </p>
              </div>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <div className="flex gap-2">
              {(!m.confirmed || m.dismissedAt) && (
                <UiButton
                  size="sm"
                  variant="secondary"
                  icon={<Check className="w-3.5 h-3.5" aria-hidden />}
                  loading={busyId === m.id && confirm.isPending}
                  disabled={!!busyId}
                  onClick={() =>
                    confirm.mutate(m.id, {
                      onSuccess: () => toast.success('AI flag confirmed'),
                      onError: (e) => toast.error(e),
                    })
                  }
                >
                  Confirm
                </UiButton>
              )}
              {!m.dismissedAt && (
                <UiButton
                  size="sm"
                  variant="ghost"
                  icon={<X className="w-3.5 h-3.5" aria-hidden />}
                  loading={busyId === m.id && dismiss.isPending}
                  disabled={!!busyId}
                  onClick={() =>
                    dismiss.mutate(m.id, {
                      onSuccess: () => toast.success('AI flag dismissed'),
                      onError: (e) => toast.error(e),
                    })
                  }
                >
                  Dismiss
                </UiButton>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
