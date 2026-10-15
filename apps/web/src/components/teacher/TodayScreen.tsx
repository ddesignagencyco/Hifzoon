'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, GraduationCap, Star, Sun } from 'lucide-react';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  QueryState,
  StatTile,
} from '@/components/ui/primitives';
import { useTeacherIdentity, useTeacherRating } from '@/hooks/useTeacher';
import { useTeacherTimetable } from '@/hooks/useTeacherSchedule';
import { TimetableClass } from '@/lib/api/modules/teacher-schedule';
import { ClassDetailModal } from './ClassDetailModal';
import { ClassListItem } from './ClassListItem';
import { TeacherIdentityGate } from './TeacherIdentityGate';
import { addDays, formatPlainDate, plainDateInZone, zonedTimeToUtc } from './zoned-time';

/** `/teacher` — today's and the coming week's classes with quick stats (FR-TCH-03). */
export function TodayScreen() {
  const identity = useTeacherIdentity();
  const firstName = identity.user?.name?.split(' ').slice(0, 2).join(' ');
  return (
    <>
      <PageHeader
        eyebrow="Teacher portal"
        title={firstName ? `Assalamu alaikum, ${firstName}` : 'Today'}
        description="Your classes today and over the next seven days, with the pre-class brief one tap away."
        actions={
          <Link href="/teacher/timetable" className="text-sm font-semibold text-green-700 hover:underline">
            Full timetable
          </Link>
        }
      />
      <TeacherIdentityGate what="your classes">
        {({ teacherId, zone }) => <TodayContent teacherId={teacherId} zone={zone} activeStudents={countActiveStudents(identity.enrolments.data)} />}
      </TeacherIdentityGate>
    </>
  );
}

function countActiveStudents(enrolments: Array<{ status: string; student: { id: string } }> | undefined): number {
  if (!enrolments) return 0;
  return new Set(enrolments.filter((e) => e.status === 'ACTIVE' || e.status === 'TRIAL').map((e) => e.student.id)).size;
}

function TodayContent({ teacherId, zone, activeStudents }: { teacherId: string; zone: string; activeStudents: number }) {
  const [today] = useState(() => plainDateInZone(new Date(), zone));
  const [range] = useState(() => ({
    from: zonedTimeToUtc(today, '00:00', zone).toISOString(),
    to: zonedTimeToUtc(addDays(today, 8), '00:00', zone).toISOString(),
    tz: zone,
  }));
  const [selected, setSelected] = useState<TimetableClass | null>(null);
  const timetable = useTeacherTimetable(teacherId, range);
  const rating = useTeacherRating(teacherId);

  const classes = timetable.data ?? [];
  const todays = classes.filter((c) => plainDateInZone(new Date(c.startsAt), zone) === today);
  const upcoming = classes.filter((c) => plainDateInZone(new Date(c.startsAt), zone) !== today);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Classes today" value={timetable.data ? todays.length : '—'} icon={<Sun className="w-4 h-4" aria-hidden />} />
        <StatTile
          label="Next 7 days"
          value={timetable.data ? upcoming.length : '—'}
          icon={<CalendarDays className="w-4 h-4" aria-hidden />}
        />
        <StatTile label="Active students" value={activeStudents} icon={<GraduationCap className="w-4 h-4" aria-hidden />} />
        <StatTile
          label="Family rating"
          value={rating.data?.average != null ? rating.data.average.toFixed(1) : '—'}
          hint={
            rating.isError
              ? 'Rating unavailable'
              : rating.data
                ? rating.data.count === 0
                  ? 'No ratings yet'
                  : `${rating.data.count} rating${rating.data.count === 1 ? '' : 's'}`
                : undefined
          }
          icon={<Star className="w-4 h-4" aria-hidden />}
        />
      </div>

      <Card>
        <CardHeader title={`Today · ${formatPlainDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}`} description={`Times in ${zone}`} />
        <CardBody>
          <QueryState
            query={{ ...timetable, data: timetable.data ? todays : undefined }}
            empty={<EmptyState title="No classes today" description="Enjoy the breathing room — your next classes are listed below." />}
          >
            {(rows) => (
              <ul>
                {rows.map((c) => (
                  <ClassListItem key={c.id} cls={c} zone={zone} onDetails={setSelected} />
                ))}
              </ul>
            )}
          </QueryState>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Coming up" description="The next seven days" />
        <CardBody>
          <QueryState
            query={{ ...timetable, data: timetable.data ? upcoming : undefined }}
            empty={<EmptyState title="Nothing scheduled this week" description="New bookings from families show up here automatically." />}
          >
            {(rows) => (
              <ul>
                {rows.map((c) => (
                  <ClassListItem key={c.id} cls={c} zone={zone} showDate onDetails={setSelected} />
                ))}
              </ul>
            )}
          </QueryState>
        </CardBody>
      </Card>

      {selected && <ClassDetailModal key={selected.id} cls={selected} zone={zone} onClose={() => setSelected(null)} />}
    </div>
  );
}
