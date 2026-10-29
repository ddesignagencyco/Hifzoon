'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck2, Sparkles } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  QueryState,
  Select,
  Tabs,
  TextArea,
  TextInput,
  UiButton,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { usePlans } from '@/hooks/usePlans';
import { useAdminCourses, useAdminEnrolments, useAdminMatching, useAdminOpenSlots, useRecentTrialClasses } from '@/hooks/useAdminScheduling';
import { useTeachers } from '@/hooks/useTeachers';
import { useAdminPlans, useBookTrial, useRecordTrialOutcome } from '@/hooks/useAdminAdmissions';
import { useCrmLeads } from '@/hooks/useCrm';
import { isUuid } from '@/lib/api/modules/crm';
import {
  CatalogueCourse,
  OpenSlotQuery,
  RecentTrialClass,
  WEEKDAYS,
  listTimeZones,
  viewerTimeZone,
} from '@/lib/api/modules/scheduling-admin';
import { TrialClass, TrialOutcomeResult, validateTrialOutcome } from '@/lib/api/modules/admissions-admin';
import { CopyButton, DetailList, toLocalDateValue, toLocalInputValue } from '../shared/AdminUi';
import { billingEnabled } from '@/lib/features';
import { TRIAL_SESSIONS_PER_WEEK } from '@/lib/api/modules/backend-updates-oct2026';
import { PickedStudent, StudentPicker, mergeTeacherOptions, useLoadErrorToast } from '../shared/Pickers';

type Mode = 'book' | 'outcome';

/** `/admin/trials` — book a trial from matching + open slots, then record its outcome. */
export function TrialsWorkspace() {
  const [mode, setMode] = useState<Mode>('book');
  const [lastBooked, setLastBooked] = useState<{ trial: TrialClass; studentName: string; courseId: string } | null>(null);

  return (
    <>
      <PageHeader
        eyebrow="Academy admin"
        title="Trials & placement"
        description={
          billingEnabled()
            ? 'Book a trial with a matched, cleared teacher, then record the result and send the family their subscribe link.'
            : 'Book a trial with a matched, cleared teacher, then record the result and placement.'
        }
      />
      <Tabs
        className="mb-5"
        value={mode}
        onChange={setMode}
        tabs={[
          { value: 'book', label: 'Book a trial' },
          { value: 'outcome', label: 'Record outcome' },
        ]}
      />
      {mode === 'book' ? (
        <BookTrial
          lastBooked={lastBooked}
          onBooked={(b) => setLastBooked(b)}
          onRecordOutcome={() => setMode('outcome')}
        />
      ) : (
        <RecordOutcome key={lastBooked?.trial.id ?? 'none'} initialClassId={lastBooked?.trial.id} initialCourseId={lastBooked?.courseId} />
      )}
    </>
  );
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function BookTrial({
  lastBooked,
  onBooked,
  onRecordOutcome,
}: {
  lastBooked: { trial: TrialClass; studentName: string } | null;
  onBooked: (b: { trial: TrialClass; studentName: string; courseId: string }) => void;
  onRecordOutcome: () => void;
}) {
  const toast = useToast();
  const courses = useAdminCourses();
  const book = useBookTrial();
  useLoadErrorToast(courses.isError, 'Could not load courses.');
  const leads = useCrmLeads({ page: 1, limit: 100, status: 'NEW' });

  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [courseId, setCourseId] = useState('');
  const [teacherId, setTeacherId] = useState(''); // '' = let the backend choose
  const [zone, setZone] = useState(viewerTimeZone);
  const [fromDate, setFromDate] = useState(() => toLocalDateValue(new Date()));
  const [days, setDays] = useState(14);
  const [startsAt, setStartsAt] = useState<string>(''); // ISO
  const [manualStart, setManualStart] = useState('');
  const [leadId, setLeadId] = useState('');
  const [invalid, setInvalid] = useState<'student' | 'course' | 'start' | 'lead' | null>(null);
  const fail = (field: 'student' | 'course' | 'start' | 'lead', message: string) => {
    setInvalid(field);
    toast.error(message);
  };

  const matching = useAdminMatching(student?.id, courseId);
  const zones = useMemo(() => listTimeZones(), []);

  const slotQuery: OpenSlotQuery | null = useMemo(() => {
    if (!student || !courseId) return null;
    const from = new Date(`${fromDate}T00:00:00`);
    if (Number.isNaN(from.getTime())) return null;
    // `courseId` is not sent: the API only offers teachers who already run a schedule for
    // that course, which hides newly cleared teachers. Matching already ranks by course.
    return { from: from.toISOString(), to: addDays(from, days).toISOString(), visitorZone: zone, durationMinutes: 30, limit: 300 };
  }, [student, courseId, fromDate, days, zone]);
  const slots = useAdminOpenSlots(slotQuery);

  const suggestionIds = new Set((matching.data?.suggestions ?? []).map((s) => s.teacherId));
  const visibleSlots = (slots.data ?? []).filter((s) => (teacherId ? s.teacherId === teacherId : suggestionIds.has(s.teacherId)));

  const resetDownstream = () => {
    setTeacherId('');
    setStartsAt('');
    setManualStart('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const chosen = startsAt || (manualStart ? new Date(manualStart).toISOString() : '');
    if (!student) return fail('student', 'Choose a student.');
    if (!courseId) return fail('course', 'Choose a course.');
    if (!chosen) return fail('start', 'Pick an open slot or enter a start time.');
    if (new Date(chosen).getTime() < Date.now()) return fail('start', 'A trial cannot start in the past.');
    if (leadId && !isUuid(leadId)) return fail('lead', 'Lead id is not valid.');
    setInvalid(null);
    book.mutate(
      { studentId: student.id, courseId, startsAt: chosen, teacherId: teacherId || undefined, leadId: leadId || undefined },
      {
        onSuccess: (trial) => {
          toast.success(`Trial booked for ${student.displayName}`);
          onBooked({ trial, studentName: student.displayName, courseId });
          resetDownstream();
          setLeadId('');
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <div className="space-y-5">
      {lastBooked && (
        <Alert tone="success" title={`Trial booked for ${lastBooked.studentName}`}>
          <span className="block">
            {formatDateTime(lastBooked.trial.startsAt)}
          </span>
          <span className="mt-2 flex flex-wrap gap-2">
            <CopyButton value={lastBooked.trial.id} label="Copy class reference" />
            <UiButton size="sm" variant="secondary" onClick={onRecordOutcome}>
              Record its outcome
            </UiButton>
          </span>
        </Alert>
      )}
      <form onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr] items-start">
        <Card>
          <CardHeader title="1. Student & course" />
          <CardBody className="space-y-4">
            <StudentPicker
              id="trial-student"
              value={student}
              error={invalid === 'student' ? 'Choose a student.' : null}
              onChange={(s) => {
                setStudent(s);
                resetDownstream();
              }}
            />
            {student && (
              <div className="text-xs text-muted bg-sand p-3 rounded-lg border border-line">
                <span className="font-semibold text-ink">Trial limit:</span> up to {TRIAL_SESSIONS_PER_WEEK} trial sessions of 30
                minutes per student each week. A further booking in the same week is refused.
              </div>
            )}
            <Field label="Course" htmlFor="trial-course" required error={invalid === 'course' ? 'Choose a course.' : null}>
              <Select
                id="trial-course"
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  resetDownstream();
                }}
              >
                <option value="">{courses.isLoading ? 'Loading courses…' : 'Select a course'}</option>
                {(courses.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Link a CRM lead" htmlFor="trial-lead" error={invalid === 'lead' ? 'Lead id is not valid.' : null} hint="Moves the lead to Trial booked and adds a follow-up task.">
              <Select id="trial-lead" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                <option value="">No lead</option>
                {(leads.data?.items ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.contactName}
                    {l.courseInterest ? ` · ${l.courseInterest}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader title="2. Teacher" description="Top suggestions from matching, with the reasons each one scored." />
            <CardBody>
              {!student || !courseId ? (
                <EmptyState title="Choose a student and course" description="Suggestions only include fully cleared teachers." />
              ) : (
                <QueryState
                  query={matching}
                  isEmpty={(d) => d.suggestions.length === 0}
                  empty={<EmptyState title="No cleared teacher matches" description="Nobody speaks the student's language yet. The trial can still be booked; the API then picks the best available teacher." />}
                >
                  {(data) => (
                    <fieldset>
                      <legend className="sr-only">Teacher</legend>
                      <ul className="space-y-2">
                        <li>
                          <SuggestionOption
                            id="teacher-auto"
                            checked={teacherId === ''}
                            onSelect={() => {
                              setTeacherId('');
                              setStartsAt('');
                            }}
                            title="Let the system choose"
                            detail="The API assigns the best available cleared teacher when the trial is booked."
                          />
                        </li>
                        {data.suggestions.map((s) => (
                          <li key={s.teacherId}>
                            <SuggestionOption
                              id={`teacher-${s.teacherId}`}
                              checked={teacherId === s.teacherId}
                              onSelect={() => {
                                setTeacherId(s.teacherId);
                                setStartsAt('');
                              }}
                              title={s.name}
                              badge={`score ${Math.round(s.score)}`}
                              detail={
                                <>
                                  <span className="block">{s.reasons.join(' · ')}</span>
                                  <span className="block text-muted">
                                    {s.languages.join(', ')} · {s.timeZone}
                                    {s.availableWeekdays.length > 0 &&
                                      ` · available ${s.availableWeekdays.map((d) => WEEKDAYS[d]?.short ?? d).join(', ')}`}
                                  </span>
                                </>
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    </fieldset>
                  )}
                </QueryState>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="3. Time" description="Open 30-minute slots inside each teacher's availability, shown in the zone you pick." />
            <CardBody className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="From" htmlFor="slot-from">
                  <TextInput id="slot-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </Field>
                <Field label="Window" htmlFor="slot-days">
                  <Select id="slot-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                    {[7, 14, 28].map((d) => (
                      <option key={d} value={d}>
                        {d} days
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Show times in" htmlFor="slot-zone">
                  <Select id="slot-zone" value={zone} onChange={(e) => setZone(e.target.value)}>
                    {zones.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {!slotQuery ? (
                <p className="text-xs text-muted">Choose a student and course to see open slots.</p>
              ) : (
                <QueryState
                  query={slots}
                  isEmpty={() => visibleSlots.length === 0}
                  empty={<EmptyState title="No open slots for this selection" description="Try a wider window, another teacher, or enter a time below." />}
                >
                  {() => (
                    <div role="radiogroup" aria-label="Open slots" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                      {visibleSlots.slice(0, 90).map((slot) => {
                        const selected = startsAt === slot.startsAt && teacherId === slot.teacherId;
                        return (
                          <button
                            key={`${slot.teacherId}-${slot.startsAt}`}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => {
                              setTeacherId(slot.teacherId);
                              setStartsAt(slot.startsAt);
                              setManualStart('');
                            }}
                            className={
                              'text-left rounded-xl border px-3 py-2 text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ' +
                              (selected ? 'border-green-700 bg-green-50 text-green-800' : 'border-line bg-white hover:bg-sand text-ink-2')
                            }
                          >
                            <span className="block font-semibold">{slot.localTime}</span>
                            <span className="block text-muted">{slot.teacherName}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </QueryState>
              )}
              <Field label="Or enter a start time (your local time)" htmlFor="trial-manual" hint="Must be in the future." error={invalid === 'start' ? 'Pick an open slot or enter a future start time.' : null}>
                <TextInput
                  id="trial-manual"
                  type="datetime-local"
                  min={toLocalInputValue(new Date())}
                  value={manualStart}
                  onChange={(e) => {
                    setManualStart(e.target.value);
                    setStartsAt('');
                  }}
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted" aria-live="polite">
                  {startsAt
                    ? `Selected ${formatDateTime(startsAt, zone)} (${zone})`
                    : manualStart
                      ? `Selected ${formatDateTime(new Date(manualStart))}`
                      : 'No time selected'}
                </p>
                <UiButton type="submit" loading={book.isPending} icon={<CalendarCheck2 className="w-4 h-4" />}>
                  Book trial
                </UiButton>
              </div>
            </CardBody>
          </Card>
        </div>
      </form>
    </div>
  );
}

function SuggestionOption({
  id,
  checked,
  onSelect,
  title,
  detail,
  badge,
}: {
  id: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: React.ReactNode;
  badge?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={
        'flex items-start gap-3 rounded-xl border p-3 cursor-pointer ' +
        (checked ? 'border-green-700 bg-green-50' : 'border-line hover:bg-cream')
      }
    >
      <input id={id} type="radio" name="trial-teacher" checked={checked} onChange={onSelect} className="mt-1 accent-green-800" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-ink">{title}</span>
          {badge && <Badge tone="gold">{badge}</Badge>}
        </span>
        <span className="block text-xs text-ink-2 mt-0.5">{detail}</span>
      </span>
    </label>
  );
}

function RecordOutcome({ initialClassId, initialCourseId }: { initialClassId?: string; initialCourseId?: string }) {
  const toast = useToast();
  const record = useRecordTrialOutcome();
  const courses = useAdminCourses();
  const plans = useAdminPlans();
  const bookedLeads = useCrmLeads({ page: 1, limit: 100, status: 'TRIAL_BOOKED' });

  const [classId, setClassId] = useState(initialClassId ?? '');
  const [won, setWon] = useState(true);
  const [courseId, setCourseId] = useState(initialCourseId ?? '');
  const [placementLevelId, setPlacementLevelId] = useState('');
  const [recommendedPlanId, setRecommendedPlanId] = useState('');
  const [notes, setNotes] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [result, setResult] = useState<TrialOutcomeResult | null>(null);

  const course: CatalogueCourse | undefined = courses.data?.find((c) => c.id === courseId);
  const leadTrials = (bookedLeads.data?.items ?? []).filter((l) => l.trialClassId);
  const placementLevelName = (levelId: string | null | undefined): React.ReactNode => {
    if (!levelId) return '—';
    for (const c of courses.data ?? []) {
      const level = c.levels.find((l) => l.id === levelId);
      if (level) return `${c.name} · ${level.position}. ${level.name}`;
    }
    return 'Level set';
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isUuid(classId)) return toast.error('Enter the trial class id.');
    const body = {
      won,
      placementLevelId: won && placementLevelId ? placementLevelId : undefined,
      recommendedPlanId: won && recommendedPlanId ? recommendedPlanId : undefined,
      notes: notes.trim() || undefined,
      lostReason: !won && lostReason.trim() ? lostReason.trim() : undefined,
    };
    const errors = validateTrialOutcome(body);
    const first = Object.values(errors)[0];
    if (first) return toast.error(first);
    record.mutate(
      { classId: classId.trim(), ...body },
      {
        onSuccess: (res) => {
          setResult(res);
          if (res.alreadyRecorded) toast.success('An outcome was already recorded — showing the original link');
          else toast.success(won ? 'Trial marked won; enrolment is now active' : 'Trial outcome recorded');
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <div className="space-y-5">
    <RecentTrialsCard
      selectedId={classId}
      onPick={(t) => {
        setClassId(t.id);
        const match = courses.data?.find((c) => c.code === t.course.code);
        if (match) {
          setCourseId(match.id);
          setPlacementLevelId('');
        }
      }}
    />
    <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,360px)] items-start">
      <Card>
        <CardHeader
          title="Trial outcome"
          description={
            billingEnabled()
              ? "Completes the trial class and mints the family's subscribe token (once per trial)."
              : 'Completes the trial class and records the placement (once per trial).'
          }
        />
        <CardBody>
          <form onSubmit={submit} noValidate className="space-y-4">
            {leadTrials.length > 0 && (
              <Field label="Trial from a CRM lead" htmlFor="outcome-lead">
                <Select id="outcome-lead" value={leadTrials.some((l) => l.trialClassId === classId) ? classId : ''} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">Choose a booked lead…</option>
                  {leadTrials.map((l) => (
                    <option key={l.id} value={l.trialClassId as string}>
                      {l.contactName}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field
              label="Trial class reference"
              htmlFor="outcome-class"
              required
              hint={'Filled in when you choose a CRM lead or press “Record its outcome” after booking; otherwise paste the reference from “Copy class reference”.'}
              error={classId && !isUuid(classId) ? 'That is not a valid class reference.' : null}
            >
              <TextInput id="outcome-class" value={classId} onChange={(e) => setClassId(e.target.value)} autoComplete="off" />
            </Field>
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-ink-2 mb-1">Result</legend>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="outcome-won" checked={won} onChange={() => setWon(true)} className="accent-green-800" />
                  Won — family is enrolling
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="outcome-won" checked={!won} onChange={() => setWon(false)} className="accent-green-800" />
                  Not converted
                </label>
              </div>
            </fieldset>
            {won ? (
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Course (for placement level)" htmlFor="outcome-course">
                  <Select
                    id="outcome-course"
                    value={courseId}
                    onChange={(e) => {
                      setCourseId(e.target.value);
                      setPlacementLevelId('');
                    }}
                  >
                    <option value="">Select a course</option>
                    {(courses.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Placement level" htmlFor="outcome-level">
                  <Select id="outcome-level" value={placementLevelId} disabled={!course} onChange={(e) => setPlacementLevelId(e.target.value)}>
                    <option value="">{course ? 'No placement level' : 'Choose a course first'}</option>
                    {(course?.levels ?? []).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.position}. {l.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Recommended plan" htmlFor="outcome-plan" className="sm:col-span-2">
                  <Select id="outcome-plan" value={recommendedPlanId} onChange={(e) => setRecommendedPlanId(e.target.value)}>
                    <option value="">{plans.isLoading ? 'Loading plans…' : 'No recommendation'}</option>
                    {(plans.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.classesPerWeek}×{p.classMinutes} min · {humanize(p.roomType)}
                        {p.tier ? ` · ${p.tier.name} tier` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <Field label="Why it did not convert" htmlFor="outcome-lost" hint="Stored on the audit record.">
                <TextArea id="outcome-lost" value={lostReason} maxLength={2000} onChange={(e) => setLostReason(e.target.value)} />
              </Field>
            )}
            <Field label="Notes" htmlFor="outcome-notes">
              <TextArea id="outcome-notes" value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <div className="flex justify-end">
              <UiButton type="submit" loading={record.isPending} icon={<Sparkles className="w-4 h-4" />}>
                Record outcome
              </UiButton>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={billingEnabled() ? 'Subscribe link' : 'Outcome'} />
        <CardBody>
          {result ? (
            <div className="space-y-3">
              {result.alreadyRecorded && (
                <Alert tone="warning">An outcome already existed for this trial, so nothing changed. This is the original token.</Alert>
              )}
              <DetailList
                items={[
                  ['Completed', formatDateTime(result.outcome.completedAt)],
                  ['Placement level', placementLevelName(result.outcome.placementLevelId)],
                  ['Plan', result.outcome.recommendedPlanId ? <PlanName key="p" planId={result.outcome.recommendedPlanId} /> : '—'],
                ]}
              />
              {billingEnabled() && (
                <>
                  <div>
                    <p className="text-xs font-semibold text-ink-2 mb-1">Subscribe token</p>
                    <code className="block text-[11px] break-all rounded-lg bg-sand px-3 py-2 text-ink">{result.subscribeToken}</code>
                  </div>
                  <CopyButton value={result.subscribeToken} label="Copy token" />
                </>
              )}
              <p className="text-[11px] text-muted">
                {billingEnabled() ? 'Send this token to the family with their offer. Then update' : 'Update'} the lead in the{' '}
                <Link href="/admin/crm" className="text-green-700 underline">
                  CRM
                </Link>{' '}
                — recording an outcome does not move the lead.
              </p>
            </div>
          ) : (
            <EmptyState
              title="No outcome recorded yet"
              description={billingEnabled() ? 'The token appears here once the outcome is saved.' : 'The result appears here once the outcome is saved.'}
            />
          )}
        </CardBody>
      </Card>
    </div>
    </div>
  );
}

const TRIAL_LOOKBACK_DAYS = 21;

/**
 * Stopgap until the API lists trial classes (backend M22): past trial classes found on the
 * cleared teachers' timetables, so a family's self-booked trial can be found and its outcome
 * recorded without pasting a reference.
 */
function RecentTrialsCard({ selectedId, onPick }: { selectedId: string; onPick: (t: RecentTrialClass) => void }) {
  const directory = useTeachers();
  const enrolments = useAdminEnrolments();
  const teachers = useMemo(
    () => mergeTeacherOptions([], directory.allTeachers, enrolments.data ?? [], ''),
    [directory.allTeachers, enrolments.data],
  );
  const [range] = useState(() => {
    const now = Date.now();
    return { from: addDays(new Date(now), -TRIAL_LOOKBACK_DAYS).toISOString(), to: new Date(now).toISOString(), tz: viewerTimeZone(), now };
  });
  const trials = useRecentTrialClasses(teachers, range);
  const listsLoading = directory.isLoading || enrolments.isLoading;

  return (
    <Card>
      <CardHeader
        title="Recent trial classes"
        description={`Past ${TRIAL_LOOKBACK_DAYS} days, from every cleared teacher's timetable. An outcome may already be recorded for some; recording again shows the original.`}
      />
      <CardBody>
        {listsLoading || trials.isLoading ? (
          <p className="text-sm text-muted">Checking teacher timetables…</p>
        ) : trials.data.length === 0 ? (
          <EmptyState
            title="No trial classes found"
            description={trials.failed > 0 ? `${trials.failed} timetable${trials.failed === 1 ? '' : 's'} could not be loaded.` : undefined}
          />
        ) : (
          <ul className="divide-y divide-line">
            {trials.data.map((t) => (
              <li key={t.id} className="py-2.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {t.students.map((s) => s.student.displayName).join(', ') || 'No student attached'}
                    <span className="text-muted font-normal"> · {t.course.name}</span>
                  </p>
                  <p className="text-[11px] text-muted">
                    {formatDateTime(t.startsAt)} · with {t.teacherName} · {humanize(t.status)}
                  </p>
                </div>
                <UiButton
                  size="sm"
                  variant={selectedId === t.id ? 'primary' : 'secondary'}
                  onClick={() => onPick(t)}
                  aria-pressed={selectedId === t.id}
                >
                  {selectedId === t.id ? 'Selected' : 'Record outcome'}
                </UiButton>
              </li>
            ))}
          </ul>
        )}
        {trials.failed > 0 && trials.data.length > 0 && (
          <p className="text-[11px] text-muted mt-2">
            {trials.failed} timetable{trials.failed === 1 ? '' : 's'} could not be loaded, so this list may be incomplete.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/** A plan's name from the catalogue; never its raw id (a neutral label while loading or if unknown). */
export function PlanName({ planId }: { planId: string }) {
  const { plans, isLoading } = usePlans();
  const plan = plans.find((p) => p.id === planId);
  if (plan) return <span>{plan.name}</span>;
  return <span className="text-muted">{isLoading ? 'Loading…' : 'Plan no longer offered'}</span>;
}
