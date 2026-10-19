'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, ShieldCheck } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  QueryState,
  StatTile,
  StatusBadge,
} from '@/components/ui/primitives';
import { useCaseSla } from '@/hooks/useCases';
import { CaseSlaReport, caseReference, formatMinutes } from '@/lib/api/modules/cases';
import { CaseTypeBadge } from './CaseBoard';

type Breached = CaseSlaReport['breachedDetail'][number];
type Pending = CaseSlaReport['openDetail'][number];

/** `GET /cases/sla` — what is open, what is overdue and by how much (SAF-FE-02). */
export function SlaMonitor({ basePath }: { basePath: string }) {
  const sla = useCaseSla();

  return (
    <>
      <PageHeader
        eyebrow="Safeguarding"
        title="SLA monitor"
        description="Every open case, measured from when it was first raised. Refreshes every minute."
      />
      <QueryState query={sla} isEmpty={() => false}>
        {(report) => {
          const breached = [...report.breachedDetail].sort((a, b) => b.minutesOverdue - a.minutesOverdue);
          const pending = [...report.openDetail].sort((a, b) => a.minutesRemaining - b.minutesRemaining);
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <StatTile label="Open cases" value={report.open} icon={<Clock className="w-4 h-4" />} />
                <StatTile
                  label="Breached SLA"
                  value={<span className={report.breached > 0 ? 'text-red' : undefined}>{report.breached}</span>}
                  icon={<AlertTriangle className="w-4 h-4" />}
                />
                <StatTile
                  label="Within SLA"
                  value={report.open - report.breached}
                  icon={<ShieldCheck className="w-4 h-4" />}
                />
              </div>

              <Card className={breached.length > 0 ? 'border-red/40' : undefined}>
                <CardHeader title="Breached" description="Most overdue first — take these first." />
                <CardBody>
                  <DataTable<Breached>
                    rows={breached}
                    rowKey={(r) => r.id}
                    empty={<EmptyState title="No breached cases" description="Every open case is within its SLA." />}
                    columns={[
                      {
                        key: 'ref',
                        header: 'Case',
                        render: (r) => (
                          <Link href={`${basePath}/${r.id}`} className="font-mono text-xs font-semibold text-red hover:underline">
                            {caseReference(r.id)}
                          </Link>
                        ),
                      },
                      { key: 'type', header: 'Type', render: (r) => <CaseTypeBadge type={r.type} /> },
                      { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                      {
                        key: 'over',
                        header: 'Overdue by',
                        render: (r) => <Badge tone="red">{formatMinutes(r.minutesOverdue)}</Badge>,
                      },
                    ]}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Within SLA" description="Closest to breaching first." />
                <CardBody>
                  <DataTable<Pending>
                    rows={pending}
                    rowKey={(r) => r.id}
                    empty={<EmptyState title="Nothing pending" />}
                    columns={[
                      {
                        key: 'ref',
                        header: 'Case',
                        render: (r) => (
                          <Link href={`${basePath}/${r.id}`} className="font-mono text-xs font-semibold text-green-800 hover:underline">
                            {caseReference(r.id)}
                          </Link>
                        ),
                      },
                      { key: 'type', header: 'Type', render: (r) => <CaseTypeBadge type={r.type} /> },
                      {
                        key: 'left',
                        header: 'Time left',
                        render: (r) => (
                          <Badge tone={r.minutesRemaining <= 5 ? 'amber' : 'neutral'}>{formatMinutes(r.minutesRemaining)}</Badge>
                        ),
                      },
                    ]}
                  />
                </CardBody>
              </Card>
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
