'use client';

import React, { useState } from 'react';
import { PenLine } from 'lucide-react';
import { Alert, Field, Select, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useMarkMistake } from '@/hooks/useClassroomMistakes';
import { COURSE_MISTAKE_TYPES, MISTAKE_TYPE_LABELS, MistakeType, type MarkMistakeInput } from '@/lib/api/modules/lessons';
import type { ClassStudent } from './MistakeLogger';

const ITEM_MAX = 160;
const NOTE_MAX = 300;

/**
 * Mistakes in Qaida, Duas, Arabic and Islamic Studies classes (no Mushaf word to tap): the
 * course's own categories, where it happened (prefilled from the board item on screen), and an
 * optional note. Saved through the same endpoint as Mushaf mistakes.
 */
export function CourseMistakeLogger({
  classId,
  courseType,
  students,
  currentItem,
  onLogged,
}: {
  classId: string;
  courseType: string;
  students: ClassStudent[];
  /** The board lesson/item on screen, e.g. "Single letters: ث". */
  currentItem: string | null;
  onLogged?: (mistake: MarkMistakeInput) => void;
}) {
  const mark = useMarkMistake(classId);
  const toast = useToast();
  const types = COURSE_MISTAKE_TYPES[courseType] ?? [];
  const [studentId, setStudentId] = useState(students.length === 1 ? students[0].studentId : '');
  const [type, setType] = useState<MistakeType | ''>('');
  const [item, setItem] = useState(currentItem ?? '');
  const [note, setNote] = useState('');
  const [lastItem, setLastItem] = useState(currentItem);

  // The teacher moved to another board item: the "where" follows (adjusting state during render).
  if (lastItem !== currentItem) {
    setLastItem(currentItem);
    if (currentItem) setItem(currentItem);
  }

  if (students.length === 0) {
    return (
      <Alert tone="neutral" title="No students enrolled">
        Mistakes are recorded against a student in this class, and none are enrolled.
      </Alert>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const where = item.trim();
    const text = note.trim();
    const sid = studentId || (students.length === 1 ? students[0].studentId : '');
    if (!sid) return toast.error('Choose the student');
    if (!type) return toast.error('Choose what kind of mistake it was');
    if (!where && !text) return toast.error('Say where it was, or add a short note');
    const payload: MarkMistakeInput = {
      studentId: sid,
      type,
      ...(where ? { itemRef: where.slice(0, ITEM_MAX) } : {}),
      ...(text ? { note: text.slice(0, NOTE_MAX) } : {}),
    };
    mark.mutate(payload, {
      onSuccess: () => {
        toast.success(`${MISTAKE_TYPE_LABELS[type]} logged${where ? ` at ${where}` : ''}`);
        setType('');
        setNote('');
        onLogged?.(payload);
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Log a mistake" className="space-y-3">
      {students.length > 1 && (
        <Field label="Student" htmlFor="course-mistake-student" required>
          <Select id="course-mistake-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Choose a student…</option>
            {students.map((s) => (
              <option key={s.studentId} value={s.studentId}>
                {s.displayName}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Mistake type" htmlFor="course-mistake-type" required>
        <Select id="course-mistake-type" value={type} onChange={(e) => setType(e.target.value as MistakeType | '')}>
          <option value="">Choose a type…</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {MISTAKE_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Where" htmlFor="course-mistake-item" hint={currentItem ? 'Filled in from the lesson on screen' : 'Lesson, letter, dua or topic'}>
        <TextInput id="course-mistake-item" value={item} maxLength={ITEM_MAX} onChange={(e) => setItem(e.target.value)} />
      </Field>
      <Field label="Note (optional)" htmlFor="course-mistake-note">
        <TextInput id="course-mistake-note" value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <UiButton type="submit" loading={mark.isPending} icon={<PenLine className="w-4 h-4" aria-hidden />} className="w-full">
        Log mistake
      </UiButton>
    </form>
  );
}
