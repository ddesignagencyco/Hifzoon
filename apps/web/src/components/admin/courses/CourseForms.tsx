'use client';

import React, { useState } from 'react';
import { Field, Modal, Select, TextArea, TextInput, UiButton, humanize } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useCreateCourse, useCreateLesson, useCreateLevel } from '@/hooks/useCoursesAdmin';
import {
  COURSE_TYPES,
  CourseType,
  CreateCourseInput,
  FieldErrors,
  validateCourse,
  validateLesson,
  validateLevel,
} from '@/lib/api/modules/courses-admin';

function FormActions({ pending, onCancel, label }: { pending: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <UiButton variant="secondary" onClick={onCancel} disabled={pending}>
        Cancel
      </UiButton>
      <UiButton type="submit" loading={pending}>
        {label}
      </UiButton>
    </div>
  );
}

/** `POST /courses` (CreateCourseDto). */
export function CreateCourseModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="New course" description="Codes are unique and cannot be changed later.">
      {open && <CreateCourseForm onDone={onClose} onCreated={onCreated} />}
    </Modal>
  );
}

function CreateCourseForm({ onDone, onCreated }: { onDone: () => void; onCreated?: (id: string) => void }) {
  const toast = useToast();
  const create = useCreateCourse();
  const [values, setValues] = useState<CreateCourseInput>({ code: '', name: '', type: 'HIFZ', description: '', locale: 'en' });
  const [errors, setErrors] = useState<FieldErrors<keyof CreateCourseInput>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validateCourse(values);
    setErrors(next);
    if (Object.keys(next).length > 0) return toast.error(Object.values(next).find(Boolean) ?? 'Please fix the highlighted fields');
    create.mutate(
      {
        code: values.code.trim(),
        name: values.name.trim(),
        type: values.type,
        description: values.description.trim(),
        ...(values.locale?.trim() ? { locale: values.locale.trim() } : {}),
      },
      {
        onSuccess: (course) => {
          toast.success(`Course ${course.code} created`);
          onDone();
          onCreated?.(course.id);
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="New course">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Code" htmlFor="course-code" required error={errors.code} hint="Up to 40 characters, e.g. HIFZ_KIDS">
          <TextInput
            id="course-code"
            value={values.code}
            maxLength={40}
            aria-invalid={Boolean(errors.code)}
            onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))}
          />
        </Field>
        <Field label="Type" htmlFor="course-type" required error={errors.type}>
          <Select
            id="course-type"
            value={values.type}
            onChange={(e) => setValues((v) => ({ ...v, type: e.target.value as CourseType }))}
          >
            {COURSE_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Name" htmlFor="course-name" required error={errors.name}>
        <TextInput
          id="course-name"
          value={values.name}
          maxLength={160}
          aria-invalid={Boolean(errors.name)}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        />
      </Field>
      <Field label="Description" htmlFor="course-description" required error={errors.description}>
        <TextArea
          id="course-description"
          rows={4}
          value={values.description}
          aria-invalid={Boolean(errors.description)}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        />
      </Field>
      <Field label="Locale" htmlFor="course-locale" error={errors.locale} hint="Catalogue language, default en.">
        <TextInput
          id="course-locale"
          value={values.locale ?? ''}
          maxLength={5}
          aria-invalid={Boolean(errors.locale)}
          onChange={(e) => setValues((v) => ({ ...v, locale: e.target.value }))}
        />
      </Field>
      <FormActions pending={create.isPending} onCancel={onDone} label="Create course" />
    </form>
  );
}

/** `POST /courses/:courseId/levels` (CreateLevelDto). */
export function AddLevelModal({ courseId, open, onClose }: { courseId: string; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Add level" description="Levels are appended after the last one.">
      {open && <AddLevelForm courseId={courseId} onDone={onClose} />}
    </Modal>
  );
}

function AddLevelForm({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const toast = useToast();
  const create = useCreateLevel(courseId);
  const [values, setValues] = useState({ name: '', passMark: '70' });
  const [errors, setErrors] = useState<FieldErrors<'name' | 'passMark'>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validateLevel(values);
    setErrors(next);
    if (Object.keys(next).length > 0) return toast.error(Object.values(next).find(Boolean) ?? 'Please fix the highlighted fields');
    create.mutate(
      { name: values.name.trim(), ...(values.passMark.trim() !== '' ? { passMark: Number(values.passMark) } : {}) },
      {
        onSuccess: (level) => {
          toast.success(`Level ${level.position} “${level.name}” added`);
          onDone();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Add level">
      <Field label="Level name" htmlFor="level-name" required error={errors.name}>
        <TextInput
          id="level-name"
          value={values.name}
          maxLength={160}
          aria-invalid={Boolean(errors.name)}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          autoFocus
        />
      </Field>
      <Field label="Pass mark" htmlFor="level-pass" error={errors.passMark} hint="Whole number; the API defaults to 70.">
        <TextInput
          id="level-pass"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={values.passMark}
          aria-invalid={Boolean(errors.passMark)}
          onChange={(e) => setValues((v) => ({ ...v, passMark: e.target.value }))}
        />
      </Field>
      <p className="text-[11px] text-muted">Assessment rubrics cannot be set from here yet — the API does not accept them.</p>
      <FormActions pending={create.isPending} onCancel={onDone} label="Add level" />
    </form>
  );
}

/** `POST /courses/levels/:levelId/lessons` (CreateLessonDto). */
export function AddLessonModal({
  courseId,
  level,
  onClose,
}: {
  courseId: string;
  level: { id: string; name: string } | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={level !== null}
      onClose={onClose}
      title="Add lesson"
      description={level ? `Appended to the end of “${level.name}”.` : undefined}
    >
      {level && <AddLessonForm courseId={courseId} levelId={level.id} onDone={onClose} />}
    </Modal>
  );
}

function AddLessonForm({ courseId, levelId, onDone }: { courseId: string; levelId: string; onDone: () => void }) {
  const toast = useToast();
  const create = useCreateLesson(courseId);
  const [values, setValues] = useState({ title: '', teacherNotes: '' });
  const [errors, setErrors] = useState<FieldErrors<'title'>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validateLesson(values);
    setErrors(next);
    if (Object.keys(next).length > 0) return toast.error(Object.values(next).find(Boolean) ?? 'Please fix the highlighted fields');
    create.mutate(
      {
        levelId,
        body: { title: values.title.trim(), ...(values.teacherNotes.trim() ? { teacherNotes: values.teacherNotes.trim() } : {}) },
      },
      {
        onSuccess: (lesson) => {
          toast.success(`Lesson ${lesson.position} “${lesson.title}” added`);
          onDone();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Add lesson">
      <Field label="Lesson title" htmlFor="lesson-title" required error={errors.title}>
        <TextInput
          id="lesson-title"
          value={values.title}
          maxLength={200}
          aria-invalid={Boolean(errors.title)}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          autoFocus
        />
      </Field>
      <Field label="Teacher notes (optional)" htmlFor="lesson-notes">
        <TextArea
          id="lesson-notes"
          rows={4}
          value={values.teacherNotes}
          onChange={(e) => setValues((v) => ({ ...v, teacherNotes: e.target.value }))}
        />
      </Field>
      <p className="text-[11px] text-muted">
        Objectives and materials cannot be saved yet — the API rejects those fields. Existing objectives are shown in the
        lesson plan.
      </p>
      <FormActions pending={create.isPending} onCancel={onDone} label="Add lesson" />
    </form>
  );
}
