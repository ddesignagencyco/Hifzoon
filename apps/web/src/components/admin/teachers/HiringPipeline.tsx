'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, UserPlus } from 'lucide-react';
import {
  Card,
  CardBody,
  EmptyState,
  QueryState,
  StatusBadge,
  Tabs,
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
  const [stage, setStage] = useState<StageFilter>('IN_PROGRESS');
  const [term, setTerm] = useState('');
  // Fetch everything once and filter client-side so stage counts are always visible.
  const apps = useHiringApplications();

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of apps.data ?? []) map[a.status] = (map[a.status] ?? 0) + 1;
    return map;
  }, [apps.data]);
  const inProgress = (apps.data ?? []).filter((a) => a.status !== 'APPROVED' && a.status !== 'REJECTED').length;

  const tabs: Array<{ value: StageFilter; label: React.ReactNode }> = [
    { value: 'IN_PROGRESS', label: `In progress (${inProgress})` },
    ...HIRING_STAGES.map((s) => ({ value: s as StageFilter, label: `${humanize(s)} (${counts[s] ?? 0})` })),
    { value: 'ALL', label: `All (${apps.data?.length ?? 0})` },
  ];

  return (
    <Card>
      <CardBody className="pt-5 space-y-4">
        <div className="overflow-x-auto -mx-1 px-1">
          <Tabs value={stage} onChange={setStage} tabs={tabs} className="flex-nowrap whitespace-nowrap" />
        </div>
        <div className="max-w-sm">
          <label htmlFor="applicant-filter" className="sr-only">
            Filter applicants
          </label>
          <TextInput
            id="applicant-filter"
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
              <ul className="divide-y divide-line">
                {visible.map((a) => {
                  const steps = sortSteps(a.steps);
                  const outstanding = outstandingSteps(a.steps);
                  const failed = a.steps.find((s) => s.status === 'FAILED');
                  return (
                    <li key={a.id}>
                      <Link
                        href={`${basePath}/${a.id}`}
                        className="flex items-center gap-3 py-3 rounded-lg hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold px-2 -mx-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-ink">{a.applicantName}</span>
                            <StatusBadge status={a.status} />
                            {failed && <StatusBadge status="FAILED" />}
                          </div>
                          <p className="text-xs text-muted truncate">
                            {a.email}
                            {a.country ? ` · ${a.country}` : ''} · applied {formatDate(a.createdAt)}
                          </p>
                          <ol className="mt-2 flex gap-1" aria-label="Step progress">
                            {steps.map((s) => (
                              <li
                                key={s.step}
                                title={`${humanize(s.step)}: ${humanize(s.status)}`}
                                className={cn(
                                  'h-1.5 flex-1 max-w-10 rounded-full',
                                  s.status === 'PASSED' ? 'bg-green-600' : s.status === 'FAILED' ? 'bg-red' : 'bg-line',
                                )}
                              >
                                <span className="sr-only">
                                  {humanize(s.step)}: {humanize(s.status)}
                                </span>
                              </li>
                            ))}
                          </ol>
                          {a.status === 'APPROVED' && outstanding.length > 0 && (
                            <p className="text-[11px] text-amber mt-1">
                              Marked approved with {outstanding.length} step(s) not passed — review the timeline.
                            </p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            );
          }}
        </QueryState>
      </CardBody>
    </Card>
  );
}
