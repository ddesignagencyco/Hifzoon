'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAssignPractice } from '@/hooks/usePractice';
import { mistakeKeys } from '@/hooks/useClassroomMistakes';
import { useDuaCollection } from '@/lib/api/modules/duas';
import { lessonsApi } from '@/lib/api/modules/lessons';
import { practiceTitle, type PracticeBoard } from '@/lib/api/modules/practice';
import { boardDraftLabel, boardPracticeFromMistakes } from '@/lib/board-practice';
import { practiceFromMistakes, type MistakeLike } from '@/lib/mistakes-practice';

/**
 * Teacher: one click sets a 15-minute practice, due in three days, from the student's open
 * mistakes. A Mushaf student reads the stretch of their open Mushaf mistakes (see
 * practiceRangeFromMistakes for how it is capped); a Duas or Qaida student (`board`) gets the dua
 * chapter (or the one dua) or the Qaida lesson with the most open mistakes.
 */
export function MakePracticeFromMistakes({
  studentId,
  studentName,
  className,
  board = null,
}: {
  studentId: string;
  studentName?: string;
  className?: string;
  /** The student's Duas or Qaida board, when that is what they learn with this teacher. */
  board?: PracticeBoard | null;
}) {
  const mistakes = useQuery({
    queryKey: mistakeKeys.forStudent(studentId),
    queryFn: () => lessonsApi.studentMistakes(studentId, { limit: 200 }),
  });
  const duas = useDuaCollection(board === 'DUAS');
  const assign = useAssignPractice();
  const toast = useToast();
  const [created, setCreated] = useState<string | null>(null);
  const rows = (mistakes.data ?? []) as MistakeLike[];
  const body = board
    ? boardPracticeFromMistakes(studentId, board, rows, duas.data?.categories)
    : practiceFromMistakes(studentId, rows);
  const passage = !body
    ? null
    : body.board
      ? practiceTitle({
          fromSurah: null,
          fromAyah: null,
          toSurah: null,
          toAyah: null,
          board: body.board,
          boardLesson: body.boardLesson,
          label: boardDraftLabel(body.board, body.boardLesson ?? 0, body.boardItem, duas.data?.categories),
        })
      : `Surah ${body.fromSurah}:${body.fromAyah}–${body.toAyah}`;
  const kind = body?.mode === 'MEMORISATION' ? 'memorisation' : 'reading';

  const make = () => {
    if (!body) return;
    assign.mutate(body, {
      onSuccess: () => {
        setCreated(passage);
        toast.success(`Practice set${studentName ? ` for ${studentName}` : ''}: ${passage}, due in 3 days.`);
      },
      onError: (e) => toast.error(e),
    });
  };

  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      <UiButton
        size="sm"
        variant="secondary"
        icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
        loading={assign.isPending}
        disabled={!body || mistakes.isLoading || (board === 'DUAS' && duas.isLoading)}
        title={
          body
            ? `${passage}, ${kind}, 15 minutes, due in 3 days`
            : board
              ? `No open ${board === 'DUAS' ? 'Duas' : 'Qaida'} mistakes to practise`
              : 'No open Mushaf mistakes to practise'
        }
        onClick={make}
      >
        Make practice from mistakes
      </UiButton>
      {created && (
        <Link
          href={`/teacher/students/${encodeURIComponent(studentId)}#practice`}
          className="text-xs font-semibold text-green-700 underline"
        >
          Practice set: {created}
        </Link>
      )}
    </span>
  );
}
