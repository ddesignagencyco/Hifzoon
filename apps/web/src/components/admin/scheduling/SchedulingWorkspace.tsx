'use client';

import React, { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Column,
  DataTable,
  EmptyState,
  Field,
  PageHeader,
  QueryState,
  Select,
  StatusBadge,
  Tabs,
  TextInput,
  formatDate,
  humanize,
} from '@/components/ui/primitives';
import {
  useAdminSchedule,
  useAdminSchedules,
  useAdminTeacherAvailability,
  useAdminTeacherTimetable,
} from '@/hooks/useAdminScheduling';
import { isUuid } from '@/lib/api/modules/crm';
import {
  CreatedSchedule,
  ScheduleDetail,
  TimetableEntry,
  WEEKDAYS,
  describeRRule,
  listTimeZones,
  viewerTimeZone,
} from '@/lib/api/modules/scheduling-admin';
import { DetailList, IdText, toLocalDateValue } from '../shared/AdminUi';
import { PickedTeacher, TeacherPicker } from '../shared/Pickers';
import { CreatedScheduleSummary, ScheduleBuilder } from './ScheduleBuilder';

type Tab = 'create' | 'view' | 'timetable';

/** `/admin/scheduling` — recurring schedule builder, schedule viewer and teacher timetable. */
export function SchedulingWorkspace({
  initialEnrolmentId,
  initialTeacherId,
  initialScheduleId,
}: {
  initialEnrolmentId?: string;
  initialTeacherId?: string;
  initialScheduleId?: string;
}) {
  const [tab, setTab] = useState<Tab>(initialScheduleId ? 'view' : 'create');
  const [scheduleId, setScheduleId] = useState(initialScheduleId ?? '');
  const [created, setCreated] = useState<CreatedSchedule | null>(null);

  const view = (id: string) => {
    setScheduleId(id);
    setTab('view');
  };

  return (
    <>
      <PageHeader
        eyebrow="Academy admin"
        title="Scheduling"
        description="Set up a student's regular weekly classes, look up a schedule and its classes, and see any teacher's timetable."
      />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'create', label: 'New recurring schedule' },
          { value: 'view', label: 'View a schedule' },
          { value: 'timetable', label: 'Teacher timetable' },
        ]}
      />
      {tab === 'create' && (
        <div className="space-y-4">
          {created && <CreatedScheduleSummary result={created} onView={view} />}
          <ScheduleBuilder initialEnrolmentId={initialEnrolmentId} initialTeacherId={initialTeacherId} onCreated={setCreated} />
        </div>
      )}
      {tab === 'view' && <ScheduleViewer key={scheduleId} initialId={scheduleId} onLoad={setScheduleId} />}
      {tab === 'timetable' && <TeacherTimetable initialTeacherId={initialTeacherId} />}
    </>
  );
}

function ScheduleViewer({ initialId, onLoad }: { initialId: string; onLoad: (id: string) => void }) {
  const list = useAdminSchedules();
  const schedule = useAdminSchedule(isUuid(initialId) ? initialId : null);
  const time = (iso: string) => (iso.includes('T') ? iso.slice(11, 16) : iso.slice(0, 5));

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <Field label="Schedule" htmlFor="schedule-id" hint="Type a student, course or teacher name.">
          <Select
            id="schedule-id"
            value={isUuid(initialId) ? initialId : ''}
            searchable
            onChange={(e) => e.target.value && onLoad(e.target.value)}
          >
            <option value="">{list.isLoading ? 'Loading schedules…' : 'Select a schedule'}</option>
            {(list.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.enrolment.student.displayName} · {s.enrolment.course.name} with {s.teacher.user.name} · {describeRRule(s.rrule)} at{' '}
                {time(s.localStartTime)}
                {s.status !== 'ACTIVE' ? ` · ${humanize(s.status)}` : ''}
              </option>
            ))}
          </Select>
        </Field>
      </Card>
      {!isUuid(initialId) ? (
        <Card>
          <EmptyState title="Choose a schedule" description="Pick one above to see its details and every class it has booked." />
        </Card>
      ) : (
        <QueryState query={schedule} loadingLabel="Loading schedule…">
          {(s) => <ScheduleDetailCard schedule={s} />}
        </QueryState>
      )}
    </div>
  );
}

function ScheduleDetailCard({ schedule }: { schedule: ScheduleDetail }) {
  const columns: Column<ScheduleDetail['sessions'][number]>[] = [
    { key: 'local', header: `Family time (${schedule.familyTimeZone})`, render: (s) => s.localStart },
    {
      key: 'mine',
      header: 'Your time',
      render: (s) => new Date(s.startsAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr] items-start">
      <Card>
        <CardHeader title={`${schedule.enrolment.student.displayName} with ${schedule.teacher.user.name}`} />
        <CardBody>
          <DetailList
            items={[
              ['Status', <StatusBadge key="s" status={schedule.status} />],
              ['Repeats', describeRRule(schedule.rrule)],
              ['Time', `${schedule.localStartTime} · ${schedule.durationMinutes} min`],
              ['Family time zone', schedule.familyTimeZone],
              ['Room', humanize(schedule.roomType)],
              ['Starts', formatDate(schedule.startsOn)],
              ['Ends', schedule.endsOn ? formatDate(schedule.endsOn) : 'No end date'],
              ['Classes booked until', schedule.materialisedUntil ? formatDate(schedule.materialisedUntil) : 'Not yet'],
              ['Student', schedule.enrolment.student.displayName],
              ['Teacher', schedule.teacher.user.name],
              ['Reference', <IdText key="i" id={schedule.id} label="schedule reference" />],
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Classes from this schedule"
          description={`${schedule.sessions.length} classes. New ones are added automatically about two months ahead.`}
        />
        <CardBody>
          <DataTable columns={columns} rows={schedule.sessions} rowKey={(s) => s.id} empty={<EmptyState title="No classes booked yet" />} />
        </CardBody>
      </Card>
    </div>
  );
}

function TeacherTimetable({ initialTeacherId }: { initialTeacherId?: string }) {
  const zones = useMemo(() => listTimeZones(), []);
  const [teacher, setTeacher] = useState<PickedTeacher | null>(initialTeacherId ? { id: initialTeacherId, name: 'Teacher' } : null);
  const [fromDate, setFromDate] = useState(() => toLocalDateValue(new Date()));
  const [days, setDays] = useState(7);
  const [tz, setTz] = useState(viewerTimeZone);

  const range = useMemo(() => {
    const from = new Date(`${fromDate}T00:00:00`);
    const valid = !Number.isNaN(from.getTime());
    const start = valid ? from : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [fromDate, days]);

  const timetable = useAdminTeacherTimetable(teacher?.id, range.from, range.to, tz);
  const availability = useAdminTeacherAvailability(teacher?.id);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_1fr] items-start">
      <Card>
        <CardHeader title="Teacher & range" />
        <CardBody className="space-y-4">
          <TeacherPicker id="tt-teacher" value={teacher?.id ?? ''} onChange={setTeacher} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="tt-from">
              <TextInput id="tt-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </Field>
            <Field label="Days" htmlFor="tt-days">
              <Select id="tt-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[7, 14, 28].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Show in time zone" htmlFor="tt-zone">
            <Select id="tt-zone" value={tz} onChange={(e) => setTz(e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>
          {teacher && (
            <div>
              <p className="text-xs font-semibold text-ink-2 mb-1">Weekly availability</p>
              <QueryState query={availability} empty={<p className="text-xs text-muted">No availability set.</p>} isEmpty={(a) => a.slots.length === 0}>
                {(a) => (
                  <ul className="text-xs text-ink-2 space-y-0.5">
                    {a.slots.map((s, i) => (
                      <li key={i}>
                        {WEEKDAYS[s.weekday]?.long} {s.startTime}–{s.endTime} <span className="text-muted">({s.timeZone})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </QueryState>
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Classes" description={teacher ? `Shown in ${tz}. Cancelled classes are hidden.` : undefined} />
        <CardBody>
          {!teacher ? (
            <EmptyState icon={<CalendarDays className="w-5 h-5" />} title="Choose a teacher" />
          ) : (
            <QueryState query={timetable} empty={<EmptyState title="No classes in this range" />}>
              {(rows) => <TimetableList rows={rows} tz={tz} />}
            </QueryState>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function TimetableList({ rows, tz }: { rows: TimetableEntry[]; tz: string }) {
  const groups = useMemo(() => {
    const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short', timeZone: tz });
    const map = new Map<string, TimetableEntry[]>();
    for (const r of rows) {
      const key = fmtDay.format(new Date(r.startsAt));
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows, tz]);
  const fmtTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone: tz });

  return (
    <div className="space-y-5">
      {groups.map(([day, items]) => (
        <section key={day} aria-label={day}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 font-sans">{day}</h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {items.map((r) => (
              <li key={r.id} className="px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {fmtTime.format(new Date(r.startsAt))}–{fmtTime.format(new Date(r.endsAt))} · {r.course.name}
                  </p>
                  <p className="text-xs text-muted">{r.students.map((s) => s.student.displayName).join(', ') || 'No students linked'}</p>
                  {r.type === 'TRIAL' && (
                    <p className="text-[11px] text-muted">
                      Trial class <IdText id={r.id} label="trial class reference" />
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {r.type !== 'REGULAR' && <Badge tone={r.type === 'TRIAL' ? 'gold' : 'neutral'}>{humanize(r.type)}</Badge>}
                  <StatusBadge status={r.status} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
