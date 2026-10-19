'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  ChevronDown, 
  ChevronRight,
  Layers, 
  Loader2, 
  BookOpen, 
  ShieldCheck, 
  Award, 
  Clock, 
  CheckCircle2, 
  Sparkles,
  Users,
  GraduationCap
} from 'lucide-react';
import { Button } from '@/components/landing/Button';
import { useCourseDetail } from '@/hooks/useContent';
import { ApiClientError } from '@/lib/api/http';
import { LoadErrorToast } from './LoadErrorToast';
import { CourseLevelDetail, materialsList, objectivesList } from '@/lib/api/modules/content-public';

function humanizeKey(key: string): string {
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Course syllabus from `GET /courses/:id`: levels, pass marks and lesson plan. Full-width, high-aesthetic layout. */
export function CourseDetailView({ code }: { code: string }) {
  const query = useCourseDetail(code);
  const [expandAll, setExpandAll] = useState(false);

  if (query.isLoading) {
    return (
      <div role="status" className="py-32 flex flex-col justify-center items-center gap-3 text-sm text-[#6b7772]">
        <Loader2 className="w-6 h-6 animate-spin text-[#c49a55]" aria-hidden /> 
        <span>Loading course syllabus…</span>
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
    <div>
      {/* Full-Width Grand Hero Section */}
      <section className="bg-[#0f2c24] text-white py-14 md:py-20 relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none" aria-hidden="true" />
        <div className="site-container relative z-10">
          
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#c4d3cd] mb-6">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            <Link href="/courses" className="hover:text-white transition-colors">Courses</Link>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            <span className="text-[#c49a55] font-medium truncate max-w-[200px] sm:max-w-none">{course.name}</span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
            <div className="max-w-3xl space-y-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#c49a55]">
                {course.code.replace(/_/g, ' ')}
              </div>

              <h1 className="font-fraunces text-3xl sm:text-5xl lg:text-6xl font-normal tracking-tight text-white leading-[1.1]">
                {course.name}
              </h1>

              <p className="text-[#c4d3cd] text-base md:text-lg leading-relaxed max-w-2xl">
                {course.description}
              </p>

              {/* Key Highlights Chips */}
              <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-white border border-white/10">
                  <Layers className="w-3.5 h-3.5 text-[#c49a55]" aria-hidden /> 
                  <strong className="text-white font-semibold">{course.levels.length}</strong> Curriculum Level{course.levels.length === 1 ? '' : 's'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-white border border-white/10">
                  <BookOpen className="w-3.5 h-3.5 text-[#c49a55]" aria-hidden /> 
                  <strong className="text-white font-semibold">{lessonTotal}</strong> Structured Lesson{lessonTotal === 1 ? '' : 's'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-white border border-white/10">
                  <Users className="w-3.5 h-3.5 text-[#c49a55]" aria-hidden /> 
                  1-on-1 &amp; Small Circles
                </span>
                {!course.active && (
                  <span className="rounded-full bg-[#c49a55]/20 text-[#c49a55] border border-[#c49a55]/30 px-3 py-1 font-semibold">
                    Waitlist Only
                  </span>
                )}
              </div>
            </div>

            {/* Quick Hero Action */}
            {course.active && (
              <div className="shrink-0 flex flex-col sm:flex-row lg:flex-col gap-3">
                <Button 
                  variant="gold" 
                  href={`/book-trial?course=${encodeURIComponent(course.code)}`}
                  className="font-semibold shadow-lg text-sm px-6 py-3"
                >
                  Book a free trial for this course
                </Button>
                <a 
                  href="#curriculum" 
                  className="inline-flex items-center justify-center gap-1.5 text-xs text-[#c4d3cd] hover:text-white transition-colors py-1"
                >
                  Browse syllabus below <ChevronDown className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>

        </div>
      </section>

      {/* Full-Width Main Content Layout */}
      <div className="site-container py-12 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Main Syllabus and Pedagogy Column (8 cols) */}
          <div className="lg:col-span-8 space-y-10">
            
            {/* Pedagogy & Methodology Card */}
            <div className="bg-white rounded-[28px] border border-[#e6dfd1] p-6 sm:p-8 shadow-card space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#f0f6f3] flex items-center justify-center text-[#143a2f] border border-[#c4d3cd]">
                  <GraduationCap className="w-5 h-5 text-[#143a2f]" />
                </div>
                <div>
                  <h3 className="font-fraunces text-xl text-[#10201b]">Academic Approach &amp; Standards</h3>
                  <p className="text-xs text-[#6b7772]">Sanad-grounded pedagogy supervised by certified scholars</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] space-y-1.5">
                  <h4 className="font-semibold text-xs text-[#10201b] uppercase tracking-wider">Azhari &amp; Madani Oversight</h4>
                  <p className="text-xs text-[#6b7772] leading-relaxed">
                    Curriculum structured according to classical Tajweed treatises (Al-Jazariyyah &amp; Tuhfat al-Atfal).
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] space-y-1.5">
                  <h4 className="font-semibold text-xs text-[#10201b] uppercase tracking-wider">3-Phase Daily Loop</h4>
                  <p className="text-xs text-[#6b7772] leading-relaxed">
                    Every lesson includes Sabaq (new portion), Sabqi (recent retention), and Manzil (cumulative revision).
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] space-y-1.5">
                  <h4 className="font-semibold text-xs text-[#10201b] uppercase tracking-wider">Verified Portal Logs</h4>
                  <p className="text-xs text-[#6b7772] leading-relaxed">
                    Lesson records with exact verse timestamps, audio notes, and teacher feedback in your parent portal.
                  </p>
                </div>
              </div>
            </div>

            {/* Syllabus Section */}
            <section id="curriculum" aria-labelledby="syllabus-heading" className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#e6dfd1]">
                <div>
                  <h2 id="syllabus-heading" className="font-fraunces text-2xl sm:text-3xl text-[#10201b]">
                    Curriculum &amp; Level Syllabus
                  </h2>
                  <p className="text-xs text-[#6b7772] mt-1">
                    Structured milestone progression with oral examination at each level
                  </p>
                </div>

                {course.levels.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpandAll((v) => !v)}
                    className="text-xs font-semibold text-[#143a2f] hover:text-[#c49a55] transition-colors underline cursor-pointer self-start sm:self-auto"
                  >
                    {expandAll ? 'Collapse all levels' : 'Expand all levels'}
                  </button>
                )}
              </div>

              {course.levels.length === 0 ? (
                <div className="bg-white rounded-[24px] border border-[#e6dfd1] p-8 text-center text-sm text-[#6b7772]">
                  The syllabus and level breakdown for this course is being finalised by our Academic Board.
                </div>
              ) : (
                <ol className="space-y-5">
                  {course.levels.map((level, i) => (
                    <LevelPanel 
                      key={level.id} 
                      level={level} 
                      defaultOpen={i === 0 || expandAll} 
                      forceState={expandAll}
                    />
                  ))}
                </ol>
              )}
            </section>

            {/* Graduation & Certification Outcomes */}
            <div className="bg-gradient-to-r from-[#f6ecd9]/60 to-[#faf7f1] rounded-[28px] border border-[#e6dfd1] p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white border border-[#c49a55] flex items-center justify-center text-[#c49a55] shrink-0 shadow-2xs">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-fraunces text-lg text-[#10201b]">Course Completion Certificate</h3>
                  <p className="text-xs text-[#6b7772] leading-relaxed mt-1 max-w-lg">
                    Students completing all levels with passing oral marks receive an official Academy Certificate signed by our Senior Academic Dean and their instructor.
                  </p>
                </div>
              </div>
              <Button 
                variant="green" 
                size="sm" 
                href={`/book-trial?course=${encodeURIComponent(course.code)}`}
                className="shrink-0 font-semibold"
              >
                Enroll Child Now
              </Button>
            </div>

          </div>

          {/* Sticky Sidebar (4 cols) */}
          <aside className="lg:col-span-4 sticky top-24 space-y-6">
            
            {/* Enrollment Trial Box */}
            <div className="bg-[#0f2c24] text-white rounded-[28px] p-6 sm:p-7 shadow-card border border-[#143a2f] relative overflow-hidden">
              <div className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none" aria-hidden="true" />
              
              <div className="relative z-10 space-y-5">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#c49a55] block mb-1">
                    Free Evaluation Session
                  </span>
                  <h3 className="font-fraunces text-2xl font-normal text-white">
                    Start Your Child&apos;s Journey
                  </h3>
                  <p className="text-xs text-[#c4d3cd] mt-1.5 leading-relaxed">
                    Begin with an obligation-free 30-minute academic assessment with a vetted scholar.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-[#c4d3cd]">
                    <CheckCircle2 className="w-4 h-4 text-[#c49a55] shrink-0" />
                    <span>Live 1-on-1 recitation diagnostic</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#c4d3cd]">
                    <CheckCircle2 className="w-4 h-4 text-[#c49a55] shrink-0" />
                    <span>Male or female teacher preference</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#c4d3cd]">
                    <CheckCircle2 className="w-4 h-4 text-[#c49a55] shrink-0" />
                    <span>Personalized level placement recommendation</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#c4d3cd]">
                    <CheckCircle2 className="w-4 h-4 text-[#c49a55] shrink-0" />
                    <span>No credit card required to book</span>
                  </div>
                </div>

                {course.active ? (
                  <Button
                    variant="gold"
                    href={`/book-trial?course=${encodeURIComponent(course.code)}`}
                    className="w-full font-semibold text-sm py-3 justify-center"
                  >
                    Book Free 30-Min Trial
                  </Button>
                ) : (
                  <Button
                    variant="gold"
                    href="/book-trial"
                    className="w-full font-semibold text-sm py-3 justify-center"
                  >
                    Join Course Waitlist
                  </Button>
                )}

                <p className="text-[11px] text-center text-[#c4d3cd]">
                  14-day full satisfaction guarantee upon enrollment
                </p>
              </div>
            </div>

            {/* Safeguarding & Trust Summary Card */}
            <div className="bg-white rounded-[28px] border border-[#e6dfd1] p-6 shadow-card space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-[#f3eee4]">
                <ShieldCheck className="w-5 h-5 text-[#143a2f]" />
                <h4 className="font-semibold text-sm text-[#10201b]">Safeguarding Promise</h4>
              </div>

              <div className="space-y-3 text-xs text-[#3c4a45]">
                <div className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a97f3c] mt-1.5 shrink-0" />
                  <p>
                    <strong>100% ID &amp; Background Checked:</strong> All instructors are vetted through UK DBS or equivalent national background checks.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a97f3c] mt-1.5 shrink-0" />
                  <p>
                    <strong>Audited Classroom Recordings:</strong> Review recordings of your child&apos;s classes anytime in the parent portal.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a97f3c] mt-1.5 shrink-0" />
                  <p>
                    <strong>Zero Toleration Policy:</strong> Compliant with UK Children&apos;s Code &amp; US COPPA standards.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Link 
                  href="/child-safety" 
                  className="text-xs font-semibold text-[#143a2f] hover:underline inline-flex items-center gap-1"
                >
                  Read our Child Safeguarding Code <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Quick Questions Helpline */}
            <div className="bg-[#faf7f1] rounded-[24px] border border-[#e6dfd1] p-5 text-center space-y-2">
              <p className="text-xs font-semibold text-[#10201b]">Have questions about this course?</p>
              <p className="text-[11px] text-[#6b7772]">
                Our admissions advisors are here to help match your child to the right level.
              </p>
              <div className="pt-1">
                <Link 
                  href="/resources" 
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#143a2f] hover:underline"
                >
                  View FAQs or submit an inquiry
                </Link>
              </div>
            </div>

          </aside>

        </div>
      </div>
    </div>
  );
}

function LevelPanel({ 
  level, 
  defaultOpen, 
  forceState 
}: { 
  level: CourseLevelDetail; 
  defaultOpen: boolean; 
  forceState?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  React.useEffect(() => {
    if (forceState !== undefined) {
      setOpen(forceState);
    }
  }, [forceState]);

  const panelId = `level-${level.id}`;
  const rubric = level.rubric && typeof level.rubric === 'object'
    ? (Object.entries(level.rubric).filter(([, v]) => typeof v === 'number') as Array<[string, number]>)
    : [];

  return (
    <li className="bg-white rounded-[24px] border border-[#e6dfd1] shadow-card overflow-hidden transition-all hover:border-[#c49a55]/60">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-4 p-5 sm:p-6 text-left cursor-pointer hover:bg-[#faf7f1]/50 transition-colors"
        >
          <div className="flex items-start sm:items-center gap-4">
            <span className="w-9 h-9 rounded-xl bg-[#f0f6f3] border border-[#c4d3cd] flex items-center justify-center font-fraunces text-sm font-semibold text-[#143a2f] shrink-0">
              {level.position}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a97f3c]">
                  Level {level.position}
                </span>
                {level.passMark !== null && (
                  <span className="px-2 py-0.5 rounded-full bg-[#f6ecd9] text-[#a97f3c] text-[10px] font-semibold">
                    Pass mark: {level.passMark}%
                  </span>
                )}
              </div>
              <h4 className="font-fraunces text-lg sm:text-xl text-[#10201b]">{level.name}</h4>
              <p className="text-xs text-[#6b7772] mt-0.5">
                {level.lessonTemplates.length} structured lesson{level.lessonTemplates.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="w-8 h-8 rounded-full bg-[#faf7f1] border border-[#e6dfd1] flex items-center justify-center shrink-0">
            <ChevronDown className={`w-4 h-4 text-[#143a2f] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
          </div>
        </button>
      </h3>

      {open && (
        <div id={panelId} className="px-5 sm:px-8 pb-7 space-y-6 pt-2 border-t border-[#f3eee4]">
          {rubric.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1]">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#10201b] mb-1.5">
                Oral Assessment Criteria:
              </span>
              <div className="flex flex-wrap gap-2">
                {rubric.map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#e6dfd1] text-xs font-medium text-[#3c4a45]">
                    <span>{humanizeKey(k)}</span>
                    <strong className="text-[#143a2f] font-semibold">{v}%</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {level.lessonTemplates.length === 0 ? (
            <p className="text-sm text-[#6b7772] py-2">Lessons for this level are being prepared.</p>
          ) : (
            <ol className="divide-y divide-[#f3eee4]">
              {level.lessonTemplates.map((lesson) => {
                const objectives = objectivesList(lesson.objectives);
                const materials = materialsList(lesson.materials);
                return (
                  <li key={lesson.id} className="py-4 first:pt-1">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-[#f6ecd9] text-[#a97f3c] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                        {lesson.position}
                      </span>
                      <div className="space-y-1.5 flex-1">
                        <p className="text-sm font-semibold text-[#10201b]">
                          {lesson.title}
                        </p>
                        {objectives.length > 0 && (
                          <ul className="text-xs text-[#3c4a45] space-y-1">
                            {objectives.map((o) => (
                              <li key={o} className="flex items-start gap-2">
                                <span className="text-[#a97f3c] leading-none mt-1">▪</span>
                                <span>{o}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {materials.length > 0 && (
                          <p className="text-[11px] text-[#6b7772] font-medium bg-[#faf7f1] px-2.5 py-1 rounded-md inline-block mt-1">
                            Text &amp; Resources: {materials.join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
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
