'use client';

import React from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  Repeat,
  ShieldAlert,
  Target,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  QueryState,
  StatTile,
  StatusBadge,
  formatDate,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useAdminOverview } from '@/hooks/useAdminConsole';
import { useCrmPipeline } from '@/hooks/useCrm';
import { useTeacherChanges } from '@/hooks/useAdminAdmissions';
import { useHiringApplications } from '@/hooks/useHiring';
import { useAdminEnrolments } from '@/hooks/useCoursesAdmin';
import { ENROLMENT_LIST_CAP, isAwaitingTeacher } from '@/lib/api/modules/courses-admin';
import { formatRate } from '@/lib/api/modules/crm';
import { useApiLiveness, useApiReadiness } from '@/hooks/useHealth';
import { formatUptime } from '@/lib/api/modules/health';

const LIST_CAP_TEACHER_CHANGES = 100;
const LIST_CAP_APPLICATIONS = 200;

/** `/admin` — live operational counters. Super admins also get the platform KPIs. */
export function AdminOverview() {
  const { isSuperAdmin } = useAdminRoles();
  return (
    <>
      <PageHeader
        eyebrow="Academy admin"
        title="Operations overview"
        description="Live counts from the CRM, hiring pipeline and family requests."
      />
      {isSuperAdmin && <PlatformKpis />}
      <div className="grid gap-6 lg:grid-cols-2">
        <PipelineCard />
        <div className="grid gap-6">
          <TeacherChangesCard />
          <AwaitingTeacherCard />
          <ApplicationsCard />
        </div>
      </div>
      <div className="mt-6">
        <SystemHealthCard />
      </div>
    </>
  );
}

function PlatformKpis() {
  const overview = useAdminOverview();
  return (
    <section aria-labelledby="platform-kpis" className="mb-6">
      <h2 id="platform-kpis" className="sr-only">
        Platform counters
      </h2>
      <QueryState query={overview} loadingLabel="Loading platform counters…">
        {(data) => (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatTile label="Students" value={data.students} icon={<GraduationCap className="w-4 h-4" />} />
            <StatTile label="Families" value={data.families} icon={<Users className="w-4 h-4" />} />
            <StatTile label="Approved teachers" value={data.teachers} icon={<UserPlus className="w-4 h-4" />} />
            <StatTile
              label="Upcoming & live classes"
              value={data.activeClasses}
              icon={<CalendarDays className="w-4 h-4" />}
            />
            <StatTile label="Open cases" value={data.openCases} icon={<ShieldAlert className="w-4 h-4" />} />
            <StatTile
              label="Overdue CRM tasks"
              value={data.overdueTasks}
              icon={<AlertTriangle className="w-4 h-4" />}
            />
          </div>
        )}
      </QueryState>
    </section>
  );
}

function PipelineCard() {
  const pipeline = useCrmPipeline();
  return (
    <Card>
      <CardHeader
        title="CRM pipeline"
        description="Leads by stage and follow-up workload."
        action={
          <Link href="/admin/crm" className="text-xs font-semibold text-green-700 hover:underline">
            Open CRM
          </Link>
        }
      />
      <CardBody>
        <QueryState query={pipeline}>
          {(data) => (
            <div className="space-y-4">
              <ul className="space-y-2">
                {data.counts.map((c) => {
                  const pct = data.total ? Math.round((c.count / data.total) * 100) : 0;
                  return (
                    <li key={c.status}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-ink-2">{humanize(c.status)}</span>
                        <span className="tabular-nums text-ink">{c.count}</span>
                      </div>
                      <div
                        className="h-2 rounded-full bg-sand overflow-hidden"
                        role="meter"
                        aria-label={`${humanize(c.status)} leads`}
                        aria-valuemin={0}
                        aria-valuemax={data.total}
                        aria-valuenow={c.count}
                      >
                        <div className="h-full bg-green-700 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Total leads" value={data.total} />
                <Metric label="Won" value={data.won} />
                <Metric label="Trial → won" value={formatRate(data.trialToWonRate)} />
                <Metric label="Booked → attended" value={formatRate(data.bookingToDoneRate)} />
                <Metric label="Open tasks" value={data.openTasks} />
                <Metric label="Overdue tasks" value={data.overdueTasks} alert={data.overdueTasks > 0} />
              </dl>
            </div>
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}

function Metric({ label, value, alert }: { label: string; value: React.ReactNode; alert?: boolean }) {
  return (
    <div className="rounded-xl bg-cream border border-line px-3 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={alert ? 'text-lg font-semibold text-red tabular-nums' : 'text-lg font-semibold text-ink tabular-nums'}>
        {value}
      </dd>
    </div>
  );
}

function TeacherChangesCard() {
  const changes = useTeacherChanges('OPEN');
  return (
    <Card>
      <CardHeader
        title="Open teacher-change requests"
        action={
          <Link href="/admin/teacher-changes" className="text-xs font-semibold text-green-700 hover:underline">
            Review queue
          </Link>
        }
      />
      <CardBody>
        <QueryState
          query={changes}
          empty={<EmptyState title="No open requests" icon={<Repeat className="w-5 h-5" />} />}
        >
          {(rows) => (
            <>
              <p className="text-3xl font-semibold text-ink tabular-nums">
                {rows.length >= LIST_CAP_TEACHER_CHANGES ? `${LIST_CAP_TEACHER_CHANGES}+` : rows.length}
              </p>
              <ul className="mt-3 divide-y divide-line">
                {rows.slice(0, 3).map((r) => (
                  <li key={r.id} className="py-2 text-sm flex items-center justify-between gap-3">
                    <span className="truncate text-ink-2">
                      {r.studentName ?? 'Student'} · {r.family.name}
                    </span>
                    <span className="text-[11px] text-muted shrink-0">{formatDate(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}

/** Families' own enrolments start as a TRIAL with no teacher; nothing else tells the academy. */
function AwaitingTeacherCard() {
  // Same filters as the Enrolments tab's default, so both share one cached request.
  const enrolments = useAdminEnrolments({ status: '' });
  return (
    <Card>
      <CardHeader
        title="Enrolments awaiting a teacher"
        action={
          <Link href="/admin/enrolments?awaiting=1" className="text-xs font-semibold text-green-700 hover:underline">
            Assign teachers
          </Link>
        }
      />
      <CardBody>
        <QueryState query={enrolments}>
          {(rows) => {
            const waiting = rows.filter(isAwaitingTeacher);
            if (waiting.length === 0) {
              return <EmptyState title="Every enrolment has a teacher" icon={<GraduationCap className="w-5 h-5" />} />;
            }
            return (
              <>
                <p className="text-3xl font-semibold text-ink tabular-nums">
                  {waiting.length}
                  {rows.length >= ENROLMENT_LIST_CAP && (
                    <span className="text-sm text-muted"> (in the newest {ENROLMENT_LIST_CAP})</span>
                  )}
                </p>
                <ul className="mt-3 divide-y divide-line">
                  {waiting.slice(0, 3).map((r) => (
                    <li key={r.id} className="py-2 text-sm flex items-center justify-between gap-3">
                      <span className="truncate text-ink-2">
                        {r.student.displayName} · {r.course.name}
                      </span>
                      <span className="text-[11px] text-muted shrink-0">{formatDate(r.startedAt)}</span>
                    </li>
                  ))}
                </ul>
              </>
            );
          }}
        </QueryState>
      </CardBody>
    </Card>
  );
}

function ApplicationsCard() {
  const apps = useHiringApplications();
  return (
    <Card>
      <CardHeader
        title="Teacher applications in progress"
        action={
          <Link href="/admin/teachers" className="text-xs font-semibold text-green-700 hover:underline">
            Hiring pipeline
          </Link>
        }
      />
      <CardBody>
        <QueryState
          query={apps}
          empty={<EmptyState title="No applications yet" icon={<ClipboardList className="w-5 h-5" />} />}
        >
          {(rows) => {
            const pending = rows.filter((a) => a.status !== 'APPROVED' && a.status !== 'REJECTED');
            const byStage = pending.reduce<Record<string, number>>((acc, a) => {
              acc[a.status] = (acc[a.status] ?? 0) + 1;
              return acc;
            }, {});
            return (
              <>
                <p className="text-3xl font-semibold text-ink tabular-nums">
                  {pending.length}
                  {rows.length >= LIST_CAP_APPLICATIONS && <span className="text-sm text-muted"> (first 200 shown)</span>}
                </p>
                {pending.length === 0 ? (
                  <p className="text-xs text-muted mt-1">Every application has been approved or closed.</p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(byStage).map(([stage, n]) => (
                      <li key={stage} className="flex items-center gap-1.5 text-xs">
                        <StatusBadge status={stage} />
                        <span className="tabular-nums text-ink-2">{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3">
                  <Target className="inline w-3.5 h-3.5 text-gold-600 mr-1" aria-hidden />
                  <span className="text-[11px] text-muted">{rows.length} applications on record.</span>
                </p>
              </>
            );
          }}
        </QueryState>
      </CardBody>
    </Card>
  );
}

/** API liveness + readiness (`GET /health/live`, `GET /health/ready`), refreshed every 30 s. */
function SystemHealthCard() {
  const live = useApiLiveness();
  const ready = useApiReadiness();
  const report = ready.data;
  const overall = ready.isError || live.isError ? 'down' : report?.status ?? null;
  return (
    <Card>
      <CardHeader
        title="System health"
        description="API, database and Redis status. Refreshes every 30 seconds."
        action={
          overall === 'ok' ? (
            <Badge tone="green">All systems up</Badge>
          ) : overall === 'degraded' ? (
            <Badge tone="amber">Degraded</Badge>
          ) : overall === 'down' ? (
            <Badge tone="red">API unreachable</Badge>
          ) : undefined
        }
      />
      <CardBody>
        {ready.isLoading && live.isLoading ? (
          <p className="text-sm text-muted">Checking…</p>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <HealthItem label="API" status={live.isError ? 'down' : live.data ? 'up' : null} detail={live.data ? `up ${formatUptime(live.data.uptimeSeconds)}` : undefined} />
            <HealthItem label="Database" status={report?.checks.database.status ?? (ready.isError ? 'down' : null)} detail={report ? `${report.checks.database.latencyMs} ms` : undefined} error={report?.checks.database.error} />
            <HealthItem label="Redis" status={report?.checks.redis.status ?? (ready.isError ? 'down' : null)} detail={report ? `${report.checks.redis.latencyMs} ms` : undefined} error={report?.checks.redis.error} />
            <div>
              <dt className="text-[11px] text-muted flex items-center gap-1">
                <Activity className="w-3 h-3" aria-hidden /> Last checked
              </dt>
              <dd className="text-ink">{report ? formatDateTime(report.timestamp) : '—'}</dd>
            </div>
          </dl>
        )}
      </CardBody>
    </Card>
  );
}

function HealthItem({ label, status, detail, error }: { label: string; status: 'up' | 'down' | null; detail?: string; error?: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2">
        {status === 'up' ? <Badge tone="green">Up</Badge> : status === 'down' ? <Badge tone="red">Down</Badge> : <Badge>—</Badge>}
        {detail && <span className="text-xs text-muted tabular-nums">{detail}</span>}
      </dd>
      {error && <p className="text-[11px] text-red mt-1">{error}</p>}
    </div>
  );
}
