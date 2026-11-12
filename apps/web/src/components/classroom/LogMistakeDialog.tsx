'use client';

import React, { useId, useState } from 'react';
import { PenLine } from 'lucide-react';
import { Modal, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useMarkMistake } from '@/hooks/useClassroomMistakes';
import { ApiClientError } from '@/lib/api/http';
import {
  COURSE_MISTAKE_TYPES,
  MISTAKE_TYPE_LABELS,
  MISTAKE_TYPES,
  TAJWEED_RULE_MAX,
  isMushafCourse,
  type MarkMistakeInput,
  type MistakeType,
} from '@/lib/api/modules/lessons';
import type { WordPosition } from '@/components/mushaf/MushafViewer';
import { cn } from '@/lib/utils';

export interface ClassStudent {
  studentId: string;
  displayName: string;
}

/** What the teacher selected: a Mushaf word, or a board item (a dua word or a Qaida tile). */
export type LogTarget =
  | { kind: 'word'; position: WordPosition; text?: string | null }
  | { kind: 'item'; label: string | null };

const ARABIC: React.CSSProperties = { fontFamily: "var(--font-quran), 'Amiri Quran', 'Amiri', serif" };
const ITEM_MAX = 160;
const NOTE_MAX = 300;

/** `112:3 · word 2` — word numbers count from 1, as everywhere a mistake is shown. */
export function wordPlace(p: WordPosition): string {
  return `${p.surah}:${p.ayah} · word ${p.wordIndex + 1}`;
}

/** One-tap choice chip, like the practice review's mistake chips. */
function Chip({ selected, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1',
        selected ? 'border-green-800 bg-green-800 text-white' : 'border-line bg-white text-ink hover:bg-sand',
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Teacher, live class: the quick "log a mistake" dialog (FR-REC-01), opened by "Log mistake" once a
 * Mushaf word, dua word or Qaida tile is selected, with that place filled in. One tap picks the
 * kind; Enter logs, Esc closes. Saved through the same call as before, then mirrored to the room.
 */
export function LogMistakeDialog({
  open,
  onClose,
  classId,
  courseType,
  students,
  target,
  onLogged,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
  courseType: string | null | undefined;
  students: ClassStudent[];
  target: LogTarget | null;
  onLogged?: (mistake: MarkMistakeInput) => void;
}) {
  return (
    <Modal open={open && target !== null} onClose={onClose} title="Log a mistake" size="sm">
      {target && (
        <LogMistakeForm
          classId={classId}
          courseType={courseType}
          students={students}
          target={target}
          onDone={onClose}
          onLogged={onLogged}
        />
      )}
    </Modal>
  );
}

function LogMistakeForm({
  classId,
  courseType,
  students,
  target,
  onDone,
  onLogged,
}: {
  classId: string;
  courseType: string | null | undefined;
  students: ClassStudent[];
  target: LogTarget;
  onDone: () => void;
  onLogged?: (mistake: MarkMistakeInput) => void;
}) {
  const mark = useMarkMistake(classId);
  const toast = useToast();
  const id = useId();
  const mushaf = isMushafCourse(courseType);
  const types: readonly MistakeType[] = mushaf ? MISTAKE_TYPES : (COURSE_MISTAKE_TYPES[courseType ?? ''] ?? []);
  const [studentId, setStudentId] = useState(students.length === 1 ? students[0].studentId : '');
  const [type, setType] = useState<MistakeType | ''>('');
  const item = target.kind === 'item' ? (target.label ?? '') : '';
  const [rule, setRule] = useState('');
  const [note, setNote] = useState('');

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (mark.isPending) return;
    const sid = studentId || (students.length === 1 ? students[0].studentId : '');
    if (!sid) return toast.error('Choose the student who made the mistake');
    if (!type) return toast.error('Choose what kind of mistake it was');
    const text = note.trim().slice(0, NOTE_MAX);
    let payload: MarkMistakeInput;
    let where: string;
    if (target.kind === 'word') {
      const r = rule.trim();
      if (r.length > TAJWEED_RULE_MAX) return toast.error(`Keep the rule under ${TAJWEED_RULE_MAX} characters`);
      payload = {
        studentId: sid,
        surah: target.position.surah,
        ayah: target.position.ayah,
        wordIndex: target.position.wordIndex,
        type,
        ...(r ? { tajweedRule: r } : {}),
        ...(text ? { note: text } : {}),
      };
      where = `${target.position.surah}:${target.position.ayah}`;
    } else {
      where = item.trim().slice(0, ITEM_MAX);
      if (!where) return toast.error('Tap a word first, then log the mistake on it.');
      payload = { studentId: sid, type, ...(where ? { itemRef: where } : {}), ...(text ? { note: text } : {}) };
    }
    mark.mutate(payload, {
      onSuccess: () => {
        toast.success(`${MISTAKE_TYPE_LABELS[type]} logged${where ? ` at ${where}` : ''}`);
        onLogged?.(payload);
        onDone();
      },
      onError: (err) => {
        // The API only lets a teacher save mistakes for a student *enrolled* with them; a booked
        // trial creates no enrolment (backend requirement B21), so say why.
        if (err instanceof ApiClientError && err.status === 403) {
          return toast.error(
            'Mistakes can only be saved for students enrolled with you. This looks like a trial student — once they are enrolled in a course with you, marking will work.',
          );
        }
        toast.error(err);
      },
    });
  };

  // Enter logs from anywhere in the dialog but a button (which it presses instead).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey || (e.target as HTMLElement).tagName === 'BUTTON') return;
    e.preventDefault();
    submit();
  };

  if (students.length === 0) {
    return <p className="text-sm text-ink-2">Mistakes are recorded against a student in this class, and none are enrolled.</p>;
  }

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} noValidate aria-label="Log a mistake" className="space-y-4">
      {target.kind === 'word' ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-sand px-3 py-2" aria-label="Where">
          <span className="text-sm font-semibold tabular-nums text-ink">{wordPlace(target.position)}</span>
          {target.text && (
            <span dir="rtl" lang="ar" className="truncate text-2xl leading-normal text-ink" style={ARABIC}>
              {target.text}
            </span>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-sand px-3 py-2" aria-label="Where">
          <span className="block text-sm font-semibold text-ink [overflow-wrap:anywhere]">{item || 'The item on the board'}</span>
        </div>
      )}

      {students.length > 1 && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-ink-2">Student</legend>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Student">
            {students.map((s) => (
              <Chip key={s.studentId} selected={studentId === s.studentId} onClick={() => setStudentId(s.studentId)}>
                {s.displayName}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-semibold text-ink-2">Mistake</legend>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mistake type">
          {types.map((t) => (
            <Chip key={t} selected={type === t} onClick={() => setType(t)}>
              {MISTAKE_TYPE_LABELS[t]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className={cn('grid gap-3', mushaf && 'sm:grid-cols-2')}>
        {mushaf && (
          <div className="space-y-1.5">
            <label htmlFor={`${id}-rule`} className="block text-xs font-semibold text-ink-2">
              Tajweed rule <span className="font-normal text-muted">(optional)</span>
            </label>
            <TextInput
              id={`${id}-rule`}
              value={rule}
              maxLength={TAJWEED_RULE_MAX + 20}
              placeholder="e.g. Ghunnah"
              onChange={(e) => setRule(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor={`${id}-note`} className="block text-xs font-semibold text-ink-2">
            Note <span className="font-normal text-muted">(optional)</span>
          </label>
          <TextInput id={`${id}-note`} value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <div className="-mx-5 -mb-4 flex items-center justify-end gap-2 border-t border-line px-5 py-3">
        <span className="me-auto hidden text-[11px] text-muted sm:inline">Enter to log · Esc to close</span>
        <UiButton variant="ghost" size="sm" onClick={onDone} disabled={mark.isPending}>
          Cancel
        </UiButton>
        <UiButton type="submit" size="sm" loading={mark.isPending} icon={<PenLine className="h-3.5 w-3.5" aria-hidden />}>
          Log mistake
        </UiButton>
      </div>
    </form>
  );
}
