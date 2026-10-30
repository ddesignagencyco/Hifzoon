'use client';

import React from 'react';
import Link from 'next/link';
import { Bell, BookOpen, Video } from 'lucide-react';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  QueryState,
  StatusBadge,
  formatDateTime,
} from '@/components/ui/primitives';
import { useMyEnrolments, useStudentInbox, useStudentProfile, useStudentTimetable } from '@/hooks/useStudent';
import { useNow } from '@/hooks/useCases';
import { StudentNotification } from '@/lib/api/modules/student';
import type { TimetableEntry } from '@/lib/api/modules/scheduling-family';
import { describeNotification, NotificationRecord } from '@/lib/api/modules/notifications';

function notificationTitle(n: StudentNotification): string {
  return describeNotification(n as unknown as NotificationRecord).title;
}

/** Student home: upcoming classes, notifications and courses. */
export function StudentOverview() {
  const profile = useStudentProfile();
  const inbox = useStudentInbox(50);
  const firstName = profile.data?.name?.split(' ')[0];

  return (
    <>
      <PageHeader
        eyebrow="Student portal"
        title={firstName ? `Assalamu alaikum, ${firstName}` : 'Welcome'}
        description={profile.data ? `Times are shown in ${profile.data.timeZone.replace(/_/g, ' ')}.` : undefined}
      />

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <UpcomingClasses timeZone={profile.data?.timeZone} />

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Latest notifications"
              action={
                <Link href="/student/notifications" className="text-xs font-semibold text-green-800 hover:underline">
                  View all
                </Link>
              }
            />
            <CardBody>
              <QueryState
                query={inbox}
                isEmpty={(d) => d.items.length === 0}
                empty={<EmptyState icon={<Bell className="w-5 h-5" aria-hidden />} title="No notifications yet" />}
              >
                {(data) => (
                  <ul className="space-y-3">
                    {data.items.slice(0, 5).map((n) => (
                      <li key={n.id}>
                        <p className="text-sm text-ink">{notificationTitle(n)}</p>
                        <p className="text-[11px] text-muted">{formatDateTime(n.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </QueryState>
            </CardBody>
          </Card>

          <MyCourses />

          <Alert tone="neutral" title="Lesson cards & progress">
            Your lesson cards, homework and progress are shared with your guardian after each class and can be viewed in
            the family portal. They are not yet available on student accounts.
          </Alert>

          <Link
            href="/courses"
            className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-sm text-ink hover:bg-sand"
          >
            <BookOpen className="w-5 h-5 text-gold-600" aria-hidden />
            Browse the course syllabuses
          </Link>
        </div>
      </div>
    </>
  );
}

/** The student's own enrolments (`GET /courses/enrolments/list`, backend M7). */
function MyCourses() {
  const enrolments = useMyEnrolments();
  return (
    <Card>
      <CardHeader title="Your courses" />
      <CardBody>
        <QueryState
          query={enrolments}
          loadingLabel="Loading courses…"
          empty={<EmptyState icon={<BookOpen className="w-5 h-5" aria-hidden />} title="No courses yet" />}
        >
          {(rows) => (
            <ul className="divide-y divide-line">
              {rows.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{e.course.name}</p>
                    <p className="text-[11px] text-muted">
                      {e.teacher ? e.teacher.user.name : 'Teacher not assigned yet'}
                      {e.currentLevel ? ` · ${e.currentLevel.name}` : ''} · lesson {e.currentLessonPosition}
                    </p>
                  </div>
                  <StatusBadge status={e.status} />
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}


const JOIN_OPENS_MS = 10 * 60 * 1000;

const isCancelled = (c: TimetableEntry) => c.status.startsWith('CANCELLED');

function canJoin(c: TimetableEntry, now: number) {
  const start = new Date(c.startsAt).getTime();
  const end = new Date(c.endsAt).getTime();
  return !isCancelled(c) && c.status !== 'COMPLETED' && now >= start - JOIN_OPENS_MS && now <= end;
}

/** The student's own timetable (`GET /scheduling/students/me/timetable`, M49). */
function UpcomingClasses({ timeZone }: { timeZone: string | undefined }) {
  const timetable = useStudentTimetable(timeZone);
  const now = useNow(30_000);
  return (
    <Card>
      <CardHeader title="Your classes" description="The next two weeks. The classroom opens 10 minutes before each class." />
      <CardBody>
        <QueryState
          query={{ ...timetable, data: timetable.data?.filter((c) => new Date(c.endsAt).getTime() >= now) }}
          loadingLabel="Loading your classes…"
          empty={
            <EmptyState
              icon={<Video className="w-5 h-5" aria-hidden />}
              title="No classes in the next two weeks"
              description="When your guardian books classes they appear here."
            />
          }
        >
          {(rows) => (
            <ul className="divide-y divide-line">
              {[...rows]
                .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
                .map((c) => {
                  const joinable = canJoin(c, now);
                  return (
                    <li key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-ink">{c.course?.name ?? 'Class'}</p>
                          {c.status !== 'SCHEDULED' && <StatusBadge status={c.status} />}
                          {c.type === 'TRIAL' && <StatusBadge status="TRIAL" />}
                        </div>
                        <p className="text-[11px] text-muted">
                          {formatDateTime(c.startsAt, timeZone)} · with {c.teacher.user.name}
                        </p>
                      </div>
                      {joinable ? (
                        <Link
                          href={`/student/classroom/${c.id}`}
                          className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-green-800 text-white text-xs font-semibold hover:bg-green-700"
                        >
                          <Video className="w-3.5 h-3.5" aria-hidden /> Join class
                        </Link>
                      ) : (
                        <span className="text-[11px] text-muted">{isCancelled(c) ? 'Cancelled' : c.status === 'COMPLETED' ? 'Finished' : 'Opens 10 min before'}</span>
                      )}
                    </li>
                  );
                })}
            </ul>
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}
