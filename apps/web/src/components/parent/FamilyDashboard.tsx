'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CreditCard,
  Headphones,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  Timer,
  Video,
} from 'lucide-react';
import { Card, formatDate, formatMoney } from '@/components/ui/primitives';
import { useStudentDashboards } from '@/hooks/useParentProgress';
import { useFamilyBilling, useTrialOffers } from '@/hooks/useBilling';
import { billingEnabled } from '@/lib/features';
import { outstandingMinor } from '@/lib/api/modules/billing-family';
import type { StudentDashboard, UpcomingClass } from '@/lib/api/modules/parent-progress';
import { cn } from '@/lib/utils';

/** The room opens this long before a class (FR-CLS-01). */
const ROOM_OPENS_MS = 10 * 60_000;

/**
 * The top of the family overview: what needs attention, the next class across every
 * child with a one-tap Join, and this month at a glance (FR-PAR-01).
 */
export function FamilyDashboard({
  familyId,
  currency,
  students,
}: {
  familyId: string;
  currency: string;
  students: Array<{ id: string; displayName: string }>;
}) {
  const dashboards = useStudentDashboards(students.map((s) => s.id));
  const loaded = dashboards
    .map((q, i) => (q.data ? { student: students[i], data: q.data } : null))
    .filter((x): x is { student: { id: string; displayName: string }; data: StudentDashboard } => x !== null);
  const now = useNow();

  const upcoming = loaded
    .flatMap(({ student, data }) => data.upcomingClasses.map((c) => ({ ...c, child: student.displayName })))
    .filter((c) => new Date(c.endsAt).getTime() > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const next = upcoming[0];

  const booked = loaded.reduce((n, d) => n + d.data.attendance.bookedClasses, 0);
  const attended = loaded.reduce((n, d) => n + d.data.attendance.attendedClasses, 0);
  const practice = loaded.reduce((n, d) => n + d.data.weekTrend.reduce((m, day) => m + day.minutes, 0), 0);
  const longestStreak = Math.max(0, ...loaded.map((d) => d.data.streak?.currentLength ?? 0));

  return (
    <div className="mb-6 space-y-4">
      <AttentionBanners familyId={familyId} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <NextClassTile next={next} now={now} loading={dashboards.some((q) => q.isLoading)} />
        <Tile
          icon={<CalendarDays className="h-4 w-4" />}
          label="Attendance this month"
          value={booked === 0 ? '—' : `${Math.round((attended / booked) * 100)}%`}
          hint={booked === 0 ? 'No classes yet this month' : `${attended} of ${booked} classes attended`}
        />
        <Tile
          icon={<Timer className="h-4 w-4" />}
          label="Practice this week"
          value={`${practice} min`}
          hint={longestStreak > 0 ? `${longestStreak}-day streak` : 'Every little bit counts'}
        />
        {billingEnabled() ? <BillingTile familyId={familyId} currency={currency} /> : <QuickLinksTile />}
      </div>
      <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
        <QuickAction href="/parent/timetable" icon={<CalendarClock className="h-4 w-4" />} label="Timetable" />
        <QuickAction href="/parent/messages" icon={<MessageSquare className="h-4 w-4" />} label="Message a teacher" />
        <QuickAction href="/book-trial" icon={<Sparkles className="h-4 w-4" />} label="Book a free trial" />
        {billingEnabled() && <QuickAction href="/parent/billing" icon={<CreditCard className="h-4 w-4" />} label="Billing" />}
        <QuickAction href="/parent/concerns" icon={<ShieldAlert className="h-4 w-4" />} label="Report a concern" />
      </nav>
    </div>
  );
}

/** Re-renders every 30 s so the countdown and the Join window stay right. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function countdown(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

function NextClassTile({
  next,
  now,
  loading,
}: {
  next: (UpcomingClass & { child: string }) | undefined;
  now: number;
  loading: boolean;
}) {
  const startsIn = next ? new Date(next.startsAt).getTime() - now : 0;
  const open = Boolean(next) && startsIn <= ROOM_OPENS_MS;
  const live = Boolean(next) && startsIn <= 0;
  return (
    <Card className={cn('p-4 md:col-span-2 xl:col-span-1', open && 'border-gold bg-gold-100/40')}>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Video className="h-4 w-4 text-gold-600" aria-hidden /> Next class
      </p>
      {loading && !next ? (
        <p className="mt-2 text-sm text-muted">Loading…</p>
      ) : !next ? (
        <>
          <p className="mt-1 text-lg font-semibold text-ink">Nothing booked</p>
          <Link href="/parent/timetable" className="text-xs font-semibold text-green-700 hover:underline">
            Open the timetable
          </Link>
        </>
      ) : (
        <>
          <p className="mt-1 text-lg font-semibold text-ink">
            {live ? 'Happening now' : countdown(startsIn)}
          </p>
          <p className="text-xs text-ink-2">
            {next.child} · {next.courseName} with {next.teacherName}
          </p>
          <p className="text-[11px] text-muted">
            {new Date(next.startsAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
          {open ? (
            <Link
              href={`/parent/classroom/${next.id}`}
              className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-semibold text-green-950 hover:bg-gold-600 hover:text-white"
            >
              <Video className="h-4 w-4" aria-hidden /> Join class
            </Link>
          ) : (
            <p className="mt-2 text-[11px] text-muted">Join opens 10 minutes before the start.</p>
          )}
        </>
      )}
    </Card>
  );
}

function BillingTile({ familyId, currency }: { familyId: string; currency: string }) {
  const billing = useFamilyBilling();
  const subs = (billing.data?.subscriptions ?? []).filter((s) => s.familyId === familyId && s.status !== 'CANCELLED');
  const invoices = (billing.data?.invoices ?? []).filter((i) => i.familyId === familyId);
  const due = outstandingMinor(invoices, currency);
  const pastDue = subs.some((s) => s.status === 'PAST_DUE');
  const renews = subs
    .filter((s) => s.status === 'ACTIVE' && !s.cancelAtPeriodEnd && s.currentPeriodEnd)
    .map((s) => s.currentPeriodEnd as string)
    .sort()[0];
  return (
    <Link href="/parent/billing" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded-2xl">
      <Card className={cn('h-full p-4 hover:bg-cream', pastDue && 'border-amber bg-amber/5')}>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <CreditCard className="h-4 w-4 text-gold-600" aria-hidden /> Plan & billing
        </p>
        {billing.isLoading ? (
          <p className="mt-2 text-sm text-muted">Loading…</p>
        ) : subs.length === 0 ? (
          <>
            <p className="mt-1 text-lg font-semibold text-ink">No plan yet</p>
            <p className="text-xs text-muted">Choose a plan after the trial</p>
          </>
        ) : (
          <>
            <p className="mt-1 text-lg font-semibold text-ink">
              {pastDue ? 'Payment due' : due > 0 ? formatMoney(due, currency) : 'All paid'}
            </p>
            <p className="text-xs text-muted">
              {subs.map((s) => s.plan.name).join(', ')}
              {renews ? ` · renews ${formatDate(renews)}` : ''}
            </p>
          </>
        )}
      </Card>
    </Link>
  );
}

function QuickLinksTile() {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Headphones className="h-4 w-4 text-gold-600" aria-hidden /> Need help?
      </p>
      <p className="mt-1 text-sm text-ink-2">Message your teacher from Messages, or report a concern at any time.</p>
    </Card>
  );
}

/** Things the family should act on, most important first. */
function AttentionBanners({ familyId }: { familyId: string }) {
  const offers = useTrialOffers(billingEnabled());
  const billing = useFamilyBilling();
  const familyOffers = (offers.data ?? []).filter((o) => o.familyId === familyId);
  const pastDue = billingEnabled()
    ? (billing.data?.subscriptions ?? []).filter((s) => s.familyId === familyId && s.status === 'PAST_DUE')
    : [];

  if (familyOffers.length === 0 && pastDue.length === 0) return null;
  return (
    <div className="space-y-2">
      {familyOffers.map((o) => (
        <div
          key={o.trialOutcomeId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-green-700/30 bg-green-50 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-green-900">
              <Sparkles className="h-4 w-4" aria-hidden /> {o.student?.displayName ?? 'Your child'}’s trial result is ready
            </p>
            <p className="text-xs text-green-900/80">
              {o.placementLevel ? `Starting at ${o.placementLevel.name}. ` : ''}
              {o.teacher ? `Keep learning with ${o.teacher.name}` : 'Start regular classes'}
              {o.recommendedPlan?.price
                ? ` — ${o.recommendedPlan.name}, ${formatMoney(o.recommendedPlan.price.amountMinor, o.recommendedPlan.price.currency)}.`
                : '.'}
            </p>
          </div>
          <Link
            href={`/parent/continue/${o.trialOutcomeId}`}
            className="inline-flex h-9 items-center rounded-full bg-green-800 px-4 text-sm font-semibold text-white hover:bg-green-700"
          >
            Continue
          </Link>
        </div>
      ))}
      {pastDue.map((s) => (
        <div
          key={s.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3"
        >
          <p className="flex items-center gap-1.5 text-sm text-ink">
            <AlertTriangle className="h-4 w-4 text-amber" aria-hidden />
            We couldn’t take the payment for {s.plan.name}. Classes continue while you sort it out.
          </p>
          <Link
            href="/parent/billing"
            className="inline-flex h-9 items-center rounded-full bg-gold px-4 text-sm font-semibold text-green-950 hover:bg-gold-600 hover:text-white"
          >
            Pay now
          </Link>
        </div>
      ))}
    </div>
  );
}

function Tile({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <span className="text-gold-600" aria-hidden>
          {icon}
        </span>
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-ink tabular-nums">{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </Card>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <span className="text-green-700" aria-hidden>
        {icon}
      </span>
      {label}
    </Link>
  );
}
