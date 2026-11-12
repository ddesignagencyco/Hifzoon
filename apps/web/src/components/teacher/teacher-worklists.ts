'use client';

import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { LESSON_CARD_LOCK_HOURS, OutstandingLessonCard } from '@/lib/api/modules/lessons';
import {
  teacherScheduleApi,
  TimetableClass,
  TrialAwaitingResult,
} from '@/lib/api/modules/teacher-schedule';
import { teacherKeys } from '@/hooks/useTeacher';
import { addDays, plainDateInZone, zonedTimeToUtc } from './zoned-time';

/**
 * Pure helpers and one hook behind the teacher's work lists: the Lesson cards and Trial
 * results pages and the "Needs your attention" block on Today.
 */

const DAY_MS = 86_400_000;
/** The timetable is read in windows of this many days (the API caps a reply at 500 rows). */
const WINDOW_DAYS = 30;
/** How far back "All" reaches: the timetable has no paging, so it is read window by window. */
export const ALL_HISTORY_DAYS = 390;

export type DateRangeFilter = 'ALL' | '7' | '30';

export const DATE_RANGE_OPTIONS: Array<{ value: DateRangeFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

/** Days of history a date filter needs loaded. */
export function daysFor(range: DateRangeFilter): number {
  return range === 'ALL' ? ALL_HISTORY_DAYS : Number(range);
}

/** True when `startsAt` falls inside the chosen date filter, counted back from `now`. */
export function inDateRange(startsAt: string, range: DateRangeFilter, now: number): boolean {
  if (range === 'ALL') return true;
  return new Date(startsAt).getTime() >= now - Number(range) * DAY_MS;
}

/** Back-to-back `[from, to]` windows ending at `end`, newest first, covering `days`. */
export function pastWindows(end: number, days: number): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  for (let back = 0; back < days; back += WINDOW_DAYS) {
    out.push({
      from: new Date(end - (back + WINDOW_DAYS) * DAY_MS).toISOString(),
      to: new Date(end - back * DAY_MS).toISOString(),
    });
  }
  return out;
}

/**
 * The teacher's classes over the last `days` days, read in 30-day windows so a long range
 * never hits the timetable's row cap. Windows are anchored on tomorrow's midnight, so the
 * 7- and 30-day filters share one cached request.
 */
export function usePastTeacherClasses(teacherId: string, zone: string, days: number) {
  const [end] = useState(() => zonedTimeToUtc(addDays(plainDateInZone(new Date(), zone), 1), '00:00', zone).getTime());
  const windows = useMemo(() => pastWindows(end, days), [end, days]);
  return useQueries({
    queries: windows.map((w) => ({
      queryKey: teacherKeys.timetable(teacherId, w.from, w.to, zone),
      queryFn: () => teacherScheduleApi.timetable(teacherId, { from: w.from, to: w.to, tz: zone }),
      staleTime: 30_000,
    })),
    combine: (results) => {
      let data: TimetableClass[] | undefined;
      if (results.every((r) => r.data)) {
        const byId = new Map<string, TimetableClass>();
        for (const r of results) for (const c of r.data ?? []) byId.set(c.id, c);
        data = [...byId.values()];
      }
      return {
        data,
        isLoading: results.some((r) => r.isLoading),
        isError: results.some((r) => r.isError),
        error: results.find((r) => r.error)?.error ?? null,
        refetch: () => Promise.all(results.map((r) => r.refetch())),
      };
    },
  });
}

// ── Lesson cards ──────────────────────────────────────────────────────────────

export type LessonCardStatus = 'due' | 'written' | 'locked';

export interface LessonCardRow {
  key: string;
  classId: string;
  startsAt: string;
  students: Array<{ id: string; displayName: string }>;
  courseName: string;
  status: LessonCardStatus;
  /** A card was started (or written for some of a circle) but not finished. */
  draft: boolean;
}

const HELD = new Set(['SCHEDULED', 'LIVE', 'COMPLETED']);
const LOCK_MS = LESSON_CARD_LOCK_HOURS * 3_600_000;

/**
 * One row per lesson card: every card the API says is still owed (one per student, as a
 * circle class owes one per child), then each other class that has ended — written, or
 * locked once 48 hours have passed. The timetable does not carry the submission time, so
 * "locked" counts from the end of the class; the card itself shows the exact lock.
 * A completed class older than the API's seven-day "owed" window with no card is still due.
 */
export function buildLessonCardRows(
  classes: readonly TimetableClass[],
  outstanding: readonly OutstandingLessonCard[],
  now: number,
): LessonCardRow[] {
  const rows: LessonCardRow[] = outstanding.map((o) => ({
    key: `${o.classId}:${o.student.id}`,
    classId: o.classId,
    startsAt: o.startsAt,
    students: [o.student],
    courseName: o.course?.name ?? 'Course not set',
    status: 'due',
    draft: false,
  }));
  const owed = new Set(outstanding.map((o) => o.classId));
  const outstandingSince = now - 7 * DAY_MS;
  for (const c of classes) {
    if (owed.has(c.id) || !HELD.has(c.status)) continue;
    const ends = new Date(c.endsAt).getTime();
    if (ends > now || c.students.length === 0) continue;
    const students = c.students.map((s) => s.student);
    const courseName = c.course?.name ?? 'Course not set';
    const card = c.lessonCard;
    if (card && card.state !== 'DRAFT') {
      rows.push({
        key: c.id,
        classId: c.id,
        startsAt: c.startsAt,
        students,
        courseName,
        status: now >= ends + LOCK_MS ? 'locked' : 'written',
        draft: false,
      });
    } else if (c.status === 'COMPLETED' && ends < outstandingSince) {
      rows.push({ key: c.id, classId: c.id, startsAt: c.startsAt, students, courseName, status: 'due', draft: Boolean(card) });
    }
  }
  return rows.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
}

export const LESSON_CARD_STATUS_LABEL: Record<LessonCardStatus, string> = {
  due: 'Card due',
  written: 'Written',
  locked: 'Locked',
};

// ── Trial results ─────────────────────────────────────────────────────────────

export type TrialStatus = 'due' | 'recorded' | 'absent';

export interface TrialRow {
  key: string;
  cls: TrialAwaitingResult;
  status: TrialStatus;
}

const CANCELLED = new Set(['CANCELLED_FAMILY', 'CANCELLED_TEACHER']);

/** A trial waiting for a result, unless it was marked "Teacher absent" (no result to record). */
export function isTrialResultDue(row: Pick<TrialAwaitingResult, 'status'>): boolean {
  return row.status !== 'NO_SHOW_TEACHER';
}

/**
 * Trials the teacher has taught: those still waiting for a result (from the API, whatever
 * their age) and the ended, uncancelled trials in the timetable that are no longer waiting —
 * their result is recorded.
 */
export function buildTrialRows(
  classes: readonly TimetableClass[],
  awaiting: readonly TrialAwaitingResult[],
  now: number,
): TrialRow[] {
  const rows: TrialRow[] = awaiting.map((t) => ({ key: t.id, cls: t, status: isTrialResultDue(t) ? 'due' : 'absent' }));
  const waiting = new Set(awaiting.map((t) => t.id));
  for (const c of classes) {
    if (c.type !== 'TRIAL' || waiting.has(c.id) || CANCELLED.has(c.status)) continue;
    if (new Date(c.endsAt).getTime() > now) continue;
    rows.push({ key: c.id, cls: c, status: 'recorded' });
  }
  return rows.sort((a, b) => new Date(b.cls.startsAt).getTime() - new Date(a.cls.startsAt).getTime());
}

export const TRIAL_STATUS_LABEL: Record<TrialStatus, string> = {
  due: 'Result due',
  recorded: 'Recorded',
  absent: 'Teacher absent',
};

/** Student names of a row, for display and search. */
export function rowStudentNames(students: ReadonlyArray<{ displayName: string }>): string {
  return students.map((s) => s.displayName).join(', ') || 'No students attached';
}
