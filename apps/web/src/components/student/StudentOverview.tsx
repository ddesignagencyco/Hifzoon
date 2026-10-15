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
  formatDateTime,
} from '@/components/ui/primitives';
import { useStudentInbox, useStudentProfile } from '@/hooks/useStudent';
import { extractClassLinks, StudentNotification } from '@/lib/api/modules/student';

function notificationTitle(n: StudentNotification): string {
  const subject = n.payload?.subject;
  if (typeof subject === 'string' && subject.trim()) return subject;
  return n.type.replace(/[._]/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Student home. Built only from what a student account can read today (profile and
 * own notifications) — see `lib/api/modules/student.ts` for the backend gaps.
 */
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
        <Card>
          <CardHeader title="Your classes" description="Join links from your class notifications." />
          <CardBody>
            <QueryState
              query={inbox}
              isEmpty={(d) => extractClassLinks(d.items).length === 0}
              empty={
                <EmptyState
                  icon={<Video className="w-5 h-5" aria-hidden />}
                  title="No class links yet"
                  description="When a class is shared with your account its join link appears here. Your guardian can see your full timetable in the family portal."
                />
              }
            >
              {(data) => (
                <ul className="divide-y divide-line">
                  {extractClassLinks(data.items).map((link) => (
                    <li key={link.classId} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{link.title}</p>
                        <p className="text-[11px] text-muted">
                          {[
                            link.teacherName && `with ${link.teacherName}`,
                            link.localTime && `${link.localTime}${link.timeZone ? ` (${link.timeZone})` : ''}`,
                            `notified ${formatDateTime(link.createdAt)}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <Link
                        href={`/student/classroom/${link.classId}`}
                        className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-green-800 text-white text-xs font-semibold hover:bg-green-700"
                      >
                        <Video className="w-3.5 h-3.5" aria-hidden /> Open classroom
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </CardBody>
        </Card>

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
