'use client';

import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, Loader2, LogIn, UserPlus } from 'lucide-react';
import { Alert, ErrorState } from '@/components/ui/primitives';
import { Button } from '@/components/landing/Button';
import { useAuth } from '@/hooks/useAuth';
import { useCourses } from '@/hooks/useCourses';
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

const card = 'bg-white rounded-[28px] border border-[#e6dfd1] p-6 sm:p-10 shadow-card';
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
  const [timeZone, setTimeZone] = useState(initial.tz && isValidTimeZone(initial.tz) ? initial.tz : detectedZone);
  const [slot, setSlot] = useState<ChosenSlot | null>(initialSlot);
  const [step, setStep] = useState<Step>(initialSlot && initial.course ? 'learner' : 'details');
  const [booked, setBooked] = useState<{ cls: BookedClass; learner: FamilyStudent } | null>(null);

  const course = courses.find((c) => c.code.toUpperCase() === courseCode);
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
    ['details', '1. Course'],
    ['time', '2. Date & time'],
    ['learner', '3. Learner & confirm'],
  ];
  const stepIndex = steps.findIndex(([s]) => s === step);

  return (
    <div className="max-w-[860px] mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
      {step !== 'done' && (
        <div className="mb-8">
          <ol className="grid grid-cols-3 text-center text-xs font-semibold text-[#6b7772] mb-3">
            {steps.map(([s, label], i) => (
              <li key={s} aria-current={s === step ? 'step' : undefined} className={i <= stepIndex ? 'text-[#143a2f] font-bold' : ''}>
                {label}
              </li>
            ))}
          </ol>
          <div className="w-full bg-[#e6dfd1] h-2 rounded-full overflow-hidden" aria-hidden>
            <div className="bg-[#143a2f] h-full transition-all duration-300 rounded-full" style={{ width: `${((stepIndex + 1) / 3) * 100}%` }} />
          </div>
        </div>
      )}

      {step === 'details' && (
        <div className={card}>
          <StepHeading step="Step 1 of 3" title="Choose a course" text="Pick the pathway and any teacher preferences." />
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (course) setStep('time');
            }}
          >
            <fieldset>
              <legend className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">Course *</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {courses.map((c) => {
                  const active = c.code.toUpperCase() === courseCode;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCourseCode(c.code.toUpperCase())}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                        active ? 'border-[#143a2f] bg-[#f0f6f3]' : 'border-[#e6dfd1] bg-[#faf7f1] hover:bg-white'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-fraunces text-sm font-medium text-[#10201b]">{c.title}</span>
                        {active && <Check className="w-4 h-4 text-[#143a2f]" aria-hidden />}
                      </span>
                      {c.tagline && <span className="block text-[11px] text-[#6b7772] mt-1 line-clamp-1">{c.tagline}</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid sm:grid-cols-2 gap-4">
              <fieldset>
                <legend className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">Teacher</legend>
                <div className="grid grid-cols-3 gap-2 text-xs font-medium">
                  {([['', 'Any'], ['MALE', 'Ustadh'], ['FEMALE', 'Ustadha']] as const).map(([g, label]) => (
                    <button
                      key={g || 'any'}
                      type="button"
                      aria-pressed={gender === g}
                      onClick={() => setGender(g)}
                      className={`py-2.5 px-2 rounded-full border cursor-pointer ${
                        gender === g ? 'bg-[#143a2f] text-white border-[#143a2f] font-semibold' : 'bg-[#faf7f1] text-[#3c4a45] border-[#e6dfd1]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor="booking-language" className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                  Teaching language
                </label>
                <Select
                  id="booking-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  appearance="pill"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {teacherFilter && (
              <p className="text-xs text-[#3c4a45]">
                Showing times for the teacher you chose.{' '}
                <button type="button" onClick={() => setTeacherFilter('')} className="font-semibold underline cursor-pointer">
                  Show all teachers
                </button>
              </p>
            )}

            <Button variant="green" type="submit" disabled={!course} icon={<ArrowRight />} iconPosition="right" className="w-full">
              {course ? 'See available times' : 'Choose a course to continue'}
            </Button>
          </form>
        </div>
      )}

      {step === 'time' && course && (
        <div className={card}>
          <BackButton onClick={() => setStep('details')}>Back to course</BackButton>
          <StepHeading
            step="Step 2 of 3"
            title="Pick a time"
            text={`Real open times for ${course.title}. Trial classes last ${TRIAL_DURATION_MINUTES} minutes.`}
          />
          <div className="mb-6 p-4 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1]">
            <TimezoneSelect value={timeZone} onChange={setTimeZone} detected={detectedZone} />
          </div>
          <TimeStep
            courseCode={course.code}
            timeZone={timeZone}
            gender={gender || undefined}
            language={language || undefined}
            teacherFilter={teacherFilter}
            selected={slot}
            onSelect={(s) => setSlot({ teacherId: s.teacherId, teacherName: s.teacherName, startsAt: s.startsAt, endsAt: s.endsAt })}
          />
          <div className="pt-6 mt-6 border-t border-[#f3eee4] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#6b7772]" aria-live="polite">
              {slot ? (
                <>
                  Selected: <strong className="text-[#10201b]">{formatSlotFull(slot.startsAt, timeZone)}</strong> with {slot.teacherName}
                </>
              ) : (
                'Choose a time to continue.'
              )}
            </p>
            <Button variant="green" disabled={!slot} onClick={() => setStep('learner')} icon={<ArrowRight />} iconPosition="right">
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 'learner' && slot && (
        <div className={card}>
          <BackButton onClick={() => setStep('time')}>Change time</BackButton>
          <StepHeading step="Step 3 of 3" title="Learner & confirmation" text="Trials are booked from a guardian account so we can keep your child safe." />
          <Summary courseTitle={course?.title ?? courseCode} slot={slot} timeZone={timeZone} />
          {!course ? (
            <Alert tone="warning">That course is no longer offered. Please choose another.</Alert>
          ) : authLoading ? (
            <div role="status" className="flex items-center gap-2 text-sm text-[#6b7772] py-6">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Checking your account…
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
      )}

      {step === 'done' && booked && (
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

function TimeStep({
  courseCode,
  timeZone,
  gender,
  language,
  teacherFilter,
  selected,
  onSelect,
}: {
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
  const slots = useOpenSlots({
    ...window,
    visitorZone: timeZone,
    durationMinutes: TRIAL_DURATION_MINUTES,
    gender,
    language,
    limit: 500,
  });
  const subjectTeachers = useSubjectTeachers(courseCode);
  const subjectIds = useMemo(() => new Set((subjectTeachers.data ?? []).map((t) => t.id)), [subjectTeachers.data]);

  const all = slots.data ?? [];
  const byTeacher = teacherFilter ? all.filter((s) => s.teacherId === teacherFilter) : all;
  const bySubject = byTeacher.filter((s) => subjectIds.has(s.teacherId));
  const noSubjectMatch = !teacherFilter && subjectTeachers.isSuccess && bySubject.length === 0 && byTeacher.length > 0;
  const shown = teacherFilter || showAll || noSubjectMatch ? byTeacher : bySubject;

  if (slots.isLoading || subjectTeachers.isLoading) {
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
        <button type="button" onClick={onRestart} className="font-semibold underline cursor-pointer">
          Book another trial
        </button>
      </p>
    </div>
  );
}
