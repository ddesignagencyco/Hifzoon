'use client';

import React, { useState } from 'react';
import { CONTENT_LOCALES } from '@/lib/api/modules/families';
import { FilterBar, FilterSelect } from '@/components/ui/FilterSelect';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Layers, Pencil, Plus } from 'lucide-react';
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  QueryState,
  StatusBadge,
  UiButton,
  humanize,
} from '@/components/ui/primitives';
import { useAdminCourses, useAdminCurriculum, useMoveLesson, useMoveLevel } from '@/hooks/useCoursesAdmin';
import { useToast } from '@/components/ui/toast';
import { CurriculumLesson, CurriculumLevel, objectivesToLines } from '@/lib/api/modules/courses-admin';
import { CourseLifecycleTable } from './CourseLifecycle';
import { AddLessonModal, AddLevelModal, CreateCourseModal, EditLessonModal, EditLevelModal } from './CourseForms';

/** /admin/courses — the course catalogue with its levels and lessons (FR-CRS-01). */
export function CoursesAdminScreen() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Courses"
        description="The course catalogue with each course's levels and lesson plans."
        actions={
          <UiButton icon={<Plus className="w-4 h-4" aria-hidden />} onClick={() => setCreating(true)}>
            New course
          </UiButton>
        }
      />
      <CourseLifecycleTable />
      <CreateCourseModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => router.push(`/admin/courses/${id}`)}
      />
    </>
  );
}

/**
 * /admin/courses/[courseId] — level → lesson tree. Admins add, rename and reorder levels;
 * add, edit (click the lesson), reorder and delete lessons.
 */
export function CourseDetailScreen({ courseId }: { courseId: string }) {
  const query = useAdminCurriculum(courseId);
  const [addingLevel, setAddingLevel] = useState(false);
  const [lessonLevel, setLessonLevel] = useState<{ id: string; name: string } | null>(null);
  const [editingLevel, setEditingLevel] = useState<CurriculumLevel | null>(null);
  const [editingLesson, setEditingLesson] = useState<{ lesson: CurriculumLesson; levelName: string } | null>(null);

  return (
    <>
      <Link href="/admin/courses" className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink mb-3">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> All courses
      </Link>
      <QueryState query={query} loadingLabel="Loading course…">
        {(course) => (
          <>
            <PageHeader
              eyebrow={humanize(course.type)}
              title={course.name}
              description={course.description}
              actions={
                <UiButton icon={<Layers className="w-4 h-4" aria-hidden />} onClick={() => setAddingLevel(true)}>
                  Add level
                </UiButton>
              }
            />
            <div className="flex flex-wrap items-center gap-3 mb-6 text-xs text-muted">
              <span>
                Code <code className="font-mono text-ink-2">{course.code}</code>
              </span>
              <StatusBadge status={course.active ? 'ACTIVE' : 'DISABLED'} />
              <span>Click a lesson to rename it, edit its objectives and notes, or delete it.</span>
            </div>
            {course.levels.length === 0 ? (
              <Card>
                <EmptyState
                  title="No levels yet"
                  description="Add the first level, then add lessons to it."
                  action={
                    <UiButton size="sm" onClick={() => setAddingLevel(true)}>
                      Add level
                    </UiButton>
                  }
                />
              </Card>
            ) : (
              <ol className="space-y-4" aria-label="Levels">
                {course.levels.map((level, index) => (
                  <LevelCard
                    key={level.id}
                    level={level}
                    isFirst={index === 0}
                    isLast={index === course.levels.length - 1}
                    onAddLesson={() => setLessonLevel({ id: level.id, name: level.name })}
                    onEdit={() => setEditingLevel(level)}
                    onEditLesson={(lesson) => setEditingLesson({ lesson, levelName: level.name })}
                  />
                ))}
              </ol>
            )}
            <AddLevelModal courseId={course.id} open={addingLevel} onClose={() => setAddingLevel(false)} />
            <AddLessonModal courseId={course.id} level={lessonLevel} onClose={() => setLessonLevel(null)} />
            <EditLevelModal level={editingLevel} onClose={() => setEditingLevel(null)} />
            <EditLessonModal
              // Take the lesson from the latest curriculum so uploaded files show up straight away.
              lesson={
                (editingLesson &&
                  course.levels.flatMap((l) => l.lessonTemplates).find((l) => l.id === editingLesson.lesson.id)) ||
                editingLesson?.lesson ||
                null
              }
              levelName={editingLesson?.levelName}
              onClose={() => setEditingLesson(null)}
            />
          </>
        )}
      </QueryState>
    </>
  );
}

function MoveButtons({
  label,
  isFirst,
  isLast,
  pending,
  onMove,
}: {
  label: string;
  isFirst: boolean;
  isLast: boolean;
  pending: boolean;
  onMove: (direction: 'up' | 'down') => void;
}) {
  const cls =
    'p-1 rounded-md text-muted hover:text-ink hover:bg-sand disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer';
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      <button type="button" className={cls} disabled={isFirst || pending} onClick={() => onMove('up')} aria-label={`Move ${label} up`}>
        <ArrowUp className="w-3.5 h-3.5" aria-hidden />
      </button>
      <button type="button" className={cls} disabled={isLast || pending} onClick={() => onMove('down')} aria-label={`Move ${label} down`}>
        <ArrowDown className="w-3.5 h-3.5" aria-hidden />
      </button>
    </span>
  );
}

function LevelCard({
  level,
  isFirst,
  isLast,
  onAddLesson,
  onEdit,
  onEditLesson,
}: {
  level: CurriculumLevel;
  isFirst: boolean;
  isLast: boolean;
  onAddLesson: () => void;
  onEdit: () => void;
  onEditLesson: (lesson: CurriculumLesson) => void;
}) {
  const toast = useToast();
  const moveLevel = useMoveLevel();
  const moveLesson = useMoveLesson();
  const [open, setOpen] = useState(true);
  const panelId = `level-panel-${level.id}`;
  const lessons = level.lessonTemplates;
  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex items-center gap-2 text-left cursor-pointer min-w-0"
          >
            {open ? <ChevronDown className="w-4 h-4 text-muted shrink-0" aria-hidden /> : <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden />}
            <span className="w-7 h-7 rounded-lg bg-green-50 text-green-700 text-xs font-semibold flex items-center justify-center shrink-0">
              {level.position}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{level.name}</span>
              <span className="block text-[11px] text-muted">
                {lessons.length} lesson{lessons.length === 1 ? '' : 's'} · pass mark {level.passMark}
                {level.rubric ? ' · rubric set' : ''}
                {level.enrolmentCount > 0 ? ` · ${level.enrolmentCount} student${level.enrolmentCount === 1 ? '' : 's'}` : ''}
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <MoveButtons
              label={`level ${level.name}`}
              isFirst={isFirst}
              isLast={isLast}
              pending={moveLevel.isPending}
              onMove={(direction) =>
                moveLevel.mutate({ levelId: level.id, direction }, { onError: (err) => toast.error(err) })
              }
            />
            <UiButton size="sm" variant="ghost" icon={<Pencil className="w-3.5 h-3.5" aria-hidden />} onClick={onEdit} aria-label={`Edit level ${level.name}`}>
              Edit level
            </UiButton>
            <UiButton size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" aria-hidden />} onClick={onAddLesson}>
              Add lesson
            </UiButton>
          </div>
        </div>
        {open && (
          <div id={panelId} className="border-t border-line px-5 py-3">
            {lessons.length === 0 ? (
              <p className="text-xs text-muted py-2">No lessons in this level yet.</p>
            ) : (
              <ol className="divide-y divide-line/70">
                {lessons.map((lesson, index) => {
                  const objectives = objectivesToLines(lesson.objectives);
                  const materials = materialsToPairs(lesson.materials);
                  return (
                    <li key={lesson.id} className="py-1.5 flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => onEditLesson(lesson)}
                        className="flex-1 min-w-0 flex gap-3 text-left rounded-lg px-2 py-1 hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 cursor-pointer"
                        aria-label={`Edit lesson ${lesson.position}: ${lesson.title}`}
                      >
                        <span className="text-[11px] font-semibold text-muted tabular-nums w-6 shrink-0 pt-0.5">{lesson.position}.</span>
                        <span className="min-w-0 block">
                          <span className="block text-sm text-ink">
                            {lesson.title}
                            {lesson.enrolmentCount > 0 && (
                              <span className="ml-2 text-[11px] text-muted">
                                · {lesson.enrolmentCount} student{lesson.enrolmentCount === 1 ? '' : 's'} on it
                              </span>
                            )}
                          </span>
                          {objectives.length > 0 && (
                            <span className="mt-1 block text-xs text-ink-2">{objectives.join(' · ')}</span>
                          )}
                          {materials.length > 0 && (
                            <span className="mt-0.5 block text-xs text-muted">
                              {materials.map(([label, value]) => `${label}: ${value}`).join(' · ')}
                            </span>
                          )}
                          {lesson.teacherNotes && (
                            <span className="block text-[11px] text-muted mt-1 whitespace-pre-wrap">Notes: {lesson.teacherNotes}</span>
                          )}
                        </span>
                      </button>
                      <MoveButtons
                        label={`lesson ${lesson.title}`}
                        isFirst={index === 0}
                        isLast={index === lessons.length - 1}
                        pending={moveLesson.isPending}
                        onMove={(direction) =>
                          moveLesson.mutate({ lessonId: lesson.id, direction }, { onError: (err) => toast.error(err) })
                        }
                      />
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </Card>
    </li>
  );
}

/** Reads `[courseId]` from the URL; rendered inside a Suspense boundary (Cache Components). */
export function CourseDetailRoute() {
  const params = useParams<{ courseId: string }>();
  return <CourseDetailScreen courseId={params.courseId} />;
}

/** Lesson materials (`{ label: value }`, as saved by the lesson form) as display pairs. */
export function materialsToPairs(materials: unknown): Array<[string, string]> {
  if (!materials || typeof materials !== 'object' || Array.isArray(materials)) return [];
  return Object.entries(materials as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]);
}
