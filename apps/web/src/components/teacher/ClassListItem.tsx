'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FileText, PenLine, Video } from 'lucide-react';
import { Badge, humanize } from '@/components/ui/primitives';
import { classOutcome, isPastClass } from '@/lib/api/modules/scheduling-family';
import { classStudentNames, TimetableClass } from '@/lib/api/modules/teacher-schedule';
import { cn } from '@/lib/utils';
import { formatInZone, timeInZone } from './zoned-time';

const LINK_BTN =
  'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2';

export function classroomHref(classId: string) {
  return `/teacher/classroom/${encodeURIComponent(classId)}`;
}

export function briefHref(classId: string) {
  return `/teacher/classes/${encodeURIComponent(classId)}/brief`;
}

/** A class can be entered while it is scheduled or live — and, given a clock, not yet over. */
export function canEnterClassroom(status: string, endsAt?: string, now?: number): boolean {
  const open = status === 'SCHEDULED' || status === 'LIVE';
  if (!open || endsAt === undefined || now === undefined) return open;
  return !isPastClass({ endsAt }, now);
}

export function LessonCardLink({ classId, className }: { classId: string; className?: string }) {
  return (
    <Link
      href={`/teacher/classroom/${encodeURIComponent(classId)}/lesson-card`}
      className={cn(LINK_BTN, 'bg-gold text-green-950 hover:bg-gold-600', className)}
    >
      <PenLine className="w-3.5 h-3.5" aria-hidden />
      Write lesson card
    </Link>
  );
}

export function ClassroomLink({ classId, live, className }: { classId: string; live?: boolean; className?: string }) {
  return (
    <Link
      href={classroomHref(classId)}
      className={cn(LINK_BTN, 'bg-green-800 text-white hover:bg-green-700', className)}
    >
      <Video className="w-3.5 h-3.5" aria-hidden />
      {live ? 'Rejoin class' : 'Start class'}
    </Link>
  );
}

export function BriefLink({ classId, className }: { classId: string; className?: string }) {
  return (
    <Link href={briefHref(classId)} className={cn(LINK_BTN, 'bg-white border border-line text-ink hover:bg-sand', className)}>
      <FileText className="w-3.5 h-3.5" aria-hidden />
      Brief
    </Link>
  );
}

/** One class row for the Today and timetable lists. */
export function ClassListItem({
  cls,
  zone,
  showDate,
  onDetails,
}: {
  cls: TimetableClass;
  zone: string;
  showDate?: boolean;
  onDetails?: (cls: TimetableClass) => void;
}) {
  const names = classStudentNames(cls) || 'No students attached';
  // Captured per render of this row; the Today screen re-renders on its own clock.
  const [now] = useState(() => Date.now());
  const outcome = classOutcome(cls, now);
  const over = isPastClass(cls, now);
  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 border-b border-line/60 last:border-0">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="w-16 shrink-0 text-center rounded-xl bg-sand px-2 py-1.5">
          {showDate && (
            <p className="text-[10px] uppercase tracking-wide text-muted">
              {formatInZone(cls.startsAt, zone, { weekday: 'short', day: 'numeric' })}
            </p>
          )}
          <p className="text-sm font-semibold text-ink tabular-nums">{timeInZone(cls.startsAt, zone)}</p>
          <p className="text-[10px] text-muted tabular-nums">to {timeInZone(cls.endsAt, zone)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{names}</p>
          <p className="text-xs text-muted truncate">{cls.course?.name ?? 'Course not set'}</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <Badge tone={cls.type === 'TRIAL' ? 'gold' : 'neutral'}>{humanize(cls.type)}</Badge>
            <span title={outcome.hint}>
              <Badge tone={outcome.tone}>{outcome.label}</Badge>
            </span>
            {/* M68 — the lesson card's state, so a missing card is visible from the timetable. */}
            {cls.lessonCard ? (
              <Badge tone={cls.lessonCard.state === 'SHARED' ? 'green' : cls.lessonCard.state === 'SUBMITTED' ? 'neutral' : 'amber'}>
                {cls.lessonCard.state === 'SHARED' ? 'Card shared' : cls.lessonCard.state === 'SUBMITTED' ? 'Card sent' : 'Card draft'}
              </Badge>
            ) : (
              cls.status === 'COMPLETED' && <Badge tone="amber">Card due</Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {onDetails && (
          <button
            type="button"
            onClick={() => onDetails(cls)}
            className={cn(LINK_BTN, 'text-ink-2 hover:bg-sand cursor-pointer')}
            aria-label={`Details for ${names} at ${timeInZone(cls.startsAt, zone)}`}
          >
            Details
          </button>
        )}
        <BriefLink classId={cls.id} />
        {canEnterClassroom(cls.status, cls.endsAt, now) && (
          <ClassroomLink classId={cls.id} live={cls.status === 'LIVE' || outcome.label === 'In progress'} />
        )}
        {over && (cls.status === 'SCHEDULED' || cls.status === 'LIVE' || cls.status === 'COMPLETED') && <LessonCardLink classId={cls.id} />}
      </div>
    </li>
  );
}
