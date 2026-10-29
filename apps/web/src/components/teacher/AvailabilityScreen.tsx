'use client';

import React, { useState } from 'react';
import { Globe2, SunMoon } from 'lucide-react';
import { Card, CardBody, CardHeader, PageHeader, QueryState } from '@/components/ui/primitives';
import { useTeacherAvailability } from '@/hooks/useTeacherSchedule';
import { TeacherAvailability } from '@/lib/api/modules/teacher-schedule';
import { MonthlyAvailabilityEditor } from './MonthlyAvailabilityEditor';
import { isMonthScopedSlot } from './availability-form';
import { TeacherIdentityGate } from './TeacherIdentityGate';
import { formatOffset, formatPlainDate, isValidTimeZone, upcomingTransitions, zoneOffsetMinutes } from './zoned-time';

/** `/teacher/availability` — hours set month by month, plus days off. */
export function AvailabilityScreen() {
  return (
    <>
      <PageHeader
        title="Availability"
        description="Set your teaching hours for each month and mark the days you're off. Families can only book you inside these hours."
      />
      <TeacherIdentityGate what="your availability">{({ teacherId }) => <AvailabilityContent teacherId={teacherId} />}</TeacherIdentityGate>
    </>
  );
}

function AvailabilityContent({ teacherId }: { teacherId: string }) {
  const availability = useTeacherAvailability(teacherId);

  return (
    <QueryState query={availability} isEmpty={() => false} loadingLabel="Loading your availability…">
      {(data) => (
        <div>
          <MonthlyAvailabilityEditor
            teacherId={teacherId}
            zone={data.timeZone}
            // Older weekly hours only pre-fill a month that has none yet.
            weeklySlots={data.slots
              .filter((s) => !isMonthScopedSlot(s))
              .map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime }))}
            aside={<ZoneNotes availability={data} />}
          />
        </div>
      )}
    </QueryState>
  );
}

function ZoneNotes({ availability }: { availability: TeacherAvailability }) {
  const zone = availability.timeZone;
  const valid = isValidTimeZone(zone);
  const [now] = useState(() => new Date());
  const transitions = valid ? upcomingTransitions(zone, now) : [];

  return (
    <Card>
      <CardHeader title="Time zone" />
      <CardBody className="space-y-3 text-sm">
        <p className="flex flex-wrap items-center gap-2 text-ink">
          <Globe2 className="w-4 h-4 text-gold-600" aria-hidden />
          <span className="font-semibold">{zone.replace(/_/g, ' ')}</span>
          {valid && <span className="text-xs text-muted">({formatOffset(zoneOffsetMinutes(zone, now))} now)</span>}
        </p>
        {!valid ? (
          <p className="text-xs text-muted">Your account zone is not recognised, so clock changes cannot be calculated.</p>
        ) : transitions.length === 0 ? (
          <p className="text-xs text-muted flex gap-2">
            <SunMoon className="w-4 h-4 text-gold-600 shrink-0" aria-hidden />
            No clock changes in the next six months.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {transitions.map((t) => (
              <li key={t.date} className="flex gap-2 text-xs text-muted">
                <SunMoon className="w-4 h-4 text-gold-600 shrink-0" aria-hidden />
                <span>
                  <span className="font-semibold text-ink">
                    {formatPlainDate(t.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                  : clocks {t.toOffset > t.fromOffset ? 'go forward' : 'go back'} ({formatOffset(t.fromOffset)} →{' '}
                  {formatOffset(t.toOffset)}). Your hours keep the same local time.
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted border-t border-line pt-3">
          Hours are saved in your account time zone. To change it, ask the academy office.
        </p>
      </CardBody>
    </Card>
  );
}
