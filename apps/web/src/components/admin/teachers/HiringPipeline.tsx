'use client';

import React, { useMemo, useState } from 'react';
import { FilterSelect } from '@/components/ui/FilterSelect';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, UserPlus } from 'lucide-react';
import {
  Card,
  CardBody,
  DataTable,
  EmptyState,
  QueryState,
  StatusBadge,
  TextInput,
  formatDate,
  humanize,
} from '@/components/ui/primitives';
import { useHiringApplications } from '@/hooks/useHiring';
import { HIRING_STAGES, HiringStage, outstandingSteps, sortSteps } from '@/lib/api/modules/teacher-hiring';
import { cn } from '@/lib/utils';

type StageFilter = HiringStage | 'ALL' | 'IN_PROGRESS';

/**
 * Hiring pipeline board (`GET /teachers/applications/list`). Shared by the admin and
 * supervisor portals; `basePath` decides where the detail link points.
 */
export function HiringPipeline({ basePath }: { basePath: string }) {
  const [stage, setStage] = useState<StageFilter>('ALL');
  const [term, setTerm] = useState('');
  const router = useRouter();
  // Fetch everything once and filter client-side so stage counts are always visible.
  const apps = useHiringApplications();

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of apps.data ?? []) map[a.status] = (map[a.status] ?? 0) + 1;
    return map;
  }, [apps.data]);
  const inProgress = (apps.data ?? []).filter((a) => a.status !== 'APPROVED' && a.status !== 'REJECTED').length;

  const tabs: Array<{ value: StageFilter; label: string }> = [
    { value: 'ALL', label: `All stages (${apps.data?.length ?? 0})` },
    { value: 'IN_PROGRESS', label: `In progress (${inProgress})` },
    ...HIRING_STAGES.map((s) => ({ value: s as StageFilter, label: `${humanize(s)} (${counts[s] ?? 0})` })),
  ];

  return (
    <Card>
      <CardBody className="pt-5 space-y-4">
        <div className="overflow-x-auto -mx-1 px-1">
          <FilterSelect id="hiring-stage" label="Stage" value={stage} onChange={setStage} options={tabs} />
        </div>
        <div className="relative max-w-sm">
          <label htmlFor="applicant-filter" className="sr-only">
            Filter applicants
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <TextInput
            id="applicant-filter"
            className="pl-9"
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Filter by name or email"
          />
        </div>
        <QueryState query={apps} empty={<EmptyState icon={<UserPlus className="w-5 h-5" />} title="No applications yet" />}>
          {(rows) => {
            const needle = term.trim().toLowerCase();
            const visible = rows.filter((a) => {
              const stageOk =
                stage === 'ALL' ||
                (stage === 'IN_PROGRESS' ? a.status !== 'APPROVED' && a.status !== 'REJECTED' : a.status === stage);
              const termOk = !needle || a.applicantName.toLowerCase().includes(needle) || a.email.toLowerCase().includes(needle);
              return stageOk && termOk;
            });
            if (visible.length === 0) return <EmptyState title="No applications in this view" />;
            return (
              <DataTable
                rows={visible}
                rowKey={(a) => a.id}
                onRowClick={(a) => router.push(`${basePath}/${a.id}`)}
                columns={[
                  {
                    key: 'applicant',
                    header: 'Applicant',
                    render: (a) => (
                      <span className="block min-w-0">
                        <Link href={`${basePath}/${a.id}`} className="font-medium text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                          {a.applicantName}
                        </Link>
                        <span className="block truncate text-xs text-muted">{a.email}</span>
                      </span>
                    ),
                    sortValue: (a) => a.applicantName.toLowerCase(),
                  },
                  { key: 'country', header: 'Country', render: (a) => a.country ?? '—' },
                  {
                    key: 'applied',
                    header: 'Applied',
                    render: (a) => <span className="whitespace-nowrap">{formatDate(a.createdAt)}</span>,
                    sortValue: (a) => a.createdAt,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (a) => (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={a.status} />
                        {a.steps.some((st) => st.status === 'FAILED') && <StatusBadge status="FAILED" />}
                      </span>
                    ),
                    sortValue: (a) => a.status,
                  },
                  {
                    key: 'progress',
                    header: 'Steps',
                    sortValue: (a) => a.steps.filter((st) => st.status === 'PASSED').length,
                    render: (a) => {
                      const steps = sortSteps(a.steps);
                      const passed = steps.filter((st) => st.status === 'PASSED').length;
                      const outstanding = outstandingSteps(a.steps);
                      return (
                        <span className="block min-w-[140px]">
                          <span className="flex gap-1" aria-label={`${passed} of ${steps.length} steps passed`}>
                            {steps.map((st) => (
                              <span
                                key={st.step}
                                title={`${humanize(st.step)}: ${humanize(st.status)}`}
                                className={cn(
                                  'h-1.5 flex-1 max-w-8 rounded-full',
                                  st.status === 'PASSED' ? 'bg-green-600' : st.status === 'FAILED' ? 'bg-red' : 'bg-line',
                                )}
                              />
                            ))}
                          </span>
                          <span className="mt-1 block text-[11px] text-muted">
                            {passed}/{steps.length} passed
                            {a.status === 'APPROVED' && outstanding.length > 0 ? ' · approved with steps open' : ''}
                          </span>
                        </span>
                      );
                    },
                  },
                ]}
              />
            );
          }}
        </QueryState>
      </CardBody>
    </Card>
  );
}
