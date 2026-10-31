'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, GraduationCap, Lock, Sparkles } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  UiButton,
  formatDate,
  formatMoney,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useBillingPlans, useSubscribe, useTrialOffers } from '@/hooks/useBilling';
import { usePlanPrices } from '@/hooks/usePlanPrices';
import { newIdempotencyKey } from '@/lib/api/http';
import { BillingPlan, TrialOffer, WeekdayCode, isSafeCheckoutUrl, periodLabel } from '@/lib/api/modules/billing-family';
import { viewerTimeZone } from '@/lib/api/modules/scheduling-admin';
import { WEEK, dateInZone, formatClock } from '@/lib/continue-with-teacher';
import { cn } from '@/lib/utils';
import { LOOKAHEAD_DAYS, PickedTimes, WeeklyTimesGrid, pickedSlots, togglePicked, useWeeklyOptions } from './WeeklyTimes';

/**
 * `/parent/continue/[trialOutcomeId]` — after a won trial (FR-ADM-05): choose the plan,
 * the weekly times with the same teacher, then pay once on the card page. Nothing is
 * enrolled or scheduled until the first payment lands.
 */
export function ContinueWithTeacher({ trialOutcomeId }: { trialOutcomeId: string }) {
  const offers = useTrialOffers();
  const offer = offers.data?.find((o) => o.trialOutcomeId === trialOutcomeId);

  return (
    <>
      <Link href="/parent" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Overview
      </Link>
      {offers.isLoading ? (
        <LoadingState label="Loading the trial result…" />
      ) : offers.isError ? (
        <Card>
          <ErrorState error={offers.error} onRetry={() => offers.refetch()} />
        </Card>
      ) : !offer ? (
        <Card>
          <EmptyState
            title="Nothing to continue here"
            description="This trial has already been turned into regular classes, or its result is not ready yet."
            action={
              <Link href="/parent/billing" className="text-sm font-semibold text-green-700 underline">
                Go to billing
              </Link>
            }
          />
        </Card>
      ) : (
        <ContinueFlow offer={offer} />
      )}
    </>
  );
}

function ContinueFlow({ offer }: { offer: TrialOffer }) {
  const toast = useToast();
  const router = useRouter();
  const plans = useBillingPlans();
  const currency = offer.currency ?? 'GBP';
  // Tier pricing: what each plan costs with this teacher.
  const prices = usePlanPrices((plans.data ?? []).map((p) => p.id), [currency], plans.isSuccess, {
    teacherId: offer.teacher?.id,
  });
  const subscribe = useSubscribe();
  const [idempotencyKey] = useState(newIdempotencyKey);
  const zone = useMemo(() => viewerTimeZone(), []);

  const [planId, setPlanId] = useState(offer.recommendedPlan?.id ?? '');
  const plan = plans.data?.find((p) => p.id === planId);
  const price = plan ? prices.get(plan.id, currency) : undefined;
  const [picked, setPicked] = useState<PickedTimes>({});
  const { slots, options, noTimes } = useWeeklyOptions(offer.teacher?.id, plan?.classMinutes ?? 30, zone, Boolean(plan));

  const needed = plan?.classesPerWeek ?? 0;
  const chosen = pickedSlots(picked);
  const ready = Boolean(plan && price && (noTimes || chosen.length === needed));

  const toggle = (day: WeekdayCode, time: string) => {
    const next = togglePicked(picked, day, time, needed);
    if (next) setPicked(next);
    else toast.error(`This plan has ${needed} classes a week. Remove a day first.`);
  };

  const pay = () => {
    if (!plan || !offer.enrolmentId) return;
    subscribe.mutate(
      {
        input: {
          familyId: offer.familyId,
          planId: plan.id,
          currency,
          trialOutcomeId: offer.trialOutcomeId,
          ...(offer.teacher && chosen.length === needed && needed > 0
            ? {
                schedule: {
                  enrolmentId: offer.enrolmentId,
                  teacherId: offer.teacher.id,
                  timeZone: zone,
                  startsOn: dateInZone(zone, 1),
                  slots: chosen,
                },
              }
            : {}),
        },
        idempotencyKey,
      },
      {
        onSuccess: (res) => {
          if (res.checkoutUrl && isSafeCheckoutUrl(res.checkoutUrl)) {
            window.location.assign(res.checkoutUrl);
            return;
          }
          toast.success('Your regular classes are set up.');
          router.push('/parent/billing');
        },
        onError: (error) => toast.error(error),
      },
    );
  };

  const childName = offer.student?.displayName ?? 'your child';

  return (
    <>
      <PageHeader
        eyebrow="Trial result"
        title={offer.teacher ? `Continue with ${offer.teacher.name}` : 'Continue with regular classes'}
        description={`${childName}’s trial is done. Pick a plan and weekly times, then pay once — the card is saved and renews automatically.`}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="space-y-5 min-w-0">
          <Card>
            <CardBody className="grid gap-3 sm:grid-cols-3">
              <Fact icon={<GraduationCap className="h-4 w-4" />} label="Course" value={offer.course?.name ?? '—'} />
              <Fact
                icon={<Sparkles className="h-4 w-4" />}
                label="Starting level"
                value={offer.placementLevel ? `${offer.placementLevel.position}. ${offer.placementLevel.name}` : 'Set at the first class'}
              />
              <Fact icon={<CheckCircle2 className="h-4 w-4" />} label="Trial" value={`Done ${formatDate(offer.completedAt)}`} />
              {offer.notes && <p className="sm:col-span-3 rounded-xl bg-sand px-3 py-2 text-sm text-ink-2">“{offer.notes}”</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="1. Plan"
              description={`Prices in ${currency}${offer.teacher?.tier ? ` with a ${offer.teacher.tier.name} teacher` : ''}.`}
            />
            <CardBody>
              {plans.isLoading ? (
                <LoadingState label="Loading plans…" />
              ) : (
                <div role="radiogroup" aria-label="Plan" className="grid gap-3 sm:grid-cols-2">
                  {(plans.data ?? []).map((p) => (
                    <PlanOption
                      key={p.id}
                      plan={p}
                      selected={p.id === planId}
                      recommended={p.id === offer.recommendedPlan?.id}
                      price={prices.get(p.id, currency)?.amountMinor}
                      currency={currency}
                      onSelect={() => {
                        setPlanId(p.id);
                        setPicked({});
                      }}
                    />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="2. Weekly times"
              description={
                plan
                  ? `Choose ${needed} ${needed === 1 ? 'day' : 'days'} with ${offer.teacher?.name ?? 'the teacher'} · times in ${zone}`
                  : 'Choose a plan first.'
              }
            />
            <CardBody>
              {!plan ? (
                <p className="text-sm text-muted">The number of classes a week comes from the plan.</p>
              ) : slots.isLoading ? (
                <LoadingState label="Checking the teacher’s free times…" />
              ) : slots.isError ? (
                <ErrorState error={slots.error} onRetry={() => slots.refetch()} />
              ) : noTimes ? (
                <Alert tone="warning">
                  {offer.teacher?.name ?? 'The teacher'} has no free times in the next {LOOKAHEAD_DAYS} days. You can still
                  continue — the academy will agree the weekly times with you after payment.
                </Alert>
              ) : (
                <>
                  <p className="mb-3 text-xs font-semibold text-ink-2" aria-live="polite">
                    {chosen.length} of {needed} chosen
                  </p>
                  <WeeklyTimesGrid options={options} picked={picked} onToggle={toggle} />
                </>
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-4">
          <CardHeader title="3. Summary" />
          <CardBody className="space-y-3 text-sm">
            <Row label="Child" value={childName} />
            <Row
              label="Teacher"
              value={
                offer.teacher
                  ? `${offer.teacher.name}${offer.teacher.tier ? ` · ${offer.teacher.tier.name}` : ''}`
                  : 'Assigned by the academy'
              }
            />
            <Row label="Plan" value={plan?.name ?? '—'} />
            <Row
              label="Weekly"
              value={
                chosen.length
                  ? chosen.map((c) => `${WEEK.find((d) => d.code === c.weekday)?.short} ${formatClock(c.localTime)}`).join(', ')
                  : noTimes
                    ? 'Agreed after payment'
                    : '—'
              }
            />
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-muted">Today</span>
              <span className="text-xl font-semibold text-ink tabular-nums">
                {price ? formatMoney(price.amountMinor, currency) : '—'}
                {price && plan && <span className="text-xs font-normal text-muted"> / {periodLabel(plan.billingPeriod)}</span>}
              </span>
            </div>
            <UiButton className="w-full" onClick={pay} disabled={!ready} loading={subscribe.isPending} icon={<ArrowRight className="h-4 w-4" />}>
              Continue to payment
            </UiButton>
            <p className="flex items-start gap-1.5 text-[11px] text-muted">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              Card details go straight to our payment partner (Stripe). It renews automatically; cancel any time and keep
              classes until the end of the paid period.
            </p>
            {!ready && plan && !noTimes && chosen.length < needed && (
              <p className="flex items-center gap-1.5 text-[11px] text-ink-2">
                <CalendarDays className="h-3 w-3" aria-hidden /> Choose {needed - chosen.length} more {needed - chosen.length === 1 ? 'day' : 'days'}.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function PlanOption({
  plan,
  selected,
  recommended,
  price,
  currency,
  onSelect,
}: {
  plan: BillingPlan;
  selected: boolean;
  recommended: boolean;
  price: number | undefined;
  currency: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'text-left rounded-xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
        selected ? 'border-green-700 bg-green-50' : 'border-line bg-white hover:bg-cream',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{plan.name}</span>
        {recommended && <Badge tone="gold">Recommended</Badge>}
      </span>
      <span className="mt-1 block text-xs text-muted">
        {plan.classesPerWeek} × {plan.classMinutes} min a week · {humanize(plan.roomType)}
      </span>
      <span className="mt-2 block text-lg font-semibold text-ink tabular-nums">
        {price === undefined ? '…' : formatMoney(price, currency)}
        <span className="text-xs font-normal text-muted"> / {periodLabel(plan.billingPeriod)}</span>
      </span>
    </button>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-green-700" aria-hidden>
        {icon}
      </span>
      <span>
        <span className="block text-[11px] text-muted">{label}</span>
        <span className="block text-sm font-semibold text-ink">{value}</span>
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}
