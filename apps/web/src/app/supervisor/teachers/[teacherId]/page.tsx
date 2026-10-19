'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ClipboardCheck, Shuffle } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  QueryState,
  Select,
  StatTile,
  StatusBadge,
  UiButton,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { SupervisorRoleGate } from '@/components/qa/SupervisorRoleGate';
import { ClassLessonCardLink } from '@/components/qa/ClassLessonCardLink';
import { LinkButton, RatingDistribution, ScoreBadge, ScorecardCriteria } from '@/components/qa/QaWidgets';
import { useAuth } from '@/hooks/useAuth';
import { useDrawSample, useScorecard, useSupervisedTeachers, useTeacherRating, useTeacherTimetable } from '@/hooks/useQa';
import { QaSampleResult, SCORECARD_MONTHS_MAX, reviewableClasses } from '@/lib/api/modules/qa';
import { detectTimeZone } from '@/lib/api/modules/public-booking';
import { Role } from '@/lib/types';

const DAY = 86_400_000;

export default function SupervisorTeacherPage() {
  const { teacherId } = useParams<{ teacherId: string }>();
  return (
    <SupervisorRoleGate>
      <TeacherScorecardScreen teacherId={teacherId} />
    </SupervisorRoleGate>
  );
}

function TeacherScorecardScreen({ teacherId }: { teacherId: string }) {
  const [months, setMonths] = useState(3);
  const teachers = useSupervisedTeachers();
  const teacher = teachers.data?.find((t) => t.id === teacherId);
  const scorecard = useScorecard(teacherId, months);
  const rating = useTeacherRating(teacherId);
  const { currentUser } = useAuth();
  const isSuperAdmin = !!currentUser?.roles?.includes(Role.SUPER_ADMIN);

  return (
    <>
      <Link href="/supervisor/teachers" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink mb-4">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> All teachers
      </Link>
      <PageHeader
        eyebrow="Teacher scorecard"
        title={teacher?.user.name ?? (teachers.isLoading ? 'Loading…' : 'Teacher')}
        description={
          teacher
            ? [teacher.subjects.join(', '), teacher.languages.map((l) => l.toUpperCase()).join(' · ')].filter(Boolean).join(' — ')
            : teachers.data
              ? 'Not in the bookable teacher list — scorecard data is still shown if it exists.'
              : undefined
        }
        actions={
          <LinkButton href={`/supervisor/reviews?teacherId=${teacherId}`} icon={<ClipboardCheck className="w-4 h-4" aria-hidden />}>
            Review a class
          </LinkButton>
        }
      />

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader
              title="QA scorecard"
              description="Rubric scores from supervisor reviews, 0–5 per criterion."
              action={
                <Field label="Window" htmlFor="scorecard-window" className="w-40">
                  <Select id="scorecard-window" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                    {[1, 3, 6, 12, SCORECARD_MONTHS_MAX].map((m) => (
                      <option key={m} value={m}>
                        Last {m} month{m === 1 ? '' : 's'}
                      </option>
                    ))}
                  </Select>
                </Field>
              }
            />
            <CardBody>
              <QueryState query={scorecard} isEmpty={() => false}>
                {(s) => (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <StatTile label="Overall" value={<ScoreBadge value={s.overallAverage} />} />
                      <StatTile label="Reviews" value={s.reviewsCount} />
                      <StatTile label="From samples" value={s.sampled} />
                      <StatTile label="Awaiting reply" value={s.awaitingReply} />
                    </div>
                    <ScorecardCriteria scorecard={s} />
                  </div>
                )}
              </QueryState>
            </CardBody>
          </Card>
          <RecentClasses teacherId={teacherId} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Family ratings" description="All-time star ratings from guardians who attended." />
            <CardBody>
              <QueryState query={rating} isEmpty={() => false}>
                {(summary) => <RatingDistribution summary={summary} />}
              </QueryState>
            </CardBody>
          </Card>
          {isSuperAdmin && <SampleCard teacherId={teacherId} />}
        </div>
      </div>
    </>
  );
}

function RecentClasses({ teacherId }: { teacherId: string }) {
  const [range] = useState(() => {
    const now = Date.now();
    return {
      from: new Date(now - 30 * DAY).toISOString(),
      to: new Date(now + 7 * DAY).toISOString(),
      tz: detectTimeZone(),
      now,
    };
  });
  const timetable = useTeacherTimetable(teacherId, { from: range.from, to: range.to, tz: range.tz });

  return (
    <Card>
      <CardHeader title="Classes" description="Last 30 days and the coming week, in your time zone." />
      <CardBody>
        <QueryState query={timetable} empty={<EmptyState title="No classes in this period" />}>
          {(entries) => {
            const reviewable = new Set(reviewableClasses(entries, range.now).map((e) => e.id));
            const sorted = [...entries].sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
            return (
              <ul className="divide-y divide-line">
                {sorted.map((e) => (
                  <li key={e.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {e.course?.name ?? 'Class'} <span className="text-muted font-normal">· {humanize(e.type)}</span>
                      </p>
                      <p className="text-[11px] text-muted">
                        {formatDateTime(e.startsAt, range.tz)}
                        {e.students.length > 0 && ` · ${e.students.map((s) => s.student.displayName).join(', ')}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={e.status} />
                      {reviewable.has(e.id) && <ClassLessonCardLink classId={e.id} lazy />}
                      {reviewable.has(e.id) && (
                        <LinkButton size="sm" variant="secondary" href={`/supervisor/reviews?teacherId=${teacherId}&classId=${e.id}`}>
                          Review
                        </LinkButton>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            );
          }}
        </QueryState>
      </CardBody>
    </Card>
  );
}

/** `POST /qa/teachers/:teacherId/sample` — SUPER_ADMIN only on the API, so only shown to them. */
function SampleCard({ teacherId }: { teacherId: string }) {
  const toast = useToast();
  const draw = useDrawSample();
  const [result, setResult] = useState<QaSampleResult | null>(null);

  return (
    <Card>
      <CardHeader title="Monthly QA sample" description="Randomly selects taught classes for this month's review." />
      <CardBody className="space-y-3">
        <UiButton
          className="w-full"
          variant="secondary"
          loading={draw.isPending}
          icon={<Shuffle className="w-4 h-4" aria-hidden />}
          onClick={() =>
            draw.mutate(teacherId, {
              onSuccess: (r) => {
                setResult(r);
                toast.success(
                  r.alreadySampled
                    ? `${r.period} was already sampled.`
                    : `Sampled ${r.created ?? r.sampled.length} class${(r.created ?? r.sampled.length) === 1 ? '' : 'es'} for ${r.period}.`,
                );
              },
              onError: (err) => toast.error(err),
            })
          }
        >
          Draw this month&apos;s sample
        </UiButton>
        {result &&
          (result.sampled.length === 0 ? (
            <Alert tone="warning">No taught classes were available to sample for {result.period}.</Alert>
          ) : (
            <ul className="space-y-2">
              {result.sampled.map((s, i) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-ink-2 truncate">Sampled class {i + 1}</span>
                  <Badge tone="gold">{s.period}</Badge>
                  <LinkButton
                    size="sm"
                    variant="secondary"
                    href={`/supervisor/reviews?teacherId=${teacherId}&classId=${s.classId}&source=RANDOM_SAMPLE`}
                  >
                    Review
                  </LinkButton>
                </li>
              ))}
            </ul>
          ))}
      </CardBody>
    </Card>
  );
}
