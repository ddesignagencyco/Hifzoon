'use client';

import React, { useState } from 'react';
import { Globe2, SunMoon } from 'lucide-react';
import { Alert, Card, CardBody, CardHeader, PageHeader, QueryState, Tabs, formatDate } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useSetTeacherAvailability, useTeacherAvailability } from '@/hooks/useTeacherSchedule';
import { TeacherAvailability } from '@/lib/api/modules/teacher-schedule';
import { AvailabilityEditor } from './AvailabilityEditor';
import { MonthlyAvailabilityEditor } from './MonthlyAvailabilityEditor';
import { isMonthScopedSlot } from './availability-form';
import { TeacherIdentityGate } from './TeacherIdentityGate';
import { formatOffset, formatPlainDate, isValidTimeZone, upcomingTransitions, zoneOffsetMinutes } from './zoned-time';

/** `/teacher/availability` — weekly hours (FR-SCH-01), plus month-by-month hours and days off. */
export function AvailabilityScreen() {
  return (
    <>
      <PageHeader
        title="Availability"
        description="The hours families and the academy can book you for. Set a normal week, then adjust each month and mark your days off."
      />
      <TeacherIdentityGate what="your availability">{({ teacherId }) => <AvailabilityContent teacherId={teacherId} />}</TeacherIdentityGate>
    </>
  );
}

function AvailabilityContent({ teacherId }: { teacherId: string }) {
  const toast = useToast();
  const availability = useTeacherAvailability(teacherId);
  const save = useSetTeacherAvailability(teacherId);
  const [tab, setTab] = useState<'weekly' | 'monthly'>('weekly');
  const weekly = (availability.data?.slots ?? []).filter((s) => !isMonthScopedSlot(s));
  const monthScoped = (availability.data?.slots.length ?? 0) - weekly.length;

  return (
    <QueryState query={availability} isEmpty={() => false} loadingLabel="Loading your availability…">
      {(data) => (
        <>
        <Tabs
          className="mb-5"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'weekly', label: 'Weekly hours' },
            { value: 'monthly', label: 'Month by month & days off' },
          ]}
        />
        {tab === 'monthly' ? (
          <MonthlyAvailabilityEditor
            teacherId={teacherId}
            zone={data.timeZone}
            weeklySlots={weekly.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime }))}
          />
        ) : (
        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          <Card>
            <CardHeader title="Weekly hours" description={`${weekly.length} saved range${weekly.length === 1 ? '' : 's'}`} />
            <CardBody>
              {monthScoped > 0 && (
                <Alert tone="warning" title="This also clears your month-by-month hours" className="mb-4">
                  Saving your weekly hours currently removes the hours you submitted for specific months. Re-submit those
                  months afterwards. Your days off are not affected.
                </Alert>
              )}
              <AvailabilityEditor
                key={availability.dataUpdatedAt}
                initialSlots={weekly}
                zone={data.timeZone}
                saving={save.isPending}
                onSave={(body) =>
                  save.mutate(body, {
                    onSuccess: () => toast.success('Availability saved.'),
                    onError: (err) => toast.error(err),
                  })
                }
              />
            </CardBody>
          </Card>
          <ZoneNotes availability={data} />
        </div>
        )}
        </>
      )}
    </QueryState>
  );
}

function ZoneNotes({ availability }: { availability: TeacherAvailability }) {
  const zone = availability.timeZone;
  const valid = isValidTimeZone(zone);
  const [now] = useState(() => new Date());
  const transitions = valid ? upcomingTransitions(zone, now) : [];
  const otherZones = [...new Set(availability.slots.map((s) => s.timeZone).filter((z) => z !== zone))];
  const effective = availability.slots.find((s) => !isMonthScopedSlot(s));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Time zone" />
        <CardBody className="space-y-3 text-sm">
          <p className="flex items-center gap-2 text-ink">
            <Globe2 className="w-4 h-4 text-gold-600" aria-hidden />
            <span className="font-semibold">{zone}</span>
            {valid && <span className="text-xs text-muted">({formatOffset(zoneOffsetMinutes(zone, now))} now)</span>}
          </p>
          <p className="text-xs text-muted">
            Availability is saved in your account time zone. To change it, ask the academy office to update your account.
          </p>
          {otherZones.length > 0 && (
            <Alert tone="warning" title="Saved ranges use a different zone">
              Some of your current ranges were stored in {otherZones.join(', ')}. Saving re-stores every range in {zone}, so
              check the times above before you save.
            </Alert>
          )}
          {effective && (
            <p className="text-xs text-muted">
              Current hours effective from {formatDate(effective.effectiveFrom)}
              {effective.effectiveTo ? ` until ${formatDate(effective.effectiveTo)}` : ''}.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Daylight saving" />
        <CardBody className="space-y-3 text-sm">
          {!valid ? (
            <p className="text-xs text-muted">Your account zone is not recognised, so clock changes cannot be calculated.</p>
          ) : transitions.length === 0 ? (
            <p className="text-xs text-muted flex gap-2">
              <SunMoon className="w-4 h-4 text-gold-600 shrink-0" aria-hidden />
              {zone} has no clock changes in the next six months.
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {transitions.map((t) => (
                  <li key={t.date} className="flex gap-2">
                    <SunMoon className="w-4 h-4 text-gold-600 shrink-0 mt-0.5" aria-hidden />
                    <span>
                      <span className="font-semibold text-ink">{formatPlainDate(t.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      <span className="block text-xs text-muted">
                        Clocks {t.toOffset > t.fromOffset ? 'go forward' : 'go back'}: {formatOffset(t.fromOffset)} → {formatOffset(t.toOffset)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">
                Your hours stay at the same local wall-clock time across the change. Families in zones that change on a
                different date will see your classes an hour earlier or later for those weeks.
              </p>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
