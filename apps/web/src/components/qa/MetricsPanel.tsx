'use client';

import React from 'react';
import { Card, CardBody, CardHeader, QueryState, StatTile } from '@/components/ui/primitives';
import { useTeacherMetrics } from '@/hooks/useQa';
import { pct } from '@/lib/api/modules/ops-admin';

/** Attendance, punctuality, lesson cards, retention and progress for one teacher (rates are "—" when nothing to measure). */
export function MetricsPanel({ teacherId, months }: { teacherId: string; months: number }) {
  const query = useTeacherMetrics(teacherId, months);
  return (
    <Card>
      <CardHeader title="Performance metrics" description={`Last ${months} month${months === 1 ? '' : 's'}. A student who does not turn up is not counted against the teacher.`} />
      <CardBody>
        <QueryState query={query} isEmpty={() => false}>
          {(m) => (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatTile label="Attendance" value={pct(m.attendance.rate)} hint={`${m.attendance.completed} taught · ${m.attendance.teacherNoShow} no-show · ${m.attendance.teacherCancelled} cancelled`} />
              <StatTile label="Punctuality" value={pct(m.punctuality.rate)} hint={`${m.punctuality.onTime} of ${m.punctuality.classes} joined within ${m.punctuality.withinMinutes} min`} />
              <StatTile label="Lesson cards" value={pct(m.lessonCards.rate)} hint={`${m.lessonCards.withSubmittedCard} of ${m.lessonCards.completedClasses} classes`} />
              <StatTile label="Retention" value={pct(m.retention.rate)} hint={`${m.retention.stillEnrolled} of ${m.retention.enrolmentsBeforeWindow} still enrolled`} />
              <StatTile label="Student progress" value={pct(m.progress.goodShare)} hint={`${m.progress.goodOrBetter} of ${m.progress.gradedPortions} portions Good or better`} />
            </div>
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}
