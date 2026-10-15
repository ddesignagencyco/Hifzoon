'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, Layers, Loader2 } from 'lucide-react';
import { Button } from '@/components/landing/Button';
import { useCourseDetail } from '@/hooks/useContent';
import { ApiClientError } from '@/lib/api/http';
import { LoadErrorToast } from './LoadErrorToast';
import { CourseLevelDetail, materialsList, objectivesList } from '@/lib/api/modules/content-public';

function humanizeKey(key: string): string {
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Course syllabus from `GET /courses/:id`: levels, pass marks and lesson plan. */
export function CourseDetailView({ code }: { code: string }) {
  const query = useCourseDetail(code);

  if (query.isLoading) {
    return (
      <div role="status" className="py-24 flex justify-center items-center gap-2 text-sm text-[#6b7772]">
        <Loader2 className="w-5 h-5 animate-spin text-[#c49a55]" aria-hidden /> Loading course…
      </div>
    );
  }

  if (query.isError || !query.data) {
    const notFound = query.error instanceof ApiClientError && query.error.status === 404;
    return (
      <div className="max-w-xl mx-auto py-24 px-4 text-center space-y-4">
        <h1 className="font-fraunces text-3xl text-[#10201b]">{notFound ? 'Course not found' : 'Could not load this course'}</h1>
        {notFound && <p className="text-sm text-[#6b7772]">It may have been renamed or retired.</p>}
        {!notFound && query.isError && <LoadErrorToast error={query.error} />}
        <div className="flex justify-center gap-3">
          {!notFound && (
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Try again
            </Button>
          )}
          <Button variant="green" size="sm" href="/courses">
            All courses
          </Button>
        </div>
      </div>
    );
  }

  const course = query.data;
  const lessonTotal = course.levels.reduce((n, l) => n + l.lessonTemplates.length, 0);

  return (
    <>
      <section className="bg-[#0f2c24] text-white py-14 md:py-20 px-4 sm:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none" aria-hidden="true" />
        <div className="max-w-[1100px] mx-auto relative z-10">
          <Link href="/courses" className="inline-flex items-center gap-1.5 text-xs text-[#c4d3cd] hover:text-white mb-5">
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> All courses
          </Link>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#c49a55] mb-2">{course.code.replace(/_/g, ' ')}</p>
          <h1 className="font-fraunces text-3xl sm:text-5xl font-normal tracking-tight mb-4">{course.name}</h1>
          <p className="text-[#c4d3cd] text-base md:text-lg max-w-2xl leading-relaxed">{course.description}</p>
          <div className="flex flex-wrap items-center gap-3 mt-6 text-xs text-[#c4d3cd]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">
              <Layers className="w-3.5 h-3.5 text-[#c49a55]" aria-hidden /> {course.levels.length} level{course.levels.length === 1 ? '' : 's'}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1">
              {lessonTotal} planned lesson{lessonTotal === 1 ? '' : 's'}
            </span>
            {!course.active && <span className="rounded-full bg-[#c49a55]/20 text-[#c49a55] px-3 py-1">Not currently enrolling</span>}
          </div>
          {course.active && (
            <div className="mt-8">
              <Button variant="gold" href={`/book-trial?course=${encodeURIComponent(course.code)}`}>
                Book a free trial for this course
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className="max-w-[1100px] mx-auto px-4 sm:px-8 py-12 md:py-16">
        <h2 className="font-fraunces text-2xl sm:text-3xl text-[#10201b] mb-6">Syllabus</h2>
        {course.levels.length === 0 ? (
          <p className="text-sm text-[#6b7772]">The level plan for this course is being prepared.</p>
        ) : (
          <ol className="space-y-4">
            {course.levels.map((level, i) => (
              <LevelPanel key={level.id} level={level} defaultOpen={i === 0} />
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

function LevelPanel({ level, defaultOpen }: { level: CourseLevelDetail; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `level-${level.id}`;
  const rubric = level.rubric && typeof level.rubric === 'object'
    ? Object.entries(level.rubric).filter(([, v]) => typeof v === 'number')
    : [];

  return (
    <li className="bg-white rounded-[24px] border border-[#e6dfd1] shadow-card overflow-hidden">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-4 p-5 sm:p-6 text-left cursor-pointer"
        >
          <span>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-[#a97f3c]">Level {level.position}</span>
            <span className="block font-fraunces text-xl text-[#10201b]">{level.name}</span>
            <span className="block text-xs text-[#6b7772] mt-0.5">
              {level.lessonTemplates.length} lesson{level.lessonTemplates.length === 1 ? '' : 's'}
              {level.passMark !== null && ` · pass mark ${level.passMark}%`}
            </span>
          </span>
          <ChevronDown className={`w-5 h-5 text-[#6b7772] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h3>
      {open && (
        <div id={panelId} className="px-5 sm:px-6 pb-6 space-y-5">
          {rubric.length > 0 && (
            <p className="text-xs text-[#3c4a45]">
              <span className="font-semibold">Assessed on: </span>
              {rubric.map(([k, v]) => `${humanizeKey(k)} ${v}%`).join(' · ')}
            </p>
          )}
          {level.lessonTemplates.length === 0 ? (
            <p className="text-sm text-[#6b7772]">Lessons for this level are being prepared.</p>
          ) : (
            <ol className="divide-y divide-[#f3eee4] border-t border-[#f3eee4]">
              {level.lessonTemplates.map((lesson) => {
                const objectives = objectivesList(lesson.objectives);
                const materials = materialsList(lesson.materials);
                return (
                  <li key={lesson.id} className="py-3.5">
                    <p className="text-sm font-semibold text-[#10201b]">
                      <span className="text-[#a97f3c] mr-2 tabular-nums">{lesson.position}.</span>
                      {lesson.title}
                    </p>
                    {objectives.length > 0 && (
                      <ul className="mt-1.5 ml-6 list-disc text-xs text-[#3c4a45] space-y-0.5">
                        {objectives.map((o) => (
                          <li key={o}>{o}</li>
                        ))}
                      </ul>
                    )}
                    {materials.length > 0 && <p className="mt-1 ml-6 text-[11px] text-[#6b7772]">{materials.join(' · ')}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}
