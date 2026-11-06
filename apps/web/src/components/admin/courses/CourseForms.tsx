'use client';

import React, { useState } from 'react';
import { CONTENT_LOCALES } from '@/lib/api/modules/families';
import { Field, Modal, Select, TextArea, TextInput, UiButton, humanize } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  useCreateCourse,
  useCreateLesson,
  useCreateLevel,
  useDeleteLesson,
  useUpdateLesson,
  useUpdateLevel,
} from '@/hooks/useCoursesAdmin';
import {
  COURSE_TYPES,
  CourseType,
  CreateCourseInput,
  FieldErrors,
  linesOf,
  objectivesToLines,
  parseKeyValueLines,
  parseRubric,
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
      <Field label="Language" htmlFor="course-locale" error={errors.locale}>
        <Select id="course-locale" value={values.locale ?? 'en'} onChange={(e) => setValues((v) => ({ ...v, locale: e.target.value }))}>
          {CONTENT_LOCALES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </Select>
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
  const [values, setValues] = useState({ name: '', passMark: '70', rubric: '' });
  const [errors, setErrors] = useState<FieldErrors<'name' | 'passMark' | 'rubric'>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const rubric = parseRubric(values.rubric);
    const next: FieldErrors<'name' | 'passMark' | 'rubric'> = {
      ...validateLevel(values),
      ...(rubric.error ? { rubric: rubric.error } : {}),
    };
    setErrors(next);
    if (Object.keys(next).length > 0) return toast.error(Object.values(next).find(Boolean) ?? 'Please fix the highlighted fields');
    create.mutate(
      {
        name: values.name.trim(),
        ...(values.passMark.trim() !== '' ? { passMark: Number(values.passMark) } : {}),
        ...(rubric.value ? { rubric: rubric.value } : {}),
      },
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
      <Field label="Pass mark" htmlFor="level-pass" error={errors.passMark} hint="Whole number; 70 if left empty.">
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
      <Field
        label="Assessment rubric (optional)"
        htmlFor="level-rubric"
        error={errors.rubric}
        hint="One criterion per line as “criterion: weight”; weights add up to 100."
      >
        <TextArea
          id="level-rubric"
          rows={3}
          value={values.rubric}
          placeholder={'recitation: 40\ntajweed: 30\nfluency: 30'}
          aria-invalid={Boolean(errors.rubric)}
          onChange={(e) => setValues((v) => ({ ...v, rubric: e.target.value }))}
        />
      </Field>
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
  const [values, setValues] = useState({ title: '', objectives: '', materials: '', teacherNotes: '' });
  const [errors, setErrors] = useState<FieldErrors<'title' | 'materials'>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const materials = parseKeyValueLines(values.materials);
    const next: FieldErrors<'title' | 'materials'> = {
      ...validateLesson(values),
      ...(materials.error ? { materials: materials.error } : {}),
    };
    setErrors(next);
    if (Object.keys(next).length > 0) return toast.error(Object.values(next).find(Boolean) ?? 'Please fix the highlighted fields');
    const objectives = linesOf(values.objectives);
    create.mutate(
      {
        levelId,
        body: {
          title: values.title.trim(),
          ...(objectives.length ? { objectives } : {}),
          ...(materials.value ? { materials: materials.value } : {}),
          ...(values.teacherNotes.trim() ? { teacherNotes: values.teacherNotes.trim() } : {}),
        },
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
      <Field label="Objectives (optional)" htmlFor="lesson-objectives" hint="One objective per line.">
        <TextArea
          id="lesson-objectives"
          rows={3}
          value={values.objectives}
          onChange={(e) => setValues((v) => ({ ...v, objectives: e.target.value }))}
        />
      </Field>
      <Field
        label="Materials (optional)"
        htmlFor="lesson-materials"
        error={errors.materials}
        hint="One per line as “label: value”, e.g. “workbook: Noorani Qaida page 1”."
      >
        <TextArea
          id="lesson-materials"
          rows={2}
          value={values.materials}
          aria-invalid={Boolean(errors.materials)}
          onChange={(e) => setValues((v) => ({ ...v, materials: e.target.value }))}
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
      <FormActions pending={create.isPending} onCancel={onDone} label="Add lesson" />
    </form>
  );
}

// ── Editing an existing level or lesson (PATCH /courses/levels/:id, /courses/lessons/:id) ──

/** Rename a level or change its pass mark. */
export function EditLevelModal({
  level,
  onClose,
}: {
  level: { id: string; name: string; passMark: number; position: number } | null;
  onClose: () => void;
}) {
  return (
    <Modal open={level !== null} onClose={onClose} title="Edit level" description={level ? `Level ${level.position}` : undefined}>
      {level && <EditLevelForm key={level.id} level={level} onDone={onClose} />}
    </Modal>
  );
}

function EditLevelForm({ level, onDone }: { level: { id: string; name: string; passMark: number }; onDone: () => void }) {
  const toast = useToast();
  const update = useUpdateLevel();
  const [values, setValues] = useState({ name: level.name, passMark: String(level.passMark) });
  const [errors, setErrors] = useState<FieldErrors<'name' | 'passMark'>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validateLevel(values);
    setErrors(next);
    if (Object.keys(next).length > 0) return toast.error(Object.values(next).find(Boolean) ?? 'Please fix the highlighted fields');
    update.mutate(
      {
        levelId: level.id,
        body: {
          name: values.name.trim(),
          ...(values.passMark.trim() !== '' ? { passMark: Number(values.passMark) } : {}),
        },
      },
      {
        onSuccess: (saved) => {
          toast.success(`Level “${saved.name}” saved`);
          onDone();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Edit level">
      <Field label="Level name" htmlFor="edit-level-name" required error={errors.name}>
        <TextInput
          id="edit-level-name"
          value={values.name}
          maxLength={160}
          aria-invalid={Boolean(errors.name)}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          autoFocus
        />
      </Field>
      <Field label="Pass mark" htmlFor="edit-level-pass" error={errors.passMark} hint="The score a level assessment needs to pass.">
        <TextInput
          id="edit-level-pass"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={values.passMark}
          aria-invalid={Boolean(errors.passMark)}
          onChange={(e) => setValues((v) => ({ ...v, passMark: e.target.value }))}
        />
      </Field>
      <FormActions pending={update.isPending} onCancel={onDone} label="Save level" />
    </form>
  );
}

export interface EditableLesson {
  id: string;
  title: string;
  position: number;
  objectives: unknown;
  materials: unknown;
  teacherNotes: string | null;
  enrolmentCount: number;
}

/** Opened by clicking a lesson on the course page: edit it, or delete it when no student is on it. */
export function EditLessonModal({
  lesson,
  levelName,
  onClose,
}: {
  lesson: EditableLesson | null;
  levelName?: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open={lesson !== null}
      onClose={onClose}
      title="Edit lesson"
      description={lesson ? `${levelName ?? 'Level'} · lesson ${lesson.position}` : undefined}
    >
      {lesson && <EditLessonForm key={lesson.id} lesson={lesson} onDone={onClose} />}
    </Modal>
  );
}

function materialsToLines(materials: unknown): string {
  if (!materials || typeof materials !== 'object' || Array.isArray(materials)) return '';
  return Object.entries(materials as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join('\n');
}

function EditLessonForm({ lesson, onDone }: { lesson: EditableLesson; onDone: () => void }) {
  const toast = useToast();
  const update = useUpdateLesson();
  const remove = useDeleteLesson();
  const [values, setValues] = useState({
    title: lesson.title,
    objectives: objectivesToLines(lesson.objectives).join('\n'),
    materials: materialsToLines(lesson.materials),
    teacherNotes: lesson.teacherNotes ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors<'title' | 'materials'>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const materials = parseKeyValueLines(values.materials);
    const next: FieldErrors<'title' | 'materials'> = {
      ...validateLesson(values),
      ...(materials.error ? { materials: materials.error } : {}),
    };
    setErrors(next);
    if (Object.keys(next).length > 0) return toast.error(Object.values(next).find(Boolean) ?? 'Please fix the highlighted fields');
    update.mutate(
      {
        lessonId: lesson.id,
        body: {
          title: values.title.trim(),
          objectives: linesOf(values.objectives),
          materials: materials.value ?? {},
          teacherNotes: values.teacherNotes.trim() || null,
        },
      },
      {
        onSuccess: (saved) => {
          toast.success(`Lesson ${saved.position} saved: “${saved.title}”`);
          onDone();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  const doDelete = () =>
    remove.mutate(lesson.id, {
      onSuccess: () => {
        toast.success(`Lesson “${lesson.title}” deleted`);
        onDone();
      },
      onError: (err) => toast.error(err),
    });

  const busy = update.isPending || remove.isPending;
  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Edit lesson">
      <Field label="Lesson title" htmlFor="edit-lesson-title" required error={errors.title}>
        <TextInput
          id="edit-lesson-title"
          value={values.title}
          maxLength={200}
          aria-invalid={Boolean(errors.title)}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          autoFocus
        />
      </Field>
      <Field label="Objectives" htmlFor="edit-lesson-objectives" hint="One objective per line.">
        <TextArea
          id="edit-lesson-objectives"
          rows={3}
          value={values.objectives}
          onChange={(e) => setValues((v) => ({ ...v, objectives: e.target.value }))}
        />
      </Field>
      <Field
        label="Materials"
        htmlFor="edit-lesson-materials"
        error={errors.materials}
        hint="One per line as “label: value”, e.g. “workbook: Noorani Qaida page 1”."
      >
        <TextArea
          id="edit-lesson-materials"
          rows={2}
          value={values.materials}
          aria-invalid={Boolean(errors.materials)}
          onChange={(e) => setValues((v) => ({ ...v, materials: e.target.value }))}
        />
      </Field>
      <Field label="Teacher notes" htmlFor="edit-lesson-notes" hint="Shown to teachers only, with the next lesson.">
        <TextArea
          id="edit-lesson-notes"
          rows={4}
          value={values.teacherNotes}
          onChange={(e) => setValues((v) => ({ ...v, teacherNotes: e.target.value }))}
        />
      </Field>
      <div className="rounded-lg border border-line p-3 text-xs text-ink-2">
        {lesson.enrolmentCount > 0 ? (
          <p>
            {lesson.enrolmentCount === 1 ? '1 student is' : `${lesson.enrolmentCount} students are`} on this lesson, so it
            cannot be deleted. Move them to another lesson under Enrolments first.
          </p>
        ) : confirmingDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>Delete “{lesson.title}”? Later lessons move up one place.</span>
            <UiButton size="sm" variant="danger" onClick={doDelete} loading={remove.isPending}>
              Confirm delete
            </UiButton>
            <UiButton size="sm" variant="secondary" onClick={() => setConfirmingDelete(false)} disabled={remove.isPending}>
              Keep it
            </UiButton>
          </div>
        ) : (
          <UiButton size="sm" variant="secondary" onClick={() => setConfirmingDelete(true)} disabled={busy}>
            Delete lesson
          </UiButton>
        )}
      </div>
      <FormActions pending={update.isPending} onCancel={onDone} label="Save lesson" />
    </form>
  );
}
