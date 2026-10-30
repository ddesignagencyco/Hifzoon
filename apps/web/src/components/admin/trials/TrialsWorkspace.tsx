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
  DataTable,
  EmptyState,
  Field,
  Modal,
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
import { useAdminCourses, useAdminMatching, useAdminOpenSlots } from '@/hooks/useAdminScheduling';
import { useAdminPlans, useBookTrial, useRecordTrialOutcome, useTrialList } from '@/hooks/useAdminAdmissions';
import { useCrmLeads } from '@/hooks/useCrm';
import { LEAD_STAGE_LABEL, LeadStatus, isUuid } from '@/lib/api/modules/crm';
import { FilterSelect } from '@/components/ui/FilterSelect';
import {
  CatalogueCourse,
  OpenSlotQuery,
  WEEKDAYS,
  listTimeZones,
  viewerTimeZone,
} from '@/lib/api/modules/scheduling-admin';
import { TrialClass, TrialListItem, TrialOutcomeResult, validateTrialOutcome } from '@/lib/api/modules/admissions-admin';
import { DetailList, toLocalDateValue, toLocalInputValue } from '../shared/AdminUi';
import { cn } from '@/lib/utils';
import { billingEnabled } from '@/lib/features';
import { TRIAL_SESSIONS_PER_WEEK } from '@/lib/api/modules/backend-updates-oct2026';
import { PickedStudent, StudentPicker, useLoadErrorToast } from '../shared/Pickers';
import { TrialResultForm } from '../../shared/TrialResultForm';

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
          { value: 'outcome', label: 'Trial results' },
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
            <UiButton size="sm" variant="secondary" onClick={onRecordOutcome}>
              Record its result after the class
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
            <Field label="Link a CRM lead" htmlFor="trial-lead" error={invalid === 'lead' ? 'Lead id is not valid.' : null} hint="Optional. Without one, the family's open lead is used, or a new lead is made, so the trial is always in the CRM.">
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
            <CardHeader title="2. Teacher" description="The three best-matched teachers, with why each one fits." />
            <CardBody className="space-y-3">
              <MatchScoreHelp />
              {!student || !courseId ? (
                <EmptyState title="Choose a student and course" description="Suggestions only include fully cleared teachers." />
              ) : (
                <QueryState
                  query={matching}
                  isEmpty={(d) => d.suggestions.length === 0}
                  empty={<EmptyState title="No cleared teacher matches" description="Nobody speaks the student's language yet. The trial can still be booked; the best available teacher is then assigned." />}
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
                            detail="The best-matched teacher who is free at the chosen time is assigned when you book."
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
                              badge={`Match ${Math.round(s.score)} / ${MAX_MATCH_SCORE}`}
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
              {invalid === 'start' && !manualStart && (
                <p className="text-xs text-red-700" role="alert">
                  Pick one of the open times above.
                </p>
              )}
              <details className="rounded-xl border border-line px-3 py-2" open={Boolean(manualStart)}>
                <summary className="cursor-pointer text-xs font-semibold text-ink-2">Book a time outside the listed slots</summary>
                <Field
                  className="mt-3"
                  label="Start time (your local time)"
                  htmlFor="trial-manual"
                  hint="Only when the family and teacher have agreed a time that is not listed. It must be in the future."
                  error={invalid === 'start' && manualStart ? 'Enter a future start time.' : null}
                >
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
              </details>
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

/** Points from the API's matching (scheduling.service `matchTeachers`), for one shared language. */
const MATCH_POINTS: Array<[string, string]> = [
  ['Speaks the family’s language', '+10 (required; others are not suggested)'],
  ['Specialises in this course', '+25'],
  ['Teaches the student’s age group', '+10'],
  ['Same gender as the student', '+5'],
  ['Rating (stars × 4)', 'up to +20'],
];
const MAX_MATCH_SCORE = 70;

function MatchScoreHelp() {
  return (
    <details className="rounded-xl bg-sand px-3 py-2 text-xs text-ink-2">
      <summary className="cursor-pointer font-semibold">How is the match worked out?</summary>
      <p className="mt-2 text-muted">Only approved teachers who are ready to teach are considered. Each one earns points:</p>
      <ul className="mt-1 space-y-0.5">
        {MATCH_POINTS.map(([what, points]) => (
          <li key={what} className="flex justify-between gap-3">
            <span>{what}</span>
            <span className="font-semibold text-ink">{points}</span>
          </li>
        ))}
      </ul>
    </details>
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

function trialLabel(t: TrialListItem) {
  const who = t.students.map((s) => s.student.displayName).join(', ') || 'No student attached';
  return `${who} · ${t.course.name} · ${formatDateTime(t.startsAt)} with ${t.teacherName}`;
}

function RecordOutcome({ initialClassId, initialCourseId }: { initialClassId?: string; initialCourseId?: string }) {
  const toast = useToast();
  const record = useRecordTrialOutcome();
  const courses = useAdminCourses();
  const plans = useAdminPlans();
  const bookedLeads = useCrmLeads({ page: 1, limit: 100, status: 'TRIAL_BOOKED' });

  const [classId, setClassId] = useState(initialClassId ?? '');
  const [picked, setPicked] = useState<TrialListItem | null>(null);
  const [won, setWon] = useState(true);
  const [courseId, setCourseId] = useState(initialCourseId ?? '');
  const [placementLevelId, setPlacementLevelId] = useState('');
  const [recommendedPlanId, setRecommendedPlanId] = useState('');
  const [notes, setNotes] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [result, setResult] = useState<TrialOutcomeResult | null>(null);

  const course: CatalogueCourse | undefined = courses.data?.find((c) => c.id === courseId);
  const leadTrials = (bookedLeads.data?.items ?? []).filter((l) => l.trialClassId);
  const pickedLead = leadTrials.find((l) => l.trialClassId === classId);
  const placementLevelName = (levelId: string | null | undefined): React.ReactNode => {
    if (!levelId) return '—';
    for (const c of courses.data ?? []) {
      const level = c.levels.find((l) => l.id === levelId);
      if (level) return `${c.name} · ${level.position}. ${level.name}`;
    }
    return 'Level set';
  };
  const selectedLabel = picked?.id === classId ? trialLabel(picked) : pickedLead ? `Trial for ${pickedLead.contactName}` : 'The trial you just booked';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isUuid(classId)) return toast.error('Choose a trial from the list above first.');
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
          if (res.alreadyRecorded) toast.success('This trial already had a saved result — nothing was changed');
          else toast.success(won ? 'Saved. The child is now enrolled.' : 'Saved. The trial is closed.');
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
        setPicked(t);
        setResult(null);
        const match = courses.data?.find((c) => c.code === t.course.code);
        if (match) {
          setCourseId(match.id);
          setPlacementLevelId('');
        }
      }}
    />
    {!classId && leadTrials.length === 0 ? (
      <Card>
        <EmptyState
          title="Choose a trial to record its result"
          description="Press “Record result” on a trial in the list above. Trials with a saved result can be opened with “View / edit”."
        />
      </Card>
    ) : (
    <div className={cn('grid items-start gap-5', result && 'lg:grid-cols-[1fr_minmax(0,360px)]')}>
      <Card>
        <CardHeader title="Trial result" description="How did the trial go? Save it after the class; you can change it later with “View / edit” in the list." />
        <CardBody>
          <form onSubmit={submit} noValidate className="space-y-4">
            {leadTrials.length > 0 && (
              <Field label="Or choose a trial from a CRM lead" htmlFor="outcome-lead">
                <Select
                  id="outcome-lead"
                  value={pickedLead ? classId : ''}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setResult(null);
                  }}
                >
                  <option value="">Choose a booked lead…</option>
                  {leadTrials.map((l) => (
                    <option key={l.id} value={l.trialClassId as string}>
                      {l.contactName}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="rounded-xl border border-line bg-sand px-3 py-2.5 text-sm" aria-live="polite">
              <span className="block text-xs font-semibold text-ink-2">Trial</span>
              {classId ? <span className="text-ink">{selectedLabel}</span> : <span className="text-muted">Press “Record result” on a trial in the list above.</span>}
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-ink-2 mb-1">Result</legend>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="outcome-won" checked={won} onChange={() => setWon(true)} className="accent-green-800" />
                  The family wants to continue
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="outcome-won" checked={!won} onChange={() => setWon(false)} className="accent-green-800" />
                  Not continuing
                </label>
              </div>
            </fieldset>
            {won ? (
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Course" htmlFor="outcome-course">
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
                <Field label="Level the child starts at" htmlFor="outcome-level">
                  <Select id="outcome-level" value={placementLevelId} disabled={!course} onChange={(e) => setPlacementLevelId(e.target.value)}>
                    <option value="">{course ? 'Not decided' : 'Choose a course first'}</option>
                    {(course?.levels ?? []).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.position}. {l.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Plan you recommend" htmlFor="outcome-plan" className="sm:col-span-2" hint="The family sees the price for their currency when they subscribe.">
                  <Select id="outcome-plan" value={recommendedPlanId} onChange={(e) => setRecommendedPlanId(e.target.value)}>
                    <option value="">{plans.isLoading ? 'Loading plans…' : 'No recommendation'}</option>
                    {(plans.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.classesPerWeek} classes a week × {p.classMinutes} min · {humanize(p.roomType)}
                        {p.tier ? ` · ${p.tier.name} tier` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <Field label="Why not?" htmlFor="outcome-lost" hint="Kept on the audit record.">
                <TextArea id="outcome-lost" value={lostReason} maxLength={2000} onChange={(e) => setLostReason(e.target.value)} />
              </Field>
            )}
            <Field label="Notes" htmlFor="outcome-notes">
              <TextArea id="outcome-notes" value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <div className="flex justify-end">
              <UiButton type="submit" loading={record.isPending} disabled={!classId} icon={<Sparkles className="w-4 h-4" />}>
                Save result
              </UiButton>
            </div>
          </form>
        </CardBody>
      </Card>

      {result && (
        <Card>
          <CardHeader title="What happens next" />
          <CardBody>
            <div className="space-y-3">
              {result.alreadyRecorded && (
                <Alert tone="neutral">
                  This trial already had a result, saved on {formatDateTime(result.outcome.completedAt)}, so nothing was changed. To change it, use
                  “View / edit” on the trial in the list.
                </Alert>
              )}
              <DetailList
                items={[
                  ['Saved', formatDateTime(result.outcome.completedAt)],
                  ['Level', placementLevelName(result.outcome.placementLevelId)],
                  ['Plan', result.outcome.recommendedPlanId ? <PlanName key="p" planId={result.outcome.recommendedPlanId} /> : '—'],
                ]}
              />
              {result.alreadyRecorded || won ? (
                <ol className="list-decimal space-y-1.5 pl-4 text-xs text-ink-2">
                  <li>The child is now enrolled on the course with this teacher.</li>
                  {billingEnabled() ? (
                    <>
                      <li>
                        The family sees “Continue with your teacher” in their account. They choose a plan and their weekly class times, then pay by
                        card.
                      </li>
                      <li>Once they have paid, their weekly classes are booked automatically. Nothing to set up by hand.</li>
                    </>
                  ) : (
                    <li>
                      Set up the weekly classes with the teacher in{' '}
                      <Link href="/admin/scheduling" className="text-green-700 underline">
                        Scheduling
                      </Link>
                      .
                    </li>
                  )}
                  <li>
                    The family’s{' '}
                    <Link href="/admin/crm" className="text-green-700 underline">
                      CRM
                    </Link>{' '}
                    lead is now at “Trial done”, and moves to “Enrolled” by itself when they pay.
                  </li>
                </ol>
              ) : (
                <p className="text-xs text-ink-2">
                  The trial is closed and the child is not enrolled. The family’s{' '}
                  <Link href="/admin/crm" className="text-green-700 underline">
                    CRM
                  </Link>{' '}
                  lead is marked as lost with your reason.
                </p>
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
    )}
    </div>
  );
}

type TrialView = 'all' | 'needs' | 'saved' | 'upcoming';

/** Where a trial stands: still to happen, waiting for a result, or done. */
function trialState(t: TrialListItem, now: number): 'upcoming' | 'needs' | 'saved' {
  if (t.result) return 'saved';
  return new Date(t.startsAt).getTime() > now ? 'upcoming' : 'needs';
}

/**
 * Every trial class from 30 days back to 30 days ahead, read from the API with its saved
 * result and CRM lead, so a trial booked a minute ago (by the family or an admin) is here.
 */
function RecentTrialsCard({ selectedId, onPick }: { selectedId: string; onPick: (t: TrialListItem) => void }) {
  const trials = useTrialList();
  const [view, setView] = useState<TrialView>('all');
  const [viewing, setViewing] = useState<TrialListItem | null>(null);
  const now = trials.dataUpdatedAt;
  const rows = (trials.data ?? []).filter((t) => view === 'all' || trialState(t, now) === view);
  const count = (v: TrialView) => (trials.data ?? []).filter((t) => trialState(t, now) === v).length;

  return (
    <Card>
      <CardHeader
        title="Trial classes"
        description="Every trial from the last 30 days and the next 30, with its result and the family's CRM lead. Record the result after the class."
        action={
          <FilterSelect
            id="trial-view"
            label="Show"
            value={view}
            onChange={(v) => setView(v as TrialView)}
            options={[
              { value: 'all', label: `All trials (${trials.data?.length ?? 0})` },
              { value: 'needs', label: `Needs a result (${count('needs')})` },
              { value: 'saved', label: `Result saved (${count('saved')})` },
              { value: 'upcoming', label: `Upcoming (${count('upcoming')})` },
            ]}
          />
        }
      />
      <CardBody>
        <QueryState
          query={{ ...trials, data: trials.data ? rows : undefined }}
          loadingLabel="Loading trials…"
          empty={<EmptyState title={view === 'needs' ? 'Every trial has a result' : 'No trial classes here'} />}
        >
          {(list) => (
          <DataTable
            rows={list}
            rowKey={(t) => t.id}
            columns={[
              {
                key: 'student',
                header: 'Student',
                sortValue: (t) => t.students[0]?.student.displayName.toLowerCase() ?? '',
                render: (t) => (
                  <span className="block">
                    <span className="font-medium text-ink">{t.students.map((st) => st.student.displayName).join(', ') || 'No student attached'}</span>
                    {t.familyName && <span className="block text-[11px] text-muted">{t.familyName}</span>}
                  </span>
                ),
              },
              { key: 'course', header: 'Course', render: (t) => t.course.name },
              { key: 'teacher', header: 'Teacher', render: (t) => t.teacherName },
              { key: 'when', header: 'When', render: (t) => formatDateTime(t.startsAt), sortValue: (t) => t.startsAt },
              {
                key: 'lead',
                header: 'CRM lead',
                sortValue: (t) => t.lead?.status ?? '',
                render: (t) =>
                  t.lead ? (
                    <Link href="/admin/crm" className="block hover:underline">
                      <span className="block text-xs text-ink">{t.lead.contactName}</span>
                      <span className="block text-[11px] text-muted">{LEAD_STAGE_LABEL[t.lead.status as LeadStatus] ?? humanize(t.lead.status)}</span>
                    </Link>
                  ) : (
                    <span className="text-[11px] text-muted">No lead</span>
                  ),
              },
              {
                key: 'result',
                header: 'Result',
                className: 'text-right',
                sortValue: (t) => trialState(t, now),
                render: (t) => {
                  const state = trialState(t, now);
                  if (state === 'saved' && t.result) {
                    return (
                      <span className="inline-flex items-center gap-2">
                        <Badge tone={t.result.won === false ? 'neutral' : 'green'}>{t.result.won === false ? 'Not continuing' : 'Continuing'}</Badge>
                        <UiButton size="sm" variant="ghost" onClick={() => setViewing(t)}>
                          View / edit
                        </UiButton>
                      </span>
                    );
                  }
                  if (state === 'upcoming') {
                    return <span className="text-[11px] text-muted">After the class</span>;
                  }
                  return (
                    <UiButton
                      size="sm"
                      variant={selectedId === t.id ? 'primary' : 'secondary'}
                      onClick={() => onPick(t)}
                      aria-pressed={selectedId === t.id}
                    >
                      {selectedId === t.id ? 'Selected' : 'Record result'}
                    </UiButton>
                  );
                },
              },
            ]}
          />
          )}
        </QueryState>
      </CardBody>
      {viewing && (
        <Modal open size="md" title="Trial result" description={trialLabel(viewing)} onClose={() => setViewing(null)}>
          <TrialResultForm
            classId={viewing.id}
            courseCode={viewing.course.code}
            childName={viewing.students.map((s) => s.student.displayName).join(', ') || undefined}
            onDone={() => setViewing(null)}
          />
        </Modal>
      )}
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
