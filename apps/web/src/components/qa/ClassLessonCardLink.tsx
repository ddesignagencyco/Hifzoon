'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { useClassLessonCardId } from '@/hooks/useLessonCards';
import { ApiClientError } from '@/lib/api/http';
import { cn } from '@/lib/utils';

/**
 * The lesson card for a class, for supervisors (FR-REC-08 review/edit at
 * `/supervisor/lesson-cards/:id`). `lazy` waits for a click before asking the API, so a long
 * class list doesn't fire one request per row. A class the viewer can't read shows nothing.
 */
export function ClassLessonCardLink({ classId, lazy = false, className }: { classId: string; lazy?: boolean; className?: string }) {
  const [requested, setRequested] = useState(!lazy);
  const card = useClassLessonCardId(classId, requested);

  if (!requested) {
    return (
      <button
        type="button"
        onClick={() => setRequested(true)}
        className={cn('inline-flex items-center gap-1 text-xs font-semibold text-green-800 hover:underline cursor-pointer', className)}
      >
        <FileText className="w-3.5 h-3.5" aria-hidden /> Lesson card
      </button>
    );
  }
  if (card.isLoading) return <span className={cn('text-xs text-muted', className)}>Checking lesson card…</span>;
  if (card.isError) {
    const status = card.error instanceof ApiClientError ? card.error.status : undefined;
    if (status === 403 || status === 404) return null;
    return (
      <button
        type="button"
        onClick={() => card.refetch()}
        className={cn('text-xs font-semibold text-muted hover:underline cursor-pointer', className)}
      >
        Lesson card unavailable · Retry
      </button>
    );
  }
  if (!card.data) return <span className={cn('text-xs text-muted', className)}>No lesson card yet</span>;
  return (
    <Link
      href={`/supervisor/lesson-cards/${encodeURIComponent(card.data)}`}
      className={cn('inline-flex items-center gap-1 text-xs font-semibold text-green-800 hover:underline', className)}
    >
      <FileText className="w-3.5 h-3.5" aria-hidden /> Open lesson card
    </Link>
  );
}
