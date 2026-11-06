'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CalendarDays, Lock } from 'lucide-react';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Select,
  UiButton,
  formatMoney,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { usePriceQuote, useStartWithTeacher, useTeacherPrices } from '@/hooks/useBilling';
import { useActiveFamily, useFamilyStudents } from '@/hooks/useFamily';
import { useCourseCatalogue, useStudentEnrolments } from '@/hooks/useParentEnrolments';
import { useTeachers } from '@/hooks/useTeachers';
import { newIdempotencyKey } from '@/lib/api/http';
import {
  TeacherPlanPrice,
  WeekdayCode,
  isSafeCheckoutUrl,
  periodLabel,
} from '@/lib/api/modules/billing-family';
import type { FamilySummary } from '@/lib/api/modules/families';
import { BILLING_CURRENCY } from '@/lib/api/modules/billing-family';
import { viewerTimeZone } from '@/lib/api/modules/scheduling-admin';
import { WEEK, dateInZone, formatClock } from '@/lib/continue-with-teacher';
import type { StartWithTeacherParams } from '@/lib/start-with-teacher';
import { cn } from '@/lib/utils';
import {
  PlanPriceTag,
  PromoCodeField,
  QuoteLines,
  promoErrorMessage,
} from '@/components/billing/Discounts';
import { PRICE_CONFIRMED_NOTE, TeacherPriceTag } from '@/components/billing/TeacherPriceTag';
import { TeacherTierBadge } from '@/components/shared/TeacherTierBadge';
import {
  LOOKAHEAD_DAYS,
  PickedTimes,
  WeeklyTimesGrid,
  pickedSlots,
  togglePicked,
  useWeeklyOptions,
} from './WeeklyTimes';

/**
 * `/parent/start` — "Start with this teacher" without a free trial: one child, a course, the
 * teacher, a plan with that teacher's price, weekly times, then the card page. Nothing is
 * enrolled as ACTIVE or scheduled until the first payment lands; the classes then run as
 * regular ones from the first chosen time.
 *
 * Every step can arrive preselected (`?teacher=&student=&course=&plan=`): from a teacher's
 * profile, a child's "Start a course" dialog, or a plan on the billing page.
 */
export function StartWithTeacher({ initial = {} }: { initial?: StartWithTeacherParams }) {
  const { families, family } = useActiveFamily();

  return (
    <>
      <Link
        href="/parent"
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Overview
      </Link>
      {families.isLoading ? (
        <LoadingState label="Loading your family…" />
      ) : families.isError ? (
        <Card>
          <ErrorState error={families.error} onRetry={() => families.refetch()} />
        </Card>
      ) : !family ? (
        <Card>
          <EmptyState
            title="Set up your family first"
            description="Add your family and children, then choose a teacher."
            action={
              <Link
                href="/parent/family"
                className="text-sm font-semibold text-green-700 underline"
              >
                Go to family settings
              </Link>
            }
          />
        </Card>
      ) : (
        <StartFlow family={family} initial={initial} />
      )}
    </>
  );
}

function StartFlow({
  family,
  initial,
}: {
  family: FamilySummary;
  initial: StartWithTeacherParams;
}) {
  const toast = useToast();
  const router = useRouter();
  const currency = BILLING_CURRENCY;
  const zone = useMemo(() => viewerTimeZone(), []);
  const students = useFamilyStudents(family.id);
  const catalogue = useCourseCatalogue();
  const teachers = useTeachers();

  // ── 1. Child ──
  const [studentChoice, setStudentChoice] = useState(initial.student ?? '');
  const children = students.data ?? [];
  const student =
    children.find((s) => s.id === studentChoice) ??
    (children.length === 1 ? children[0] : undefined);
  const enrolments = useStudentEnrolments(student?.id);
  // A child already learning a course changes plan or teacher there instead.
  const enrolledCourseIds = new Set(
    (enrolments.data ?? [])
      .filter((e) => e.status === 'ACTIVE' || e.status === 'PAUSED')
      .map((e) => e.course.id),
  );

  // ── 3. Teacher (read before the course: a chosen teacher narrows the courses) ──
  const [teacherChoice, setTeacherChoice] = useState(initial.teacher ?? '');
  const teacher = teachers.allTeachers.find((t) => t.id === teacherChoice);
  const teacherMissing = Boolean(teacherChoice) && teachers.isLoading === false && !teacher;

  // ── 2. Course ──
  const [courseChoice, setCourseChoice] = useState(initial.course ?? '');
  const courses = (catalogue.data ?? []).filter(
    (c) => !teacher || teacher.specializations.includes(c.code),
  );
  const course =
    courses.find((c) => c.id === courseChoice) ?? (courses.length === 1 ? courses[0] : undefined);
  const alreadyEnrolled = Boolean(course && enrolledCourseIds.has(course.id));
  const courseTeachers = course
    ? teachers.allTeachers.filter((t) => t.specializations.includes(course.code))
    : [];

  // ── 4. Plan, at this teacher's price ──
  const prices = useTeacherPrices(teacher?.id);
  const [planChoice, setPlanChoice] = useState(initial.plan ?? '');
  const plan = prices.data?.plans.find((p) => p.planId === planChoice);

  // ── 5. Weekly times ──
  const [picked, setPicked] = useState<PickedTimes>({});
  const { slots, options, noTimes } = useWeeklyOptions(
    teacher?.id,
    plan?.classMinutes ?? 30,
    zone,
    Boolean(teacher && plan),
  );
  const needed = plan?.classesPerWeek ?? 0;
  const chosen = pickedSlots(picked);

  const [promoCode, setPromoCode] = useState<string | null>(null);
  const quote = usePriceQuote(
    student && teacher && plan
      ? {
          familyId: family.id,
          planId: plan.planId,
          teacherId: teacher.id,
          studentId: student.id,
          ...(promoCode ? { promoCode } : {}),
        }
      : null,
  );
  const promoError = promoCode ? promoErrorMessage(quote.error) : null;
  const start = useStartWithTeacher();
  const [idempotencyKey] = useState(newIdempotencyKey);

  const ready = Boolean(
    student &&
    course &&
    teacher &&
    plan &&
    !alreadyEnrolled &&
    needed > 0 &&
    chosen.length === needed &&
    !promoError,
  );

  const chooseTeacher = (id: string) => {
    setTeacherChoice(id);
    setPicked({});
  };
  const choosePlan = (id: string) => {
    setPlanChoice(id);
    setPicked({});
  };
  const toggle = (day: WeekdayCode, time: string) => {
    const next = togglePicked(picked, day, time, needed);
    if (next) setPicked(next);
    else toast.error(`This plan has ${needed} classes a week. Remove a day first.`);
  };

  const pay = () => {
    if (!ready || !student || !course || !teacher || !plan) return;
    start.mutate(
      {
        input: {
          familyId: family.id,
          studentId: student.id,
          courseId: course.id,
          teacherId: teacher.id,
          planId: plan.planId,
          schedule: { timeZone: zone, startsOn: dateInZone(zone, 1), slots: chosen },
          ...(promoCode ? { promoCode } : {}),
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

  return (
    <>
      <PageHeader
        eyebrow="Start without a trial"
        title={teacher ? `Start with ${teacher.name}` : 'Choose a teacher and start now'}
        description="Pick your child, the course, a plan and weekly times, then pay once on the secure card page. Prefer to try first? A free trial is still the usual way to start."
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader title="1. Child" />
            <CardBody>
              {students.isLoading ? (
                <LoadingState label="Loading your children…" />
              ) : children.length === 0 ? (
                <EmptyState
                  title="No children yet"
                  description="Add a child to your family first."
                  action={
                    <Link
                      href="/parent/family"
                      className="text-sm font-semibold text-green-700 underline"
                    >
                      Add a child
                    </Link>
                  }
                />
              ) : (
                <div role="radiogroup" aria-label="Child" className="flex flex-wrap gap-2">
                  {children.map((c) => (
                    <Choice
                      key={c.id}
                      selected={student?.id === c.id}
                      onSelect={() => setStudentChoice(c.id)}
                    >
                      {c.displayName}
                    </Choice>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="2. Course"
              description={teacher ? `The courses ${teacher.name} teaches.` : undefined}
            />
            <CardBody className="space-y-2">
              {catalogue.isLoading ? (
                <LoadingState label="Loading courses…" />
              ) : courses.length === 0 ? (
                <p className="text-sm text-muted">
                  No courses are open with this teacher right now.
                </p>
              ) : (
                <Field label="Course" htmlFor="start-course">
                  <Select
                    id="start-course"
                    value={course?.id ?? ''}
                    onChange={(e) => setCourseChoice(e.target.value)}
                  >
                    <option value="">Select a course…</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {alreadyEnrolled && student && course && (
                <Alert tone="warning">
                  {student.displayName} is already enrolled in {course.name}. Change that plan or
                  teacher from the child’s Courses tab instead.
                </Alert>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="3. Teacher" />
            <CardBody className="space-y-3">
              {teacher ? (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-ink">{teacher.name}</p>
                    {teacher.tier && (
                      <TeacherTierBadge tier={teacher.tier} size="sm" showDescription={false} />
                    )}
                  </div>
                  <UiButton size="sm" variant="secondary" onClick={() => chooseTeacher('')}>
                    Choose another teacher
                  </UiButton>
                </div>
              ) : teachers.isLoading ? (
                <LoadingState label="Loading teachers…" />
              ) : (
                <>
                  {teacherMissing && (
                    <Alert tone="warning">
                      That teacher is not taking new students right now. Choose another below.
                    </Alert>
                  )}
                  {!course ? (
                    <p className="text-sm text-muted">Choose a course to see its teachers.</p>
                  ) : courseTeachers.length === 0 ? (
                    <p className="text-sm text-muted">
                      No teacher is taking new students for {course.name} right now.
                    </p>
                  ) : (
                    <div
                      role="radiogroup"
                      aria-label="Teacher"
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      {courseTeachers.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          role="radio"
                          aria-checked={false}
                          onClick={() => chooseTeacher(t.id)}
                          className="text-left rounded-xl border border-line bg-white p-3 hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                        >
                          <span className="block text-sm font-semibold text-ink">{t.name}</span>
                          {t.tier && (
                            <span className="block text-[11px] text-muted">{t.tier.name}</span>
                          )}
                          <TeacherPriceTag teacherId={t.id} compact />
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-muted">
                    Want to compare first?{' '}
                    <Link href="/teachers" className="font-semibold text-green-700 underline">
                      Browse all teachers
                    </Link>
                  </p>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="4. Plan"
              description={
                teacher
                  ? `Prices in ${currency} with ${teacher.name}${prices.data?.tier ? ` (${prices.data.tier.name})` : ''}.`
                  : 'Choose a teacher first: the price depends on the teacher.'
              }
            />
            <CardBody>
              {!teacher ? null : prices.isLoading ? (
                <LoadingState label="Loading this teacher’s prices…" />
              ) : prices.isError ? (
                <ErrorState error={prices.error} onRetry={() => prices.refetch()} />
              ) : !prices.data?.plans.length ? (
                <p className="text-sm text-muted">
                  No plan has a price yet. Please contact the academy.
                </p>
              ) : (
                <div role="radiogroup" aria-label="Plan" className="grid gap-3 sm:grid-cols-2">
                  {prices.data.plans.map((p) => (
                    <PlanOption
                      key={p.planId}
                      plan={p}
                      currency={currency}
                      selected={p.planId === plan?.planId}
                      onSelect={() => choosePlan(p.planId)}
                    />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="5. Weekly times"
              description={
                plan && teacher
                  ? `Choose ${needed} ${needed === 1 ? 'day' : 'days'} with ${teacher.name} · times in ${zone}`
                  : 'Choose a teacher and a plan first.'
              }
            />
            <CardBody>
              {!plan || !teacher ? (
                <p className="text-sm text-muted">
                  The number of classes a week comes from the plan.
                </p>
              ) : slots.isLoading ? (
                <LoadingState label="Checking the teacher’s free times…" />
              ) : slots.isError ? (
                <ErrorState error={slots.error} onRetry={() => slots.refetch()} />
              ) : noTimes ? (
                // Unlike after a trial, there is no enrolment to come back to here, so a plan is
                // never started without times.
                <Alert tone="warning">
                  {teacher.name} has no free times in the next {LOOKAHEAD_DAYS} days. Choose another
                  teacher, or{' '}
                  <Link
                    href={`/book-trial?teacher=${encodeURIComponent(teacher.id)}`}
                    className="font-semibold underline"
                  >
                    book a free trial
                  </Link>{' '}
                  instead.
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
          <CardHeader title="Summary" />
          <CardBody className="space-y-3 text-sm">
            <Row label="Child" value={student?.displayName ?? '—'} />
            <Row label="Course" value={course?.name ?? '—'} />
            <Row
              label="Teacher"
              value={
                teacher ? `${teacher.name}${teacher.tier ? ` · ${teacher.tier.name}` : ''}` : '—'
              }
            />
            <Row label="Plan" value={plan?.name ?? '—'} />
            <Row
              label="Weekly"
              value={
                chosen.length
                  ? chosen
                      .map(
                        (c) =>
                          `${WEEK.find((d) => d.code === c.weekday)?.short} ${formatClock(c.localTime)}`,
                      )
                      .join(', ')
                  : '—'
              }
            />
            {plan && (
              <PromoCodeField
                applied={promoCode}
                onApply={setPromoCode}
                onClear={() => setPromoCode(null)}
                error={promoError}
                checking={Boolean(promoCode) && quote.isFetching}
              />
            )}
            <div className="border-t border-line pt-3">
              {plan && quote.data && !promoError ? (
                <QuoteLines
                  quote={quote.data}
                  currency={currency}
                  period={periodLabel(plan.billingPeriod)}
                  promoEntered={Boolean(promoCode)}
                />
              ) : (
                <div className="flex items-baseline justify-between">
                  <span className="text-muted">Today</span>
                  <span className="text-xl font-semibold text-ink tabular-nums">
                    {plan ? formatMoney(plan.periodPriceMinor, currency) : '—'}
                    {plan && (
                      <span className="text-xs font-normal text-muted">
                        {' '}
                        / {periodLabel(plan.billingPeriod)}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {!quote.data && <p className="mt-1 text-[11px] text-muted">{PRICE_CONFIRMED_NOTE}</p>}
            </div>
            <UiButton
              className="w-full"
              onClick={pay}
              disabled={!ready}
              loading={start.isPending}
              icon={<ArrowRight className="h-4 w-4" />}
            >
              Continue to payment
            </UiButton>
            <p className="flex items-start gap-1.5 text-[11px] text-muted">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              Card details go straight to our payment partner (Stripe). Classes start from the first
              time you chose. It renews automatically; cancel any time and keep classes until the
              end of the paid period.
            </p>
            {plan && teacher && !noTimes && chosen.length < needed && (
              <p className="flex items-center gap-1.5 text-[11px] text-ink-2">
                <CalendarDays className="h-3 w-3" aria-hidden /> Choose {needed - chosen.length}{' '}
                more {needed - chosen.length === 1 ? 'day' : 'days'}.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Choice({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
        selected
          ? 'border-green-700 bg-green-800 text-white'
          : 'border-line bg-white text-ink-2 hover:bg-sand',
      )}
    >
      {children}
    </button>
  );
}

function PlanOption({
  plan,
  currency,
  selected,
  onSelect,
}: {
  plan: TeacherPlanPrice;
  currency: string;
  selected: boolean;
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
      <span className="text-sm font-semibold text-ink">{plan.name}</span>
      <span className="mt-1 block text-xs text-muted">
        {plan.classesPerWeek} × {plan.classMinutes} min a week · {humanize(plan.roomType)}
      </span>
      <span className="mt-2 block">
        <PlanPriceTag
          price={{
            amountMinor: plan.periodPriceMinor,
            listMinor: plan.listMinor,
            periodDiscountPercent: plan.periodDiscountPercent,
          }}
          currency={currency}
          period={periodLabel(plan.billingPeriod)}
        />
      </span>
    </button>
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
