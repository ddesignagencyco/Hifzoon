'use client';

import React, { useState } from 'react';
import {
  Card, CardBody, CardHeader, DataTable, EmptyState, Field, PageHeader, QueryState, Select, StatTile, TextInput, formatMoney,
} from '@/components/ui/primitives';
import { useAnalytics } from '@/hooks/useOpsAdmin';
import { useMyPermissions } from '@/hooks/usePermissions';
import { Granularity, pct } from '@/lib/api/modules/ops-admin';

const day = (d: Date) => d.toISOString().slice(0, 10);

/** /admin/analytics — revenue, class completion, churn and teacher utilisation (≤ 366 days). */
export function AnalyticsDashboard() {
  const { can, isLoading } = useMyPermissions();
  const [from, setFrom] = useState(() => day(new Date(Date.now() - 90 * 86_400_000)));
  const [to, setTo] = useState(() => day(new Date()));
  const [granularity, setGranularity] = useState<Granularity>('month');
  const allowed = can('analytics.view');
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  const rangeError = !from || !to ? 'Choose both dates.' : days <= 0 ? 'The start must be before the end.' : days > 366 ? 'Pick a range of at most 366 days.' : null;
  const query = useAnalytics({
    from: from ? `${from}T00:00:00.000Z` : undefined,
    // The end date is inclusive: stop at the start of the next day.
    to: to ? new Date(Date.parse(to) + 86_400_000).toISOString() : undefined,
    granularity,
  });

  return (
    <>
      <PageHeader eyebrow="Academy admin" title="Analytics" description="Revenue, class completion, churn and teacher utilisation." />
      {!isLoading && !allowed ? (
        <Card><EmptyState title="No access" description="You do not have the analytics permission." /></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 max-w-2xl mb-5">
            <Field label="From" htmlFor="an-from"><TextInput id="an-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To" htmlFor="an-to" error={rangeError}><TextInput id="an-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Field label="Group by" htmlFor="an-gran">
              <Select id="an-gran" value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)}>
                <option value="week">Week</option><option value="month">Month</option>
              </Select>
            </Field>
          </div>
          {rangeError && <p className="text-sm text-red mb-3" role="alert">{rangeError}</p>}
          {!rangeError && (
            <QueryState query={query}>
              {(r) => {
                const completed = r.completion.reduce((s, c) => s + c.completed, 0);
                const finished = r.completion.reduce((s, c) => s + c.finished, 0);
                const currencies = [...new Set(r.revenue.map((x) => x.currency))];
                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {currencies.map((c) => (
                        <StatTile key={c} label={`Net revenue (${c})`} value={formatMoney(r.revenue.filter((x) => x.currency === c).reduce((s, x) => s + x.netMinor, 0), c)} />
                      ))}
                      <StatTile label="Completion rate" value={pct(finished ? completed / finished : null)} />
                      <StatTile label="Teacher utilisation" value={pct(r.teacherUtilisation.overall)} />
                    </div>
                    <Card><CardHeader title="Revenue" /><CardBody>
                      <DataTable paginate={false} rows={r.revenue} rowKey={(x) => `${x.bucket}${x.currency}`} empty={<EmptyState title="No payments in this range" />}
                        columns={[
                          { key: 'b', header: 'Period starting', render: (x) => x.bucket },
                          { key: 'g', header: 'Gross', className: 'text-right tabular-nums', render: (x) => formatMoney(x.grossMinor, x.currency) },
                          { key: 'r', header: 'Refunded', className: 'text-right tabular-nums', render: (x) => formatMoney(x.refundedMinor, x.currency) },
                          { key: 'n', header: 'Net', className: 'text-right tabular-nums', render: (x) => formatMoney(x.netMinor, x.currency) },
                        ]} />
                    </CardBody></Card>
                    <Card><CardHeader title="Class completion" /><CardBody>
                      <DataTable paginate={false} rows={r.completion} rowKey={(x) => x.bucket} empty={<EmptyState title="No classes in this range" />}
                        columns={[
                          { key: 'b', header: 'Period starting', render: (x) => x.bucket },
                          { key: 'c', header: 'Completed', className: 'tabular-nums', render: (x) => x.completed },
                          { key: 'n', header: 'No-show', className: 'tabular-nums', render: (x) => x.noShow },
                          { key: 'x', header: 'Cancelled', className: 'tabular-nums', render: (x) => x.cancelled },
                          { key: 'r', header: 'Completion rate', className: 'tabular-nums', render: (x) => pct(x.completionRate) },
                        ]} />
                    </CardBody></Card>
                    <Card><CardHeader title="Churn" description="Uses a subscription's last update as its cancel time." /><CardBody>
                      <DataTable paginate={false} rows={r.churn} rowKey={(x) => x.bucket} empty={<EmptyState title="No data" />}
                        columns={[
                          { key: 'b', header: 'Period starting', render: (x) => x.bucket },
                          { key: 'a', header: 'Active at start', className: 'tabular-nums', render: (x) => x.activeAtStart },
                          { key: 'c', header: 'Cancelled', className: 'tabular-nums', render: (x) => x.cancelled },
                          { key: 'r', header: 'Churn', className: 'tabular-nums', render: (x) => pct(x.churnRate) },
                        ]} />
                    </CardBody></Card>
                    <Card><CardHeader title="Teacher utilisation" description="Minutes taught vs offered." /><CardBody>
                      <DataTable rows={r.teacherUtilisation.teachers} rowKey={(x) => x.teacherId} empty={<EmptyState title="No teachers" />}
                        columns={[
                          { key: 'n', header: 'Teacher', render: (x) => x.name },
                          { key: 't', header: 'Taught (min)', className: 'tabular-nums', sortValue: (x) => x.taughtMinutes, render: (x) => x.taughtMinutes },
                          { key: 'a', header: 'Offered (min)', className: 'tabular-nums', sortValue: (x) => x.availableMinutes, render: (x) => x.availableMinutes },
                          { key: 'u', header: 'Utilisation', className: 'tabular-nums', sortValue: (x) => x.utilisation ?? -1, render: (x) => pct(x.utilisation) },
                        ]} />
                    </CardBody></Card>
                  </div>
                );
              }}
            </QueryState>
          )}
        </>
      )}
    </>
  );
}
