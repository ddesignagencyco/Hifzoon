'use client';

import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, Loader2, LogIn, UserPlus } from 'lucide-react';
import { Alert, ErrorState } from '@/components/ui/primitives';
import { Button } from '@/components/landing/Button';
import { useAuth } from '@/hooks/useAuth';
import { useCourses } from '@/hooks/useCourses';
import { useTeachers } from '@/hooks/useTeachers';
import { useOpenSlots, useSubjectTeachers } from '@/hooks/useBooking';
import {
  BookedClass,
  BookingSelection,
  FamilyStudent,
  OpenSlot,
  TRIAL_DURATION_MINUTES,
  bookingPath,
  buildIcs,
  formatSlotFull,
  isValidTimeZone,
  searchWindow,
} from '@/lib/api/modules/public-booking';
import { Role } from '@/lib/types';
import { LearnerStep } from './LearnerStep';
import { SlotPicker, TimezoneSelect, slotKey } from './SlotPicker';
import { Select } from '@/components/ui/select';

type Step = 'details' | 'time' | 'learner' | 'done';

const LANGUAGES = [
  { code: '', label: 'Any language' },
  { code: 'en', label: 'English' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ar', label: 'Arabic' },
];

interface ChosenSlot {
  teacherId: string;
  teacherName: string;
  startsAt: string;
  endsAt: string;
}

/**
 * Real trial booking: course → real open slot in the visitor's zone → guardian sign-in
 * (selection preserved in the URL) → family / learner / consent → `POST /scheduling/book`.
 * Full-width responsive layout with sticky sidebars.
 */
export function BookingFlow({ initial, detectedZone }: { initial: BookingSelection; detectedZone: string }) {
  const { courses } = useCourses();
  const { currentUser, isAuthenticated, isLoading: authLoading } = useAuth();

  const initialSlot: ChosenSlot | null =
    initial.slotTeacher && initial.slotStart
      ? {
          teacherId: initial.slotTeacher,
          teacherName: initial.slotTeacherName ?? 'Your teacher',
          startsAt: initial.slotStart,
          endsAt:
            initial.slotEnd ?? new Date(new Date(initial.slotStart).getTime() + TRIAL_DURATION_MINUTES * 60_000).toISOString(),
        }
      : null;

  const [courseCode, setCourseCode] = useState(initial.course?.toUpperCase() ?? '');
  const [gender, setGender] = useState<'' | 'MALE' | 'FEMALE'>(initial.gender ?? '');
  const [language, setLanguage] = useState(initial.language ?? '');
  const [teacherFilter, setTeacherFilter] = useState(initial.teacher ?? '');
  const { allTeachers } = useTeachers();
  const [timeZone, setTimeZone] = useState(initial.tz && isValidTimeZone(initial.tz) ? initial.tz : detectedZone);
  const [slot, setSlot] = useState<ChosenSlot | null>(initialSlot);
  const [step, setStep] = useState<Step>(initialSlot && initial.course ? 'learner' : 'details');
  const [booked, setBooked] = useState<{ cls: BookedClass; learner: FamilyStudent } | null>(null);

  const course = courses.find((c) => c.code.toUpperCase() === courseCode);
  // Teachers who teach the chosen course (and match the Ustadh/Ustadha choice). A teacher
  // picked from /teachers (?teacher=) stays listed even if the filters would hide them.
  const teacherOptions = useMemo(() => {
    const matching = allTeachers.filter(
      (t) =>
        (!courseCode || t.specializations.map((x) => x.toUpperCase()).includes(courseCode)) &&
        (!gender || t.gender === gender),
    );
    const picked = teacherFilter ? allTeachers.find((t) => t.id === teacherFilter) : undefined;
    return picked && !matching.some((t) => t.id === picked.id) ? [picked, ...matching] : matching;
  }, [allTeachers, courseCode, gender, teacherFilter]);
  const selection: BookingSelection = {
    course: courseCode || undefined,
    teacher: teacherFilter || undefined,
    gender: gender || undefined,
    language: language || undefined,
    tz: timeZone,
    slotTeacher: slot?.teacherId,
    slotTeacherName: slot?.teacherName,
    slotStart: slot?.startsAt,
    slotEnd: slot?.endsAt,
  };

  const steps: Array<[Step, string]> = [
    ['details', '1. Select Pathway'],
    ['time', '2. Pick Time'],
    ['learner', '3. Confirm Learner'],
  ];
  const stepIndex = steps.findIndex(([s]) => s === step);

  return (
    <div className="site-container py-10 md:py-14">
      {/* Top Multi-Step Progress Tracker */}
      {step !== 'done' && (
        <div className="mb-10 max-w-3xl mx-auto">
          <ol className="grid grid-cols-3 text-center text-xs sm:text-sm font-semibold text-[#6b7772] mb-3">
            {steps.map(([s, label], i) => (
              <li
                key={s}
                aria-current={s === step ? 'step' : undefined}
                className={`flex items-center justify-center gap-2 transition-colors ${
                  i <= stepIndex ? 'text-[#143a2f] font-bold' : 'text-[#6b7772]/70'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
                    i < stepIndex
                      ? 'bg-[#143a2f] text-white'
                      : i === stepIndex
                      ? 'bg-[#c49a55] text-white ring-4 ring-[#c49a55]/20 font-bold'
                      : 'bg-[#e6dfd1] text-[#6b7772]'
                  }`}
                >
                  {i < stepIndex ? '✓' : i + 1}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </li>
            ))}
          </ol>
          <div className="w-full bg-[#e6dfd1] h-2 rounded-full overflow-hidden" aria-hidden>
            <div
              className="bg-gradient-to-r from-[#143a2f] to-[#c49a55] h-full transition-all duration-300 rounded-full"
              style={{ width: `${((stepIndex + 1) / 3) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Step 1: Course Selection & Preferences */}
      {step === 'details' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (course) setStep('time');
          }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
        >
          {/* Main Course Selection Area (8 columns on lg) */}
          <div className="lg:col-span-8 bg-white rounded-[28px] border border-[#e6dfd1] p-6 sm:p-10 shadow-card space-y-6">
            <StepHeading
              step="Step 1 of 3"
              title="Choose an Academic Pathway"
              text="Select the Quranic curriculum tailored to your child or your own study goals. Every pathway includes one-on-one scholar tutoring and live interactive tools."
            />

            <fieldset className="space-y-3">
              <legend className="sr-only">Choose Course</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {courses.map((c) => {
                  const active = c.code.toUpperCase() === courseCode;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCourseCode(c.code.toUpperCase())}
                      className={`relative p-5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between group ${
                        active
                          ? 'border-[#143a2f] bg-[#f0f6f3] ring-2 ring-[#143a2f]/10 shadow-md'
                          : 'border-[#e6dfd1] bg-[#faf7f1] hover:bg-white hover:border-[#c49a55]/60 hover:shadow-xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase ${
                              active ? 'bg-[#143a2f] text-white' : 'bg-[#e6dfd1]/60 text-[#143a2f]'
                            }`}
                          >
                            {c.code}
                          </span>
                          <span
                            className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                              active
                                ? 'bg-[#143a2f] border-[#143a2f] text-white'
                                : 'border-[#d5cbb8] bg-white group-hover:border-[#c49a55]'
                            }`}
                          >
                            {active && <Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden />}
                          </span>
                        </div>
                        <h3 className="font-fraunces text-base sm:text-lg font-medium text-[#10201b] leading-snug">
                          {c.title}
                        </h3>
                        {c.tagline && (
                          <p className="text-xs text-[#6b7772] mt-1.5 line-clamp-2 leading-relaxed">
                            {c.tagline}
                          </p>
                        )}
                      </div>

                      <div className="pt-4 mt-3 border-t border-[#e6dfd1]/60 flex items-center justify-between text-[11px] text-[#3c4a45]">
                        <span className="font-medium text-[#143a2f]">1-on-1 Dedicated Scholar</span>
                        <span className="text-[#a97f3c] font-semibold">30 Min Trial</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          {/* Right Sidebar Preferences Card (4 columns on lg) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-[28px] border border-[#e6dfd1] p-6 lg:p-7 shadow-card space-y-6 lg:sticky lg:top-8">
              <div className="border-b border-[#f3eee4] pb-4">
                <span className="text-[11px] uppercase tracking-wider font-bold text-[#a97f3c] block">
                  Configuration
                </span>
                <h3 className="font-fraunces text-xl font-normal text-[#10201b] mt-0.5">
                  Lesson Preferences
                </h3>
              </div>

              {/* Teacher Gender Preference */}
              <div>
                <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                  Faculty Gender Preference
                </label>
                <div className="grid grid-cols-3 gap-1.5 text-xs font-medium bg-[#faf7f1] p-1 rounded-full border border-[#e6dfd1]">
                  {([['', 'Any'], ['MALE', 'Ustadh'], ['FEMALE', 'Ustadha']] as const).map(([g, label]) => (
                    <button
                      key={g || 'any'}
                      type="button"
                      aria-pressed={gender === g}
                      onClick={() => setGender(g)}
                      className={`py-2 px-1 rounded-full transition-all cursor-pointer text-center ${
                        gender === g
                          ? 'bg-[#143a2f] text-white shadow-xs font-semibold'
                          : 'text-[#3c4a45] hover:text-[#10201b]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Teaching Language */}
              <div>
                <label htmlFor="booking-language" className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                  Instruction Language
                </label>
                <Select
                  id="booking-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  appearance="pill"
                  controlClassName="bg-[#faf7f1] border-[#e6dfd1]"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Teacher (optional): only teachers who teach the chosen course */}
              <div>
                <label htmlFor="booking-teacher" className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                  Teacher (optional)
                </label>
                <Select
                  id="booking-teacher"
                  value={teacherFilter}
                  onChange={(e) => setTeacherFilter(e.target.value)}
                  appearance="pill"
                  controlClassName="bg-[#faf7f1] border-[#e6dfd1]"
                  searchable
                >
                  <option value="">Any available teacher</option>
                  {teacherOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <p className="mt-1.5 text-[11px] text-[#6b7772]">
                  {courseCode
                    ? teacherOptions.length > 0
                      ? 'Choose a teacher to see only their times, or leave it open for the earliest slots.'
                      : `No teacher lists ${courseCode} yet — any available teacher can run the evaluation.`
                    : 'Choose a course first to see who teaches it.'}
                </p>
              </div>

              {/* Selected Course Summary Banner */}
              <div className="p-4 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] space-y-2 text-xs">
                <span className="text-[10px] font-bold text-[#6b7772] uppercase tracking-wider block">
                  Selected Pathway
                </span>
                <div className="font-semibold text-sm text-[#10201b]">
                  {course ? course.title : 'Please select a course on the left'}
                </div>
                <div className="flex items-center justify-between text-[#6b7772] pt-1">
                  <span>Class Format:</span>
                  <span className="font-medium text-[#10201b]">1-on-1 Live Mushaf</span>
                </div>
                <div className="flex items-center justify-between text-[#6b7772]">
                  <span>Evaluation Length:</span>
                  <span className="font-medium text-[#10201b]">30 Minutes</span>
                </div>
              </div>

              {teacherFilter && (
                <p className="text-xs text-[#3c4a45]">
                  Showing times for the teacher you chose.{' '}
                  <button type="button" onClick={() => setTeacherFilter('')} className="font-semibold underline cursor-pointer text-[#143a2f]">
                    Show all teachers
                  </button>
                </p>
              )}

              {/* Submit CTA */}
              <Button
                variant="green"
                type="submit"
                disabled={!course}
                icon={<ArrowRight />}
                iconPosition="right"
                className="w-full h-12 text-sm shadow-sm cursor-pointer disabled:opacity-50"
              >
                {course ? 'See Available Times' : 'Select a Pathway to Continue'}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Step 2: Time Selection */}
      {step === 'time' && course && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Sidebar: Booking Summary & Timezone Switcher */}
          <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-8">
            <div className="bg-white rounded-[28px] border border-[#e6dfd1] p-6 lg:p-7 shadow-card space-y-5">
              <BackButton onClick={() => setStep('details')}>Back to courses</BackButton>

              <div className="border-b border-[#f3eee4] pb-3">
                <span className="text-[10px] uppercase font-bold text-[#a97f3c] tracking-wider block">
                  Pathway Selected
                </span>
                <h3 className="font-fraunces text-xl text-[#10201b] font-normal mt-0.5">
                  {course.title}
                </h3>
                <p className="text-xs text-[#6b7772] mt-1">
                  Trial classes last {TRIAL_DURATION_MINUTES} minutes with live synchronized Mushaf board.
                </p>
              </div>

              {/* Timezone picker widget */}
              <div>
                <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                  Display Timezone
                </label>
                <div className="p-3 bg-[#faf7f1] rounded-2xl border border-[#e6dfd1]">
                  <TimezoneSelect value={timeZone} onChange={setTimeZone} detected={detectedZone} />
                </div>
              </div>

              {/* Slot selection card */}
              <div className="p-4 rounded-2xl bg-[#f0f6f3] border border-[#143a2f]/20 text-xs space-y-2">
                <span className="text-[10px] font-bold text-[#143a2f] uppercase tracking-wider block">
                  Chosen Time Slot
                </span>
                {slot ? (
                  <>
                    <p className="text-sm font-semibold text-[#10201b]">
                      {formatSlotFull(slot.startsAt, timeZone)}
                    </p>
                    <p className="text-xs text-[#3c4a45] flex items-center gap-1.5">
                      <span>Tutor:</span>
                      <strong className="text-[#10201b]">{slot.teacherName}</strong>
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-[#6b7772] italic">
                    Click an available time slot from the schedule on the right to select it.
                  </p>
                )}
              </div>

              <Button
                variant="green"
                disabled={!slot}
                onClick={() => setStep('learner')}
                icon={<ArrowRight />}
                iconPosition="right"
                className="w-full h-12 text-sm shadow-sm cursor-pointer disabled:opacity-50"
              >
                Continue to Learner Details
              </Button>
            </div>
          </div>

          {/* Right Main Column: Expansive Day Tabs & Slot Grid */}
          <div className="lg:col-span-8 bg-white rounded-[28px] border border-[#e6dfd1] p-6 sm:p-10 shadow-card space-y-6">
            <StepHeading
              step="Step 2 of 3"
              title="Pick an Open Time"
              text={`Verified open schedules for ${course.title} in your timezone (${timeZone.replace(/_/g, ' ')}).`}
            />

            <TimeStep
              courseId={course.id}
              courseCode={course.code}
              timeZone={timeZone}
              gender={gender || undefined}
              language={language || undefined}
              teacherFilter={teacherFilter}
              selected={slot}
              onSelect={(s) =>
                setSlot({
                  teacherId: s.teacherId,
                  teacherName: s.teacherName,
                  startsAt: s.startsAt,
                  endsAt: s.endsAt,
                })
              }
            />

            <div className="pt-6 mt-6 border-t border-[#f3eee4] flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-[#6b7772]" aria-live="polite">
                {slot ? (
                  <>
                    Selected: <strong className="text-[#10201b]">{formatSlotFull(slot.startsAt, timeZone)}</strong> with {slot.teacherName}
                  </>
                ) : (
                  'Choose a time slot to continue.'
                )}
              </p>
              <Button
                variant="green"
                disabled={!slot}
                onClick={() => setStep('learner')}
                icon={<ArrowRight />}
                iconPosition="right"
                className="cursor-pointer"
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Learner Details & Confirmation */}
      {step === 'learner' && slot && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Summary Ticket */}
          <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-8">
            <div className="bg-white rounded-[28px] border border-[#e6dfd1] p-6 lg:p-7 shadow-card space-y-5">
              <BackButton onClick={() => setStep('time')}>Change time</BackButton>
              <div className="border-b border-[#f3eee4] pb-3">
                <span className="text-[10px] uppercase font-bold text-[#a97f3c] tracking-wider block">
                  Class Reservation Ticket
                </span>
                <h3 className="font-fraunces text-xl text-[#10201b] font-normal mt-0.5">
                  Trial Summary
                </h3>
              </div>

              <Summary courseTitle={course?.title ?? courseCode} slot={slot} timeZone={timeZone} />

              <div className="p-4 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] text-xs space-y-2 text-[#3c4a45]">
                <span className="font-semibold text-[#10201b] block">Classroom Requirements:</span>
                <ul className="space-y-1 text-[11px] text-[#6b7772] list-disc pl-4">
                  <li>Computer, tablet, or laptop with modern browser</li>
                  <li>Working microphone and webcam</li>
                  <li>Guardian attendance welcome</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Right Column: Learner / Auth Step */}
          <div className="lg:col-span-8 bg-white rounded-[28px] border border-[#e6dfd1] p-6 sm:p-10 shadow-card space-y-6">
            <StepHeading
              step="Step 3 of 3"
              title="Learner Details & Confirmation"
              text="Trials are booked under a guardian account so parents have direct visibility into syllabus recommendations and recordings."
            />

            {!course ? (
              <Alert tone="warning">That course is no longer offered. Please choose another.</Alert>
            ) : authLoading ? (
              <div role="status" className="flex items-center gap-2 text-sm text-[#6b7772] py-6 justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#c49a55]" aria-hidden /> Checking your account…
              </div>
            ) : !isAuthenticated ? (
              <SignInPrompt redirect={bookingPath(selection)} />
            ) : !currentUser?.roles?.includes(Role.GUARDIAN) ? (
              <Alert tone="warning" title="A guardian account is needed">
                You are signed in as {currentUser?.name}, which is not a parent/guardian account. Sign out and use or create a
                guardian account to book a trial.
              </Alert>
            ) : (
              <LearnerStep
                guardianName={currentUser.name}
                timeZone={timeZone}
                courseId={course.id}
                slot={slot}
                onSlotTaken={() => {
                  setSlot(null);
                  setStep('time');
                }}
                onBooked={(cls, learner) => {
                  setBooked({ cls, learner });
                  setStep('done');
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Step 4: Celebration & Calendar Download */}
      {step === 'done' && booked && (
        <div className="max-w-3xl mx-auto">
          <Confirmation
            booked={booked.cls}
            learner={booked.learner}
            courseTitle={course?.title ?? courseCode}
            teacherName={slot?.teacherName ?? ''}
            timeZone={timeZone}
            onRestart={() => {
              setBooked(null);
              setSlot(null);
              setStep('details');
            }}
          />
        </div>
      )}
    </div>
  );
}

function StepHeading({ step, title, text }: { step: string; title: string; text: string }) {
  return (
    <div className="mb-6 space-y-1">
      <p className="text-xs text-[#a97f3c] font-semibold uppercase tracking-wider">{step}</p>
      <h2 className="text-2xl sm:text-3xl font-fraunces font-normal text-[#10201b]">{title}</h2>
      <p className="text-xs sm:text-sm text-[#6b7772] leading-relaxed">{text}</p>
    </div>
  );
}

function BackButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium text-[#6b7772] hover:text-[#10201b] flex items-center gap-1.5 mb-2.5 cursor-pointer"
    >
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> {children}
    </button>
  );
}

/** Enough for every teacher's 30-minute slots over the search window. */
const OPEN_SLOT_LIMIT = 3000;

function TimeStep({
  courseId,
  courseCode,
  timeZone,
  gender,
  language,
  teacherFilter,
  selected,
  onSelect,
}: {
  courseId?: string;
  courseCode: string;
  timeZone: string;
  gender?: 'MALE' | 'FEMALE';
  language?: string;
  teacherFilter: string;
  selected: ChosenSlot | null;
  onSelect: (slot: OpenSlot) => void;
}) {
  const [window] = useState(() => searchWindow());
  const [showAll, setShowAll] = useState(false);
  const subjectTeachers = useSubjectTeachers(courseCode);
  // Ask for this course's teachers only when someone teaches it (otherwise every teacher
  // is offered). The API stops at `limit` in teacher order (backend B11), so the limit
  // must cover all teachers' slots in the window or later teachers silently disappear.
  const courseHasTeachers = (subjectTeachers.data?.length ?? 0) > 0;
  const slots = useOpenSlots(
    {
      ...window,
      visitorZone: timeZone,
      durationMinutes: TRIAL_DURATION_MINUTES,
      gender,
      language,
      ...(courseHasTeachers && courseId ? { courseId } : {}),
      limit: OPEN_SLOT_LIMIT,
    },
    subjectTeachers.isFetched,
  );
  const subjectIds = useMemo(() => new Set((subjectTeachers.data ?? []).map((t) => t.id)), [subjectTeachers.data]);

  const all = slots.data ?? [];
  const byTeacher = teacherFilter ? all.filter((s) => s.teacherId === teacherFilter) : all;
  const bySubject = byTeacher.filter((s) => subjectIds.has(s.teacherId));
  const noSubjectMatch = !teacherFilter && subjectTeachers.isSuccess && bySubject.length === 0 && byTeacher.length > 0;
  const shown = teacherFilter || showAll || noSubjectMatch ? byTeacher : bySubject;

  if (slots.isPending || subjectTeachers.isLoading) {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-[#6b7772] py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-[#c49a55]" aria-hidden /> Finding open times…
      </div>
    );
  }
  if (slots.isError) {
    return <ErrorState error={slots.error} title="Could not load available times" onRetry={() => slots.refetch()} />;
  }
  if (shown.length === 0) {
    return (
      <Alert tone="warning" title="No open times in the next two weeks">
        Try another teacher preference or language, or check back soon — new availability is added regularly.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {noSubjectMatch && (
        <Alert tone="neutral">
          No teacher lists {courseCode} as a subject yet, so all available teachers are shown. Any of them can run your
          evaluation class.
        </Alert>
      )}
      {!teacherFilter && !noSubjectMatch && bySubject.length < byTeacher.length && (
        <label className="flex items-center gap-2 text-xs text-[#3c4a45] cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-[#143a2f]" />
          Include teachers who do not list {courseCode} as a subject
        </label>
      )}
      <SlotPicker
        slots={shown}
        timeZone={timeZone}
        selectedKey={selected ? slotKey(selected) : null}
        onSelect={onSelect}
      />
    </div>
  );
}

function Summary({ courseTitle, slot, timeZone }: { courseTitle: string; slot: ChosenSlot; timeZone: string }) {
  return (
    <dl className="p-4 mb-6 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] text-xs space-y-2">
      <div className="flex justify-between gap-3">
        <dt className="text-[#6b7772]">Course</dt>
        <dd className="font-semibold text-[#10201b] text-right">{courseTitle}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-[#6b7772]">Teacher</dt>
        <dd className="font-semibold text-[#10201b] text-right">{slot.teacherName}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-[#6b7772]">Time</dt>
        <dd className="font-semibold text-[#10201b] text-right">
          {formatSlotFull(slot.startsAt, timeZone)} <span className="font-normal text-[#6b7772]">({timeZone.replace(/_/g, ' ')})</span>
        </dd>
      </div>
    </dl>
  );
}

function SignInPrompt({ redirect }: { redirect: string }) {
  const enc = encodeURIComponent(redirect);
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#3c4a45]">
        Sign in or create a free guardian account to confirm. Your course and time are kept while you do.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button variant="green" href={`/register?role=GUARDIAN&redirect=${enc}`} icon={<UserPlus />} className="flex-1">
          Create guardian account
        </Button>
        <Button variant="outline" href={`/login?redirect=${enc}`} icon={<LogIn />} className="flex-1">
          I already have an account
        </Button>
      </div>
    </div>
  );
}

function Confirmation({
  booked,
  learner,
  courseTitle,
  teacherName,
  timeZone,
  onRestart,
}: {
  onRestart: () => void;
  booked: BookedClass;
  learner: FamilyStudent;
  courseTitle: string;
  teacherName: string;
  timeZone: string;
}) {
  const download = () => {
    const ics = buildIcs({
      classId: booked.id,
      startsAt: booked.startsAt,
      endsAt: booked.endsAt,
      summary: `Hifzoon trial class — ${courseTitle}`,
      description: `Free ${TRIAL_DURATION_MINUTES}-minute evaluation for ${learner.displayName}${teacherName ? ` with ${teacherName}` : ''}. Join from the Hifzoon family portal; the room opens 10 minutes before the start.`,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `hifzoon-trial-${booked.id.slice(0, 8)}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-[28px] border-2 border-[#c49a55] p-8 sm:p-12 shadow-card text-center space-y-6" role="status">
      <div className="w-16 h-16 rounded-full bg-[#f0f6f3] text-[#143a2f] border-2 border-[#c49a55] flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-9 h-9" aria-hidden />
      </div>
      <div className="space-y-2">
        <span className="inline-block px-3.5 py-1 rounded-full bg-[#f6ecd9] text-[#a97f3c] text-xs font-bold uppercase tracking-wider">
          Class reference {booked.id.slice(0, 8).toUpperCase()}
        </span>
        <h2 className="text-2xl sm:text-4xl font-fraunces font-normal text-[#10201b]">Trial class booked</h2>
        <p className="text-sm text-[#6b7772] max-w-md mx-auto">
          Reminders will be sent to your account before the class. You can see it in your family timetable.
        </p>
      </div>
      <dl className="p-5 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] max-w-md mx-auto text-left text-xs space-y-2.5">
        <div className="flex justify-between gap-3">
          <dt className="text-[#6b7772]">Learner</dt>
          <dd className="font-semibold text-[#10201b]">{learner.displayName}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[#6b7772]">Course</dt>
          <dd className="font-semibold text-[#10201b] text-right">{courseTitle}</dd>
        </div>
        {teacherName && (
          <div className="flex justify-between gap-3">
            <dt className="text-[#6b7772]">Teacher</dt>
            <dd className="font-semibold text-[#10201b] text-right">{teacherName}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-[#6b7772]">Starts</dt>
          <dd className="font-semibold text-[#10201b] text-right">{formatSlotFull(booked.startsAt, timeZone)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[#6b7772]">Time zone</dt>
          <dd className="font-semibold text-[#10201b]">{timeZone.replace(/_/g, ' ')}</dd>
        </div>
      </dl>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
        <Button variant="outline" size="sm" onClick={download} icon={<Download />}>
          Add to calendar (.ics)
        </Button>
        <Button variant="gold" size="sm" href="/parent">
          Go to family portal
        </Button>
      </div>
      <p className="text-xs text-[#6b7772]">
        Need another learner booked?{' '}
        <button type="button" onClick={onRestart} className="font-semibold underline cursor-pointer text-[#143a2f]">
          Book another trial
        </button>
      </p>
    </div>
  );
}
