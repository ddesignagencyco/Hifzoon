'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronRight, Layers, Plus } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  PageHeader,
  QueryState,
  StatusBadge,
  Tabs,
  TextInput,
  UiButton,
  humanize,
} from '@/components/ui/primitives';
import { useAdminCourse, useAdminCourses } from '@/hooks/useCoursesAdmin';
import { CourseLevel, objectivesToLines } from '@/lib/api/modules/courses-admin';
import { AddLessonModal, AddLevelModal, CreateCourseModal } from './CourseForms';
import { EnrolmentsPanel } from './EnrolmentsPanel';
import { CopyId } from '../system/shared';

type Tab = 'catalogue' | 'enrolments';

/** /admin/courses — catalogue + enrolments (FR-CRS-01, FR-CRS-02). */
export function CoursesAdminScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('catalogue');
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Courses"
        description="Course catalogue, level and lesson plans, and student enrolments."
        actions={
          <UiButton icon={<Plus className="w-4 h-4" aria-hidden />} onClick={() => setCreating(true)}>
            New course
          </UiButton>
        }
      />
      <Tabs<Tab>
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'catalogue', label: 'Catalogue' },
          { value: 'enrolments', label: 'Enrolments' },
        ]}
      />
      {tab === 'catalogue' ? <CatalogueTable /> : <EnrolmentsPanel />}
      <CreateCourseModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => router.push(`/admin/courses/${id}`)}
      />
    </>
  );
}

function CatalogueTable() {
  const router = useRouter();
  const [locale, setLocale] = useState('en');
  const query = useAdminCourses(locale.trim() || 'en');

  return (
    <Card>
      <CardHeader
        title="Catalogue"
        description="Active courses for the chosen locale."
        action={
          <div className="w-28">
            <Field label="Locale" htmlFor="course-locale-filter">
              <TextInput id="course-locale-filter" value={locale} maxLength={5} onChange={(e) => setLocale(e.target.value)} />
            </Field>
          </div>
        }
      />
      <CardBody className="px-0 sm:px-5">
        <QueryState query={query} empty={<EmptyState title="No active courses in this locale" />}>
          {(courses) => (
            <DataTable
              rows={courses}
              rowKey={(c) => c.id}
              onRowClick={(c) => router.push(`/admin/courses/${c.id}`)}
              columns={[
                {
                  key: 'name',
                  header: 'Course',
                  render: (c) => (
                    <div className="min-w-[160px]">
                      <Link
                        href={`/admin/courses/${c.id}`}
                        className="font-medium text-ink hover:text-green-700 focus-visible:outline-none focus-visible:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.name}
                      </Link>
                      <p className="text-[11px] text-muted font-mono">{c.code}</p>
                    </div>
                  ),
                },
                { key: 'type', header: 'Type', render: (c) => <Badge>{humanize(c.type)}</Badge> },
                { key: 'levels', header: 'Levels', className: 'tabular-nums', render: (c) => c.levels.length },
                {
                  key: 'lessons',
                  header: 'Lessons',
                  className: 'tabular-nums',
                  render: (c) => c.levels.reduce((sum, l) => sum + l.lessonCount, 0),
                },
                {
                  key: 'description',
                  header: 'Description',
                  render: (c) => <p className="text-xs line-clamp-2 max-w-md">{c.description}</p>,
                },
              ]}
            />
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}

/** /admin/courses/[courseId] — level → lesson tree with add level / add lesson. */
export function CourseDetailScreen({ courseId }: { courseId: string }) {
  const query = useAdminCourse(courseId);
  const [addingLevel, setAddingLevel] = useState(false);
  const [lessonLevel, setLessonLevel] = useState<{ id: string; name: string } | null>(null);

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
              <CopyId value={course.id} label="course ID" />
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
                {course.levels.map((level) => (
                  <LevelCard key={level.id} level={level} onAddLesson={() => setLessonLevel({ id: level.id, name: level.name })} />
                ))}
              </ol>
            )}
            <AddLevelModal courseId={course.id} open={addingLevel} onClose={() => setAddingLevel(false)} />
            <AddLessonModal courseId={course.id} level={lessonLevel} onClose={() => setLessonLevel(null)} />
          </>
        )}
      </QueryState>
    </>
  );
}

function LevelCard({ level, onAddLesson }: { level: CourseLevel; onAddLesson: () => void }) {
  const [open, setOpen] = useState(true);
  const panelId = `level-panel-${level.id}`;
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
                {level.lessonTemplates.length} lesson{level.lessonTemplates.length === 1 ? '' : 's'} · pass mark {level.passMark}
                {level.rubric ? ' · rubric set' : ''}
              </span>
            </span>
          </button>
          <UiButton size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" aria-hidden />} onClick={onAddLesson}>
            Add lesson
          </UiButton>
        </div>
        {open && (
          <div id={panelId} className="border-t border-line px-5 py-3">
            {level.lessonTemplates.length === 0 ? (
              <p className="text-xs text-muted py-2">No lessons in this level yet.</p>
            ) : (
              <ol className="divide-y divide-line/70">
                {level.lessonTemplates.map((lesson) => {
                  const objectives = objectivesToLines(lesson.objectives);
                  return (
                    <li key={lesson.id} className="py-2.5 flex gap-3">
                      <span className="text-[11px] font-semibold text-muted tabular-nums w-6 shrink-0 pt-0.5">{lesson.position}.</span>
                      <div className="min-w-0">
                        <p className="text-sm text-ink">{lesson.title}</p>
                        {objectives.length > 0 && (
                          <ul className="mt-1 list-disc pl-4 text-xs text-ink-2 space-y-0.5">
                            {objectives.map((o, i) => (
                              <li key={i}>{o}</li>
                            ))}
                          </ul>
                        )}
                        {materialsToPairs(lesson.materials).length > 0 && (
                          <ul className="mt-1 text-xs text-ink-2 space-y-0.5" aria-label="Materials">
                            {materialsToPairs(lesson.materials).map(([label, value]) => (
                              <li key={label}>
                                <span className="text-muted">{label}:</span>{' '}
                                {/^https?:\/\//i.test(value) ? (
                                  <a href={value} target="_blank" rel="noopener noreferrer" className="text-gold underline break-all">
                                    {value}
                                  </a>
                                ) : (
                                  value
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {lesson.teacherNotes && (
                          <p className="text-[11px] text-muted mt-1 whitespace-pre-wrap">Notes: {lesson.teacherNotes}</p>
                        )}
                      </div>
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
