'use client';

import React, { useState } from 'react';
import { FileLock } from 'lucide-react';
import { ALL, FilterBar, FilterSearch, FilterSelect, matchesSearch, optionsFrom } from '@/components/ui/FilterSelect';
import {
  Alert,
  Badge,
  DataTable,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  QueryState,
  StatusBadge,
  TextArea,
  UiButton,
  formatDate,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminDataRequests, useRejectDataRequest } from '@/hooks/useDataRequestsAdmin';
import { AdminDataRequest, daysUntilDue, validateRejectionReason } from '@/lib/api/modules/data-requests-admin';

type View = 'open' | 'all';

/**
 * `/admin/data-requests` — family export and deletion requests against their 30-day
 * deadline (CR-05). Both run automatically; an admin steps in only to refuse one.
 */
export function DataRequestsQueue() {
  const [view, setView] = useState<View>('all');
  const list = useAdminDataRequests({ openOnly: view === 'open' });
  const [rejecting, setRejecting] = useState<AdminDataRequest | null>(null);
  const [type, setType] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [due, setDue] = useState<string>(ALL);
  const [term, setTerm] = useState('');
  const present = new Set((list.data ?? []).map(dueState));
  const dueOptions = DUE_OPTIONS.filter((o) => present.has(o.value));

  return (
    <>
      <PageHeader
        eyebrow="Academy admin"
        title="Data requests"
        description="Families’ requests for a copy of their data or for deletion. Each must be answered within 30 days; exports and deletions run on their own."
      />
      <FilterBar className="mb-4">
        <FilterSelect
          id="dr-view"
          label="Show"
          value={view}
          onChange={(v) => {
            setView(v);
            setStatus(ALL);
            setDue(ALL);
          }}
          options={[
            { value: 'all' as const, label: 'All requests' },
            { value: 'open' as const, label: 'Waiting for an answer' },
          ]}
        />
        {list.data && list.data.length > 0 && (
          <>
            <FilterSelect id="dr-type" label="Type" value={type} onChange={setType} options={optionsFrom(list.data, (r) => ({ value: r.type, label: typeLabel(r.type) }), 'All types')} />
            <FilterSelect id="dr-status" label="Status" value={status} onChange={setStatus} options={optionsFrom(list.data, (r) => ({ value: r.status, label: humanize(r.status) }), 'All statuses')} />
            {dueOptions.length > 1 && <FilterSelect id="dr-due" label="Deadline" value={due} onChange={setDue} options={[{ value: ALL, label: 'All deadlines' }, ...dueOptions]} />}
            <FilterSearch id="dr-search" value={term} onChange={setTerm} placeholder="Family, child or reference" />
          </>
        )}
      </FilterBar>
      <QueryState
        query={list}
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            className="rounded-xl border border-line bg-white"
            icon={<FileLock className="w-5 h-5" />}
            title={view === 'open' ? 'No requests waiting' : 'No data requests yet'}
          />
        }
      >
        {(rows) => (
          <DataTable
            rows={rows.filter(
              (r) =>
                (type === ALL || r.type === type) &&
                (status === ALL || r.status === status) &&
                (due === ALL || dueState(r) === due) &&
                matchesSearch(term, r.family.name, r.student?.displayName, r.reference),
            )}
            rowKey={(r) => r.id}
            empty={<EmptyState title="No requests match these filters" />}
            columns={[
              {
                key: 'request',
                header: 'Request',
                sortValue: (r) => r.family.name.toLowerCase(),
                render: (r) => (
                  <span className="block min-w-0">
                    <span className="font-semibold text-ink">
                      {typeLabel(r.type)} · {r.family.name}
                    </span>
                    {r.student && <span className="font-normal text-muted"> · {r.student.displayName}</span>}
                    {r.rejectionReason && <span className="block text-xs text-ink-2 mt-1">Refused: {r.rejectionReason}</span>}
                  </span>
                ),
              },
              { key: 'ref', header: 'Ref', render: (r) => r.reference },
              { key: 'requested', header: 'Requested', sortValue: (r) => r.requestedAt, render: (r) => formatDate(r.requestedAt) },
              {
                key: 'due',
                header: 'Due',
                sortValue: (r) => r.dueAt,
                render: (r) => (
                  <span>
                    {formatDate(r.dueAt)}
                    {r.completedAt && <span className="block text-[11px] text-muted">completed {formatDate(r.completedAt)}</span>}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                className: 'text-right',
                sortValue: (r) => r.status,
                render: (r) => <DataRequestActions request={r} onReject={() => setRejecting(r)} />,
              },
            ]}
          />
        )}
      </QueryState>
      {rejecting && <RejectModal key={rejecting.id} request={rejecting} onClose={() => setRejecting(null)} />}
    </>
  );
}

const typeLabel = (type: string) => (type === 'DELETE' ? 'Deletion' : 'Export');

const isOpen = (r: AdminDataRequest) => r.status === 'REQUESTED' || r.status === 'IN_PROGRESS';

/** Where an open request stands against its 30-day deadline; closed ones have none. */
function dueState(r: AdminDataRequest): string {
  if (!isOpen(r)) return 'closed';
  if (r.overdue) return 'overdue';
  return daysUntilDue(r.dueAt) <= 7 ? 'soon' : 'later';
}

const DUE_OPTIONS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'soon', label: 'Due within 7 days' },
  { value: 'later', label: 'Due later' },
  { value: 'closed', label: 'Answered' },
];

function DataRequestActions({ request: r, onReject }: { request: AdminDataRequest; onReject: () => void }) {
  const open = isOpen(r);
  const days = daysUntilDue(r.dueAt);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {open && r.overdue && <Badge tone="red">Overdue</Badge>}
      {open && !r.overdue && days <= 7 && <Badge tone="amber">Due in {days} day{days === 1 ? '' : 's'}</Badge>}
      <StatusBadge status={r.status} />
      {open && (
        <UiButton size="sm" variant="secondary" onClick={onReject}>
          Refuse…
        </UiButton>
      )}
    </span>
  );
}

function RejectModal({ request, onClose }: { request: AdminDataRequest; onClose: () => void }) {
  const toast = useToast();
  const reject = useRejectDataRequest();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const problem = validateRejectionReason(reason);
    setError(problem);
    if (problem) return;
    reject.mutate(
      { id: request.id, reason },
      {
        onSuccess: () => {
          toast.success(`Request ${request.reference} refused. The family has been told why.`);
          onClose();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Refuse ${request.type === 'DELETE' ? 'deletion' : 'export'} ${request.reference}?`}
      footer={
        <>
          <UiButton variant="secondary" onClick={onClose} disabled={reject.isPending}>
            Cancel
          </UiButton>
          <UiButton variant="danger" onClick={submit} loading={reject.isPending}>
            Refuse request
          </UiButton>
        </>
      }
    >
      <div className="space-y-3">
        <Alert tone="warning">
          Only refuse when the law allows it: the request isn’t from the account holder, it repeats one already answered, or
          the records must be kept (an open safeguarding case, or invoices held for tax). The family is emailed the reason.
        </Alert>
        <Field label="Reason for the family" htmlFor="dr-reason" required error={error ?? undefined}>
          <TextArea id="dr-reason" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
