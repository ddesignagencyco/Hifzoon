'use client';

import React, { useState } from 'react';
import { ALL, FilterBar, FilterSearch, FilterSelect, matchesSearch, optionsFrom } from '@/components/ui/FilterSelect';
import { CaseSeverityBadge } from './CaseSeverityBadge';
import { CASE_SEVERITIES } from '@/lib/api/modules/cases';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Plus, ShieldAlert } from 'lucide-react';
import {
  Badge,
  Checkbox,
  DataTable,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Pagination,
  QueryState,
  Select,
  StatusBadge,
  UiButton,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useCases, useNow } from '@/hooks/useCases';
import {
  CASE_STATUSES,
  CaseListFilter,
  CaseListItem,
  CaseStatus,
  CaseType,
  caseReference,
  formatMinutes,
  isCaseOverdue,
} from '@/lib/api/modules/cases';
import { CaseCreateForm } from './CaseCreateForm';

export function CaseTypeBadge({ type }: { type: CaseType }) {
  return type === 'SAFEGUARDING' ? (
    <Badge tone="red">
      <ShieldAlert className="w-3 h-3" aria-hidden /> Safeguarding
    </Badge>
  ) : (
    <Badge tone="blue">Complaint</Badge>
  );
}

export function SlaBadge({ status, dueAt, now }: { status: CaseStatus; dueAt: string; now: number }) {
  if (status === 'CLOSED') return <span className="text-xs text-muted">Closed</span>;
  const minutes = Math.round((new Date(dueAt).getTime() - now) / 60000);
  if (minutes < 0) return <Badge tone="red">Overdue {formatMinutes(minutes)}</Badge>;
  return <Badge tone={minutes <= 5 ? 'amber' : 'neutral'}>{formatMinutes(minutes)} left</Badge>;
}

/**
 * Case board shared by the safeguarding and supervisor portals: filter by type, status
 * and overdue, open a new case, and drill into a case at `${basePath}/<id>`.
 */
export function CaseBoard({
  basePath,
  title,
  description,
  eyebrow,
  actions,
}: {
  basePath: string;
  title: string;
  description: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const now = useNow();
  const [filter, setFilter] = useState<CaseListFilter>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [creating, setCreating] = useState(false);
  // Severity, owner and search narrow the loaded page of cases (the API filters the rest).
  const [severity, setSeverity] = useState<string>(ALL);
  const [owner, setOwner] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const cases = useCases({ ...filter, page, limit });
  const loaded = cases.data?.items ?? [];
  const severityOptions = optionsFrom(loaded, (c) => ({ value: c.severity ?? 'MEDIUM', label: humanize(c.severity ?? 'MEDIUM') }), 'All severities');
  const ownerOptions = optionsFrom(
    loaded,
    (c) => (c.owner ? { value: c.owner.id, label: c.owner.name } : { value: 'NONE', label: 'Unassigned' }),
    'All owners',
  );
  const visibleCases = (items: CaseListItem[]) =>
    items.filter(
      (c) =>
        (severity === ALL || (c.severity ?? 'MEDIUM') === severity) &&
        (owner === ALL || (owner === 'NONE' ? !c.owner : c.owner?.id === owner)) &&
        matchesSearch(search, caseReference(c.id), c.summary, c.owner?.name),
    );
  // Any filter change goes back to the first page.
  const patchFilter = (patch: Partial<CaseListFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const columns = [
    {
      key: 'ref',
      header: 'Case',
      render: (c: CaseListItem) => (
        <Link href={`${basePath}/${c.id}`} className="font-mono text-xs font-semibold text-green-800 hover:underline">
          {caseReference(c.id)}
        </Link>
      ),
    },
    { key: 'type', header: 'Type', render: (c: CaseListItem) => <CaseTypeBadge type={c.type} /> },
    {
      key: 'severity',
      header: 'Severity',
      sortValue: (c: CaseListItem) => CASE_SEVERITIES.length - CASE_SEVERITIES.indexOf(c.severity ?? 'MEDIUM'),
      render: (c: CaseListItem) => <CaseSeverityBadge severity={c.severity} />,
    },
    { key: 'status', header: 'Status', render: (c: CaseListItem) => <StatusBadge status={c.status} /> },
    {
      key: 'summary',
      header: 'Summary',
      className: 'min-w-[220px]',
      render: (c: CaseListItem) => <span className="line-clamp-2 text-ink">{c.summary}</span>,
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (c: CaseListItem) => (c.owner ? c.owner.name : <span className="text-amber font-medium">Unassigned</span>),
    },
    { key: 'sla', header: 'SLA', render: (c: CaseListItem) => <SlaBadge status={c.status} dueAt={c.dueAt} now={now} /> },
    { key: 'notes', header: 'Notes', render: (c: CaseListItem) => <span className="tabular-nums">{c._count.notes}</span> },
    { key: 'opened', header: 'Opened', render: (c: CaseListItem) => <span className="whitespace-nowrap text-xs">{formatDateTime(c.createdAt)}</span> },
  ];

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <>
            {actions}
            <UiButton icon={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>
              Open a case
            </UiButton>
          </>
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-line bg-sand/60 px-4 py-3 text-xs text-ink-2">
        <Lock className="w-4 h-4 mt-0.5 shrink-0 text-gold-600" aria-hidden />
        <p>
          Confidential. Opening a case is recorded in the audit log with your name. Share details only with people
          who need them to keep a child safe.
        </p>
      </div>

      <div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end mb-4">
            <Field label="Type" htmlFor="filter-type">
              <Select
                id="filter-type"
                value={filter.type ?? ''}
                onChange={(e) => patchFilter({ type: (e.target.value || undefined) as CaseType | undefined })}
              >
                <option value="">All types</option>
                <option value="SAFEGUARDING">Safeguarding</option>
                <option value="COMPLAINT">Complaint</option>
              </Select>
            </Field>
            <Field label="Status" htmlFor="filter-status">
              <Select
                id="filter-status"
                value={filter.status ?? ''}
                onChange={(e) => patchFilter({ status: (e.target.value || undefined) as CaseStatus | undefined })}
              >
                <option value="">All statuses</option>
                {CASE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="pb-2">
              <Checkbox
                id="filter-overdue"
                label="Overdue only"
                checked={!!filter.overdueOnly}
                onChange={(v) => patchFilter({ overdueOnly: v || undefined })}
              />
            </div>
          </div>
          <FilterBar className="mb-4">
            <FilterSelect id="filter-severity" label="Severity" value={severity} options={severityOptions} onChange={setSeverity} />
            <FilterSelect id="filter-owner" label="Assignee" value={owner} options={ownerOptions} onChange={setOwner} />
            <FilterSearch id="filter-search" value={search} onChange={setSearch} placeholder="Case ref, summary or owner" />
          </FilterBar>
          <QueryState
            query={cases}
            isEmpty={(d) => d.items.length === 0}
            empty={
              <EmptyState className="rounded-xl border border-line bg-white"
                title="No cases match"
                description={filter.type || filter.status || filter.overdueOnly ? 'Try clearing the filters.' : 'No cases have been opened.'}
              />
            }
          >
            {(data) => (
              <>
                <DataTable
                  paginate={false}
                  columns={columns}
                  rows={visibleCases(data.items)}
                  empty={<EmptyState title="No cases on this page match these filters" />}
                  rowKey={(c) => c.id}
                  onRowClick={(c) => router.push(`${basePath}/${c.id}`)}
                />
                <Pagination
                  page={data.meta.page}
                  limit={data.meta.limit}
                  total={data.meta.total}
                  onPageChange={setPage}
                  onLimitChange={(l) => {
                    setLimit(l);
                    setPage(1);
                  }}
                  itemName="cases"
                  className="mt-3"
                />
              </>
            )}
          </QueryState>
          {cases.data && cases.data.items.some((c) => isCaseOverdue(c, now)) && (
            <p className="text-[11px] text-red mt-3">Cases past their SLA are highlighted as overdue.</p>
          )}
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Open a case"
        description="The safeguarding lead is paged immediately and the SLA clock starts now."
        size="lg"
      >
        <CaseCreateForm
          onCancel={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            router.push(`${basePath}/${c.id}`);
          }}
        />
      </Modal>
    </>
  );
}
