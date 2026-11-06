'use client';

import React, { useMemo } from 'react';
import { Select } from '@/components/ui/primitives';
import { useCourseOutline } from '@/hooks/useCourseOutline';

/** The shape both `GET /courses/:id` and the admin curriculum share. */
export interface PickerLevel {
  id: string;
  name: string;
  position: number;
  lessonTemplates: Array<{ id: string; title: string; position: number }>;
}

/** A lesson is addressed by level + position, the same pair an enrolment points with. */
export interface LessonRef {
  levelId: string;
  position: number;
}

export const lessonValue = (ref: LessonRef) => `${ref.levelId}:${ref.position}`;

export function parseLessonValue(value: string): LessonRef | null {
  const at = value.lastIndexOf(':');
  if (at <= 0) return null;
  const position = Number(value.slice(at + 1));
  if (!Number.isInteger(position) || position < 1) return null;
  return { levelId: value.slice(0, at), position };
}

/** How a lesson reads everywhere: "Sabaq start — Lesson 2: Juz 30: Al-Ma'un – At-Takathur". */
export function lessonLabel(levelName: string, position: number, title: string) {
  return `${levelName} — Lesson ${position}: ${title}`;
}

export function findLesson(levels: PickerLevel[] | undefined, ref: Partial<LessonRef> | null | undefined) {
  if (!levels || !ref?.levelId) return null;
  const level = levels.find((l) => l.id === ref.levelId);
  const lesson = level?.lessonTemplates.find((t) => t.position === ref.position);
  return level && lesson ? { level, lesson } : null;
}

/**
 * The lesson picker shared by the admin "Set lesson" dialog and the teacher's student page:
 * every lesson of the course, grouped by level, labelled "Level — Lesson N: title".
 *
 * `lockedLevelId` keeps the choice inside one level (a teacher cannot move a student to
 * another level; passing the level assessment does that), showing the others greyed out.
 */
export function LessonPicker({
  id,
  levels,
  value,
  onChange,
  lockedLevelId,
  disabled,
  autoFocus,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
}: {
  id: string;
  levels: PickerLevel[];
  value: LessonRef | null;
  onChange: (ref: LessonRef) => void;
  lockedLevelId?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
  'aria-invalid'?: boolean;
  'aria-label'?: string;
}) {
  const options = useMemo(
    () =>
      [...levels]
        .sort((a, b) => a.position - b.position)
        .filter((level) => level.lessonTemplates.length > 0)
        .map((level) => ({
          label: `Level ${level.position}: ${level.name}`,
          options: [...level.lessonTemplates]
            .sort((a, b) => a.position - b.position)
            .map((lesson) => ({
              value: lessonValue({ levelId: level.id, position: lesson.position }),
              label: lessonLabel(level.name, lesson.position, lesson.title),
              isDisabled: Boolean(lockedLevelId) && level.id !== lockedLevelId,
            })),
        })),
    [levels, lockedLevelId],
  );

  return (
    <Select
      id={id}
      options={options}
      value={value ? lessonValue(value) : ''}
      onChange={(e) => {
        const ref = parseLessonValue(e.target.value);
        if (ref) onChange(ref);
      }}
      searchable
      disabled={disabled}
      autoFocus={autoFocus}
      aria-invalid={ariaInvalid}
      aria-label={ariaLabel}
      placeholder="Choose a lesson"
      noOptionsText="No lesson matches"
    />
  );
}

/**
 * "Now on: Short surahs — An-Nas – Al-Ikhlas": where a student is in a course, in words.
 * Falls back to the level name while the lesson titles load, never to a bare number.
 */
export function useLessonDescription(
  courseId: string | null | undefined,
  level: { id: string; name: string } | null | undefined,
  position: number | null | undefined,
) {
  const outline = useCourseOutline(level ? courseId : null);
  const found = findLesson(outline.data?.levels, level ? { levelId: level.id, position: position ?? 1 } : null);
  if (!level) return { text: 'Not started on a level yet', title: null as string | null, levelName: null as string | null };
  if (found) return { text: `${level.name} — ${found.lesson.title}`, title: found.lesson.title, levelName: level.name };
  return { text: level.name, title: null as string | null, levelName: level.name };
}

/** Inline "Now on: …" for family and student screens. */
export function NowOnLesson({
  courseId,
  level,
  position,
  prefix = 'Now on: ',
  className,
}: {
  courseId: string | null | undefined;
  level: { id: string; name: string } | null | undefined;
  position: number | null | undefined;
  prefix?: string;
  className?: string;
}) {
  const { text } = useLessonDescription(courseId, level, position);
  return (
    <span className={className}>
      {prefix}
      {text}
    </span>
  );
}

/** Just the lesson title (e.g. in a table cell under the level name); empty until it loads. */
export function LessonTitleText({
  courseId,
  level,
  position,
  className,
}: {
  courseId: string | null | undefined;
  level: { id: string; name: string } | null | undefined;
  position: number | null | undefined;
  className?: string;
}) {
  const { title } = useLessonDescription(courseId, level, position);
  if (!title) return null;
  return <span className={className}>{title}</span>;
}
