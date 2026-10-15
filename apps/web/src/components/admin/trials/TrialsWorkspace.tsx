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
  formatMoney,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminCourses, useAdminMatching, useAdminOpenSlots } from '@/hooks/useAdminScheduling';
import { useAdminPlans, useBookTrial, useRecordTrialOutcome } from '@/hooks/useAdminAdmissions';
import { useCrmLeads } from '@/hooks/useCrm';
import { isUuid } from '@/lib/api/modules/crm';
import {
  CatalogueCourse,
  OpenSlotQuery,
  WEEKDAYS,
  listTimeZones,
  viewerTimeZone,
} from '@/lib/api/modules/scheduling-admin';
import { TrialClass, TrialOutcomeResult, validateTrialOutcome } from '@/lib/api/modules/admissions-admin';
import { CopyButton, DetailList, IdText, toLocalDateValue, toLocalInputValue } from '../shared/AdminUi';
import { PickedStudent, StudentPicker, useLoadErrorToast } from '../shared/Pickers';

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
        description="Book a trial with a matched, cleared teacher, then record the result and send the family their subscribe link."
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
            {formatDateTime(lastBooked.trial.startsAt)} · class <IdText id={lastBooked.trial.id} />
          </span>
          <span className="mt-2 flex flex-wrap gap-2">
            <CopyButton value={lastBooked.trial.id} label="Copy class id" />
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
    <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,360px)] items-start">
      <Card>
        <CardHeader title="Trial outcome" description="Completes the trial class and mints the family's subscribe token (once per trial)." />
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
            <Field label="Trial class id" htmlFor="outcome-class" required error={classId && !isUuid(classId) ? 'Not a valid id.' : null}>
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
                    {(plans.data ?? []).map((p) => {
                      const price = p.prices[0];
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.classesPerWeek}×{p.classMinutes} min · {humanize(p.roomType)}
                          {price ? ` · ${formatMoney(price.amountMinor, price.currency)}` : ''}
                        </option>
                      );
                    })}
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
        <CardHeader title="Subscribe link" />
        <CardBody>
          {result ? (
            <div className="space-y-3">
              {result.alreadyRecorded && (
                <Alert tone="warning">An outcome already existed for this trial, so nothing changed. This is the original token.</Alert>
              )}
              <DetailList
                items={[
                  ['Completed', formatDateTime(result.outcome.completedAt)],
                  ['Placement level', result.outcome.placementLevelId ? <IdText key="l" id={result.outcome.placementLevelId} /> : '—'],
                  ['Plan', result.outcome.recommendedPlanId ? <IdText key="p" id={result.outcome.recommendedPlanId} /> : '—'],
                ]}
              />
              <div>
                <p className="text-xs font-semibold text-ink-2 mb-1">Subscribe token</p>
                <code className="block text-[11px] break-all rounded-lg bg-sand px-3 py-2 text-ink">{result.subscribeToken}</code>
              </div>
              <CopyButton value={result.subscribeToken} label="Copy token" />
              <p className="text-[11px] text-muted">
                Send this token to the family with their offer. Then update the lead in the{' '}
                <Link href="/admin/crm" className="text-green-700 underline">
                  CRM
                </Link>{' '}
                — recording an outcome does not move the lead.
              </p>
            </div>
          ) : (
            <EmptyState title="No outcome recorded yet" description="The token appears here once the outcome is saved." />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
