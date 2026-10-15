'use client';

import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  QueryState,
  Select,
  StatTile,
  StatusBadge,
  UiButton,
  formatDate,
  humanize,
} from '@/components/ui/primitives';
import { useProgressChart, useReportCard, useStudentDashboard } from '@/hooks/useParentProgress';
import { formatMonthKey, MistakeBreakdown, recentMonths } from '@/lib/api/modules/parent-progress';
import { mistakeLabel } from '@/lib/api/modules/lessons-read';
import { HorizontalBars, SERIES_COLORS, SINGLE_SERIES_COLOR, StackedBarChart } from './charts';
import { StarsDisplay } from './shared';

const MONTH_OPTIONS = [3, 6, 12, 24];

/** Progress tab: memorisation series, last-7-days minutes, this month's mistakes. */
export function ChildProgress({ studentId }: { studentId: string }) {
  const [months, setMonths] = useState(6);
  const chart = useProgressChart(studentId, months);
  const dashboard = useStudentDashboard(studentId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Memorisation progress"
          description="Pages by state, counted in the month they were last revised."
          action={
            <div className="w-36">
              <label htmlFor="progress-months" className="sr-only">Period</label>
              <Select id="progress-months" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m}>Last {m} months</option>
                ))}
              </Select>
            </div>
          }
        />
        <CardBody>
          <QueryState
            query={chart}
            isEmpty={(d) => d.series.every((p) => p.solid + p.fragile + p.inProgress === 0)}
            empty={<EmptyState title="No pages tracked yet" description="Progress appears once the teacher records memorised pages." />}
          >
            {(data) => (
              <StackedBarChart
                title="Pages by memorisation state per month"
                data={data.series}
                categoryKey="month"
                formatCategory={(m) => formatMonthKey(m, { month: 'short' })}
                series={[
                  { key: 'solid', label: 'Solid', color: SERIES_COLORS.solid },
                  { key: 'inProgress', label: 'In progress', color: SERIES_COLORS.inProgress },
                  { key: 'fragile', label: 'Fragile', color: SERIES_COLORS.fragile },
                ]}
                unit=" pages"
              />
            )}
          </QueryState>
        </CardBody>
      </Card>

      {dashboard.isLoading ? (
        <LoadingState />
      ) : dashboard.isError || !dashboard.data ? (
        <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              label="Current streak"
              value={dashboard.data.streak ? `${dashboard.data.streak.currentLength} days` : '—'}
              hint={dashboard.data.streak ? `Longest ${dashboard.data.streak.longestLength} days` : 'No streak yet'}
            />
            <StatTile
              label="Attendance this month"
              value={dashboard.data.attendance.attendanceRate === null ? '—' : `${dashboard.data.attendance.attendanceRate}%`}
              hint={`${dashboard.data.attendance.attendedClasses} of ${dashboard.data.attendance.bookedClasses} classes`}
            />
            <StatTile label="Minutes in class" value={dashboard.data.attendance.minutesAttended} hint="This month" />
            <StatTile label="Pages tracked" value={dashboard.data.memorisation.pagesTracked} hint={`${dashboard.data.memorisation.openMistakes} open mistakes`} />
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader title="Last 7 days" description="Minutes present in class each day." />
              <CardBody>
                {dashboard.data.weekTrend.every((d) => d.minutes === 0) ? (
                  <EmptyState title="No class time this week" />
                ) : (
                  <StackedBarChart
                    title="Minutes in class per day, last 7 days"
                    data={dashboard.data.weekTrend}
                    categoryKey="day"
                    formatCategory={(d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}
                    series={[{ key: 'minutes', label: 'Minutes', color: SINGLE_SERIES_COLOR }]}
                    unit=" min"
                  />
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Mistakes this month" description="By type, from class and practice." />
              <CardBody>
                <MistakeSummary mistakes={dashboard.data.mistakes} />
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function MistakeSummary({ mistakes }: { mistakes: MistakeBreakdown }) {
  if (mistakes.total === 0) return <EmptyState title="No mistakes recorded this month" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        {mistakes.total} total · {mistakes.dismissed} resolved by the teacher · {mistakes.pending} still being worked on
      </p>
      <HorizontalBars title="Mistakes by type" rows={mistakes.byType.map((m) => ({ label: mistakeLabel(m.type), value: m.count }))} />
    </div>
  );
}

/** Report card tab: monthly report with a month picker and print. */
export function ChildReportCard({ studentId }: { studentId: string }) {
  const [months] = useState(() => recentMonths(12));
  const [selected, setSelected] = useState(0);
  const period = months[selected] ?? months[0];
  const report = useReportCard(studentId, period.year, period.month);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <Field label="Month" htmlFor="report-month" className="w-48">
          <Select id="report-month" value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
            {months.map((m, i) => (
              <option key={`${m.year}-${m.month}`} value={i}>
                {formatMonthKey(`${m.year}-${String(m.month).padStart(2, '0')}`, { month: 'long', year: 'numeric' })}
              </option>
            ))}
          </Select>
        </Field>
        <UiButton variant="secondary" size="sm" icon={<Printer className="w-3.5 h-3.5" />} onClick={() => window.print()}>
          Print
        </UiButton>
      </div>
      <QueryState query={report}>
        {(r) => (
          <Card>
            <CardHeader
              title={`${r.student.displayName} — ${formatMonthKey(`${r.period.year}-${String(r.period.month).padStart(2, '0')}`, { month: 'long', year: 'numeric' })}`}
              description={r.courses.map((c) => `${c.name}${c.teacherName ? ` with ${c.teacherName}` : ''}`).join(' · ') || 'No active courses'}
            />
            <CardBody className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile label="Attendance" value={r.attendance.attendanceRate === null ? '—' : `${r.attendance.attendanceRate}%`} hint={`${r.attendance.attendedClasses} of ${r.attendance.bookedClasses} classes`} />
                <StatTile label="Minutes in class" value={r.attendance.minutesAttended} />
                <StatTile label="Mistakes" value={r.mistakes.total} hint={`${r.mistakes.dismissed} resolved`} />
                <StatTile
                  label="Your class ratings"
                  value={r.familyFeedback.averageStars === null ? '—' : r.familyFeedback.averageStars}
                  hint={r.familyFeedback.count === 0 ? 'No ratings this month' : `${r.familyFeedback.count} rating${r.familyFeedback.count === 1 ? '' : 's'}`}
                />
              </div>

              {r.hifzGoal && (
                <section>
                  <h3 className="text-sm font-semibold text-ink font-sans mb-1">Hifz goal</h3>
                  <p className="text-sm text-ink-2">{r.hifzGoal.targetDescription}</p>
                  <p className="text-xs text-muted">
                    Pages {r.hifzGoal.targetFromPage}–{r.hifzGoal.targetToPage}, due {formatDate(r.hifzGoal.dueOn)} · <StatusBadge status={r.hifzGoal.status} />
                  </p>
                </section>
              )}

              <section>
                <h3 className="text-sm font-semibold text-ink font-sans mb-2">Assessments</h3>
                {r.assessments.length === 0 ? (
                  <p className="text-sm text-muted">No assessments taken this month.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {r.assessments.map((a) => (
                      <li key={a.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-ink">
                          {humanize(a.type)}
                          {a.level ? ` · ${a.level.name}` : ''}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-muted">{formatDate(a.takenAt)}</span>
                          <StatusBadge status={a.result} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-ink font-sans mb-2">Mistakes by type</h3>
                <MistakeSummary mistakes={r.mistakes} />
              </section>

              <section>
                <h3 className="text-sm font-semibold text-ink font-sans mb-2">Teacher notes from lesson cards</h3>
                {r.lessonCards.length === 0 ? (
                  <p className="text-sm text-muted">No lesson cards were shared this month.</p>
                ) : (
                  <ul className="space-y-2">
                    {r.lessonCards.map((c) => (
                      <li key={c.id} className="rounded-xl border border-line px-3 py-2">
                        <p className="text-xs font-semibold text-ink">
                          {formatDate(c.class.startsAt)} · {c.class.course.name}
                        </p>
                        {c.parentNote && <p className="text-sm text-ink-2 mt-0.5">{c.parentNote}</p>}
                        {c.homework && <p className="text-xs text-muted mt-0.5">Homework: {c.homework}</p>}
                        {!c.parentNote && !c.homework && <p className="text-xs text-muted mt-0.5">No note.</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {r.familyFeedback.averageStars !== null && (
                <p className="flex items-center gap-2 text-xs text-muted">
                  <StarsDisplay value={r.familyFeedback.averageStars} /> Average of your family’s class ratings
                  <Badge>{r.familyFeedback.count}</Badge>
                </p>
              )}
            </CardBody>
          </Card>
        )}
      </QueryState>
    </div>
  );
}
