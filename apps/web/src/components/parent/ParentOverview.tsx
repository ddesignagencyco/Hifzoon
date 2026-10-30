'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Award, BookOpen, CalendarClock, ChevronRight, Flame, Target, Users } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  formatDate,
} from '@/components/ui/primitives';
import { useFamilyDetail } from '@/hooks/useFamily';
import { useStudentDashboard } from '@/hooks/useParentProgress';
import { useMyTeacherChanges, useNextLesson } from '@/hooks/useParentEnrolments';
import { latestTeacherChangeFor, teacherChangeHref } from '@/lib/api/modules/admissions-guardian';
import { useStudentConsent } from '@/hooks/useFamilyConsent';
import { hasRequiredConsent } from '@/lib/api/modules/consent';
import { FamilySummary } from '@/lib/api/modules/families';
import { hifzPaceLabel, StudentDashboard } from '@/lib/api/modules/parent-progress';
import { FamilySwitcher, formatClassTime, Initial, WithActiveFamily } from './shared';
import { Onboarding } from './Onboarding';
import { GuardianVerification } from './GuardianPanels';

/** `/parent` — family header + one live card per child, or the first-run walkthrough. */
export function ParentOverview() {
  return (
    <WithActiveFamily onNoFamily={<Onboarding familyId={null} membership={null} />}>
      {({ family, familyId, membership }) => <FamilyHome key={familyId} family={family} membership={membership} />}
    </WithActiveFamily>
  );
}

function FamilyHome({
  family,
  membership,
}: {
  family: FamilySummary;
  membership: FamilySummary['members'][number] | null;
}) {
  const detail = useFamilyDetail(family.id);
  // Keeps the walkthrough mounted after its first child is created so the consent step
  // is not replaced by the dashboard when the family list refreshes.
  const [onboardingChild, setOnboardingChild] = useState<string | null>(null);

  if (detail.isLoading) return <LoadingState label="Loading your family…" />;
  if (detail.isError || !detail.data) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;

  const data = detail.data;
  if (data.students.length === 0 || onboardingChild) {
    return (
      <Onboarding
        familyId={data.id}
        familyTimeZone={data.timeZone}
        membership={membership ?? null}
        onChildAdded={setOnboardingChild}
      />
    );
  }

  const verifiedGuardians = data.members.filter((m) => m.verifiedAt).length;

  return (
    <>
      <PageHeader
        eyebrow="Family portal"
        title={data.name}
        description={[
          `${data.students.length} ${data.students.length === 1 ? 'child' : 'children'}`,
          `${data.members.length} guardian${data.members.length === 1 ? '' : 's'} (${verifiedGuardians} verified)`,
          data.timeZone,
          data.currency,
        ].join(' · ')}
        actions={
          <>
            <FamilySwitcher />
            <Link
              href="/parent/children"
              className="inline-flex items-center gap-2 h-10 px-5 rounded-full border border-line bg-white text-sm font-semibold text-ink hover:bg-sand"
            >
              <Users className="w-4 h-4" aria-hidden /> Manage children
            </Link>
          </>
        }
      />

      {membership && !membership.verifiedAt && (
        <Card className="mb-6">
          <CardBody className="pt-5">
            <GuardianVerification familyId={data.id} verifiedAt={null} isPrimary={membership.isPrimary} />
          </CardBody>
        </Card>
      )}

      <div className={`grid gap-6 ${data.students.length > 2 ? 'xl:grid-cols-2 2xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
        {data.students.map((s) => (
          <ChildOverviewCard key={s.id} studentId={s.id} displayName={s.displayName} />
        ))}
      </div>
    </>
  );
}

function ChildOverviewCard({ studentId, displayName }: { studentId: string; displayName: string }) {
  const dashboard = useStudentDashboard(studentId);
  const consent = useStudentConsent(studentId);
  const needsConsent = consent.data !== undefined && !hasRequiredConsent(consent.data);

  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Initial name={displayName} />
          <div className="min-w-0">
            <h2 className="text-lg text-ink truncate">{displayName}</h2>
            {dashboard.data && (
              <p className="text-xs text-muted">
                Age {dashboard.data.student.age} · {dashboard.data.teachers.length} active course
                {dashboard.data.teachers.length === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>
        <Link
          href={`/parent/children/${studentId}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline shrink-0"
          aria-label={`Open ${displayName}’s progress`}
        >
          Details <ChevronRight className="w-3.5 h-3.5" aria-hidden />
        </Link>
      </div>
      <CardBody className="flex-1 space-y-5">
        {needsConsent && (
          <Alert tone="warning" title="Consent needed">
            Classes can’t be booked for {displayName} until consent for lesson records is given.{' '}
            <Link href={`/parent/children/${studentId}?tab=consent`} className="underline font-semibold">
              Review consent
            </Link>
          </Alert>
        )}
        {dashboard.isLoading ? (
          <LoadingState />
        ) : dashboard.isError || !dashboard.data ? (
          <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
        ) : (
          <DashboardBody data={dashboard.data} studentId={studentId} />
        )}
      </CardBody>
    </Card>
  );
}

function MiniStat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl bg-cream border border-line px-3 py-2.5 min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <span className="text-gold-600" aria-hidden>{icon}</span>
        {label}
      </p>
      <p className="text-lg font-semibold text-ink tabular-nums mt-0.5 truncate">{value}</p>
      {hint && <p className="text-[10px] text-muted truncate">{hint}</p>}
    </div>
  );
}

function DashboardBody({ data, studentId }: { data: StudentDashboard; studentId: string }) {
  const latest = data.recentLessonCards[0];
  const upcoming = data.upcomingClasses.slice(0, 3);
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <MiniStat
          icon={<Flame className="w-3.5 h-3.5" />}
          label="Streak"
          value={data.streak ? `${data.streak.currentLength}d` : '—'}
          hint={data.streak ? `Best ${data.streak.longestLength}d` : 'No streak yet'}
        />
        <MiniStat
          icon={<CalendarClock className="w-3.5 h-3.5" />}
          label="Attendance"
          value={data.attendance.attendanceRate === null ? '—' : `${data.attendance.attendanceRate}%`}
          hint={
            data.attendance.bookedClasses === 0
              ? 'No classes this month'
              : `${data.attendance.attendedClasses}/${data.attendance.bookedClasses} this month`
          }
        />
        <MiniStat
          icon={<BookOpen className="w-3.5 h-3.5" />}
          label="Pages tracked"
          value={data.memorisation.pagesTracked}
          hint={`${data.memorisation.openMistakes} open mistakes`}
        />
      </div>

      <section aria-labelledby={`courses-${studentId}`}>
        <h3 id={`courses-${studentId}`} className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 font-sans">
          Courses & next lesson
        </h3>
        {data.teachers.length === 0 ? (
          <p className="text-sm text-muted">
            Not enrolled in a course yet.{' '}
            <Link href={`/parent/children/${studentId}?tab=courses`} className="text-green-700 font-semibold hover:underline">
              Enrol now
            </Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {data.teachers.map((t) => (
              <li key={t.enrolmentId} className="rounded-xl border border-line px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{t.course.name}</p>
                  <StatusBadge status={t.status} />
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  {t.teacherPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- teacher-supplied host
                    <img src={t.teacherPhotoUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : null}
                  with{' '}
                  <Link href={`/teachers/${encodeURIComponent(t.teacher.id)}`} className="text-green-800 hover:underline">
                    {t.teacher.name}
                  </Link>
                </p>
                <NextLessonLine enrolmentId={t.enrolmentId} />
                <TeacherChangeLine studentId={studentId} enrolmentId={t.enrolmentId} status={t.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`upcoming-${studentId}`}>
        <h3 id={`upcoming-${studentId}`} className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 font-sans">
          Upcoming classes
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">No classes booked.</p>
        ) : (
          <ul className="space-y-1.5">
            {upcoming.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-ink">{formatClassTime(c.startsAt, c.endsAt)}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {c.courseName} · {c.teacherName}
                  {c.roomToken && (
                    <Link
                      href={`/parent/classroom/${c.id}`}
                      className="inline-flex items-center h-7 px-3 rounded-full bg-gold text-green-950 font-semibold hover:bg-gold-600 hover:text-white"
                    >
                      Join class
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/parent/timetable" className="inline-block text-xs font-semibold text-green-700 hover:underline mt-2">
          Full timetable
        </Link>
      </section>

      <section aria-labelledby={`latest-${studentId}`}>
        <h3 id={`latest-${studentId}`} className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 font-sans">
          Latest lesson card
        </h3>
        {latest ? (
          <Link
            href={`/parent/children/${studentId}?tab=lessons&card=${latest.id}`}
            className="block rounded-xl border border-line px-3 py-2.5 hover:bg-cream"
          >
            <p className="text-sm font-semibold text-ink">
              {latest.class.course.name} · {formatDate(latest.class.startsAt)}
            </p>
            {latest.homework && <p className="text-xs text-ink-2 mt-1 line-clamp-2">Homework: {latest.homework}</p>}
            {latest.parentNote && <p className="text-xs text-muted mt-1 line-clamp-2">Note: {latest.parentNote}</p>}
          </Link>
        ) : (
          <p className="text-sm text-muted">No lesson cards shared yet.</p>
        )}
      </section>

      {data.hifzGoal && (
        <section aria-labelledby={`goal-${studentId}`} className="rounded-xl bg-gold-100/60 border border-gold/30 px-3 py-2.5">
          <h3 id={`goal-${studentId}`} className="flex items-center gap-1.5 text-xs font-semibold text-gold-600 font-sans">
            <Target className="w-3.5 h-3.5" aria-hidden /> Hifz goal
          </h3>
          <p className="text-sm text-ink mt-1">{data.hifzGoal.targetDescription}</p>
          <p className="text-[11px] text-muted mt-0.5">
            Pages {data.hifzGoal.targetFromPage}–{data.hifzGoal.targetToPage} by {formatDate(data.hifzGoal.dueOn)}
            {data.hifzGoal.behindSince ? ` · behind since ${formatDate(data.hifzGoal.behindSince)}` : ''}
          </p>
          {hifzPaceLabel(data.hifzGoal.linesPerDayNeeded) && (
            <p className={`text-[11px] mt-0.5 font-medium ${data.hifzGoal.behindSince ? 'text-red' : 'text-green-800'}`}>
              {hifzPaceLabel(data.hifzGoal.linesPerDayNeeded)}
            </p>
          )}
        </section>
      )}

      {data.badges.length > 0 && (
        <section aria-labelledby={`badges-${studentId}`}>
          <h3 id={`badges-${studentId}`} className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 font-sans">
            Recent badges
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {data.badges.map((b) => (
              <li key={b.id}>
                <Badge tone="gold">
                  <Award className="w-3 h-3" aria-hidden /> {b.badge.name}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** Open/last teacher-change request for the course, and a link to ask for a different teacher. */
function TeacherChangeLine({ studentId, enrolmentId, status }: { studentId: string; enrolmentId: string; status: string }) {
  const changes = useMyTeacherChanges();
  const change = latestTeacherChangeFor(changes.data, enrolmentId);
  const canRequest = (status === 'ACTIVE' || status === 'TRIAL') && change?.status !== 'OPEN';
  if (!change && !canRequest) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
      {change && (
        <span className="inline-flex items-center gap-1.5">
          Teacher change {formatDate(change.createdAt)} <StatusBadge status={change.status} />
        </span>
      )}
      {canRequest && (
        <Link href={teacherChangeHref(studentId, enrolmentId)} className="font-semibold text-green-700 hover:underline">
          Change teacher
        </Link>
      )}
    </p>
  );
}

function NextLessonLine({ enrolmentId }: { enrolmentId: string }) {
  const next = useNextLesson(enrolmentId);
  if (next.isLoading) return <p className="text-[11px] text-muted mt-1">Loading next lesson…</p>;
  if (next.isError) return <p className="text-[11px] text-muted mt-1">Next lesson unavailable.</p>;
  if (!next.data?.lesson) return <p className="text-[11px] text-muted mt-1">No lesson plan set for this level yet.</p>;
  return (
    <p className="text-[11px] text-ink-2 mt-1">
      Next: <span className="font-semibold">{next.data.lesson.title}</span>
      {next.data.level ? ` · ${next.data.level.name}` : ''}
    </p>
  );
}

