'use client';

import React, { useState } from 'react';
import { CheckCircle2, Plus } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Column,
  DataTable,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  QueryState,
  Select,
  StatusBadge,
  Tabs,
  TextArea,
  TextInput,
  UiButton,
  formatDate,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import {
  useCompleteCrmTask,
  useCreateCrmTask,
  useCrmLeads,
  useCrmPipeline,
  useCrmTasks,
  useUpdateLeadStatus,
} from '@/hooks/useCrm';
import {
  LEAD_STATUSES,
  LeadFilters,
  LeadListItem,
  LeadStatus,
  TASK_STATUSES,
  TASK_TYPES,
  TaskFilters,
  TaskListItem,
  TaskStatus,
  TaskType,
  formatRate,
  isUuid,
  nextLeadStatuses,
} from '@/lib/api/modules/crm';
import { CreateLeadForm } from './CreateLeadForm';
import { toLocalInputValue } from '../shared/AdminUi';

type View = 'board' | 'list' | 'tasks';

/** `/admin/crm` — pipeline board, filterable lead list and follow-up tasks. */
export function CrmWorkspace() {
  const [view, setView] = useState<View>('board');
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<LeadListItem | null>(null);
  const [taskForLead, setTaskForLead] = useState<LeadListItem | null | undefined>(undefined);

  return (
    <>
      <PageHeader
        eyebrow="Academy admin"
        title="CRM"
        description="Enquiries from first contact to enrolment. Closed leads (won or lost) are immutable."
        actions={
          <>
            <UiButton variant="secondary" onClick={() => setTaskForLead(null)} icon={<Plus className="w-4 h-4" />}>
              New task
            </UiButton>
            <UiButton onClick={() => setCreating(true)} icon={<Plus className="w-4 h-4" />}>
              New lead
            </UiButton>
          </>
        }
      />
      <PipelineStrip />
      <Tabs
        className="mb-4"
        value={view}
        onChange={setView}
        tabs={[
          { value: 'board', label: 'Board' },
          { value: 'list', label: 'Leads' },
          { value: 'tasks', label: 'Tasks' },
        ]}
      />
      {view === 'board' && <LeadBoard onMove={setMoving} onAddTask={setTaskForLead} />}
      {view === 'list' && <LeadList onMove={setMoving} onAddTask={setTaskForLead} />}
      {view === 'tasks' && <TasksPanel />}

      <Modal open={creating} onClose={() => setCreating(false)} title="New lead" description="The first follow-up task is created automatically, due in 24 hours.">
        <CreateLeadForm onCreated={() => setCreating(false)} onCancel={() => setCreating(false)} />
      </Modal>
      {moving && <MoveLeadDialog key={moving.id} lead={moving} onClose={() => setMoving(null)} />}
      {taskForLead !== undefined && (
        <CreateTaskDialog key={taskForLead?.id ?? 'none'} lead={taskForLead} onClose={() => setTaskForLead(undefined)} />
      )}
    </>
  );
}

function PipelineStrip() {
  const pipeline = useCrmPipeline();
  return (
    <div className="mb-5">
      <QueryState query={pipeline} loadingLabel="Loading pipeline…">
        {(p) => (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4">
              <p className="text-xs text-muted">Leads</p>
              <p className="text-2xl font-semibold text-ink tabular-nums">{p.total}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted">Trial → won</p>
              <p className="text-2xl font-semibold text-ink tabular-nums">{formatRate(p.trialToWonRate)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted">Booked → attended</p>
              <p className="text-2xl font-semibold text-ink tabular-nums">{formatRate(p.bookingToDoneRate)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted">Open / overdue tasks</p>
              <p className="text-2xl font-semibold tabular-nums">
                <span className="text-ink">{p.openTasks}</span>
                <span className="text-muted"> / </span>
                <span className={p.overdueTasks > 0 ? 'text-red' : 'text-ink'}>{p.overdueTasks}</span>
              </p>
            </Card>
          </div>
        )}
      </QueryState>
    </div>
  );
}

const BOARD_LIMIT = 100;

function LeadBoard({ onMove, onAddTask }: { onMove: (l: LeadListItem) => void; onAddTask: (l: LeadListItem) => void }) {
  const pipeline = useCrmPipeline();
  const leads = useCrmLeads({ page: 1, limit: BOARD_LIMIT });
  return (
    <QueryState query={leads} isEmpty={(d) => d.items.length === 0} empty={<Card><EmptyState title="No leads yet" description="Create the first lead to start the pipeline." /></Card>}>
      {(data) => (
        <>
          {data.total > data.items.length && (
            <p className="text-xs text-muted mb-2">Showing the {data.items.length} most recent of {data.total} leads. Use the Leads tab to filter.</p>
          )}
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x" role="list" aria-label="Pipeline stages">
            {LEAD_STATUSES.map((status) => {
              const column = data.items.filter((l) => l.status === status);
              const count = pipeline.data?.counts.find((c) => c.status === status)?.count;
              return (
                <section
                  key={status}
                  role="listitem"
                  aria-label={`${humanize(status)} leads`}
                  className="snap-start shrink-0 w-[260px] rounded-2xl bg-sand/60 border border-line p-3"
                >
                  <header className="flex items-center justify-between mb-2">
                    <StatusBadge status={status} />
                    <span className="text-xs font-semibold text-ink-2 tabular-nums">{count ?? column.length}</span>
                  </header>
                  {column.length === 0 ? (
                    <p className="text-[11px] text-muted py-4 text-center">No leads</p>
                  ) : (
                    <ul className="space-y-2">
                      {column.map((lead) => (
                        <li key={lead.id}>
                          <LeadCard lead={lead} onMove={onMove} onAddTask={onAddTask} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </QueryState>
  );
}

function LeadCard({ lead, onMove, onAddTask }: { lead: LeadListItem; onMove: (l: LeadListItem) => void; onAddTask: (l: LeadListItem) => void }) {
  const closed = nextLeadStatuses(lead.status).length === 0;
  return (
    <Card className="p-3 shadow-none">
      <p className="text-sm font-semibold text-ink truncate">{lead.contactName}</p>
      <p className="text-[11px] text-muted truncate">
        {[lead.email, lead.phone].filter(Boolean).join(' · ') || 'No contact details'}
      </p>
      <p className="text-[11px] text-muted mt-1">
        {[lead.courseInterest, lead.childAge ? `age ${lead.childAge}` : null, lead.country, lead.source].filter(Boolean).join(' · ')}
      </p>
      {lead.lostReason && <p className="text-[11px] text-red mt-1">Lost: {lead.lostReason}</p>}
      {lead.tasks.length > 0 && (
        <p className="text-[11px] text-ink-2 mt-1">
          {lead.tasks.length} open task{lead.tasks.length > 1 ? 's' : ''} · next {formatDate(lead.tasks[0].dueAt)}
        </p>
      )}
      <div className="flex gap-1.5 mt-2">
        {!closed && (
          <UiButton size="sm" variant="secondary" onClick={() => onMove(lead)}>
            Move
          </UiButton>
        )}
        {!closed && (
          <UiButton size="sm" variant="ghost" onClick={() => onAddTask(lead)}>
            Add task
          </UiButton>
        )}
      </div>
    </Card>
  );
}

function LeadList({ onMove, onAddTask }: { onMove: (l: LeadListItem) => void; onAddTask: (l: LeadListItem) => void }) {
  const { userId } = useAdminRoles();
  const [filters, setFilters] = useState<LeadFilters>({ page: 1, limit: 25 });
  const [searchDraft, setSearchDraft] = useState('');
  const [sourceDraft, setSourceDraft] = useState('');
  const leads = useCrmLeads(filters);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((f) => ({ ...f, page: 1, search: searchDraft.trim() || undefined, source: sourceDraft.trim() || undefined }));
  };

  const columns: Column<LeadListItem>[] = [
    {
      key: 'contact',
      header: 'Contact',
      render: (l) => (
        <div className="min-w-[160px]">
          <p className="font-semibold text-ink">{l.contactName}</p>
          <p className="text-[11px] text-muted">{[l.email, l.phone].filter(Boolean).join(' · ') || '—'}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Stage', render: (l) => <StatusBadge status={l.status} /> },
    { key: 'interest', header: 'Interest', render: (l) => [l.courseInterest, l.childAge ? `age ${l.childAge}` : null].filter(Boolean).join(' · ') || '—' },
    { key: 'source', header: 'Source', render: (l) => l.source ?? '—' },
    { key: 'owner', header: 'Owner', render: (l) => l.owner?.name ?? '—' },
    { key: 'tasks', header: 'Open tasks', render: (l) => l.tasks.length },
    { key: 'created', header: 'Created', render: (l) => formatDate(l.createdAt) },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      render: (l) =>
        nextLeadStatuses(l.status).length === 0 ? (
          <span className="text-[11px] text-muted">Closed</span>
        ) : (
          <div className="flex gap-1.5">
            <UiButton size="sm" variant="secondary" onClick={() => onMove(l)}>
              Move
            </UiButton>
            <UiButton size="sm" variant="ghost" onClick={() => onAddTask(l)}>
              Task
            </UiButton>
          </div>
        ),
    },
  ];

  return (
    <Card>
      <CardBody className="pt-5 space-y-4">
        <form onSubmit={apply} className="grid sm:grid-cols-2 lg:grid-cols-[1fr_180px_160px_auto_auto] gap-3 items-end">
          <Field label="Search" htmlFor="lead-search">
            <TextInput id="lead-search" type="search" maxLength={160} value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Name, email or phone" />
          </Field>
          <Field label="Stage" htmlFor="lead-status-filter">
            <Select
              id="lead-status-filter"
              value={filters.status ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, page: 1, status: (e.target.value || undefined) as LeadStatus | undefined }))}
            >
              <option value="">All stages</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Source" htmlFor="lead-source-filter">
            <TextInput id="lead-source-filter" maxLength={60} value={sourceDraft} onChange={(e) => setSourceDraft(e.target.value)} placeholder="Exact source" />
          </Field>
          <div className="pb-2">
            <Checkbox
              id="lead-mine"
              label="Mine only"
              checked={Boolean(filters.ownerId)}
              disabled={!userId}
              onChange={(on) => setFilters((f) => ({ ...f, page: 1, ownerId: on && userId ? userId : undefined }))}
            />
          </div>
          <UiButton type="submit" variant="secondary">
            Apply
          </UiButton>
        </form>
        <QueryState query={leads} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No leads match these filters" />}>
          {(data) => (
            <>
              <DataTable columns={columns} rows={data.items} rowKey={(l) => l.id} />
              <Pager page={data.page} limit={data.limit} total={data.total} onPage={(page) => setFilters((f) => ({ ...f, page }))} />
            </>
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}

function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between pt-2">
      <UiButton size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </UiButton>
      <span className="text-xs text-muted">
        Page {page} of {pages} · {total} total
      </span>
      <UiButton size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </UiButton>
    </nav>
  );
}

/** Move a lead to another stage; LOST requires a reason (backend rule). */
export function MoveLeadDialog({ lead, onClose }: { lead: LeadListItem; onClose: () => void }) {
  const update = useUpdateLeadStatus();
  const toast = useToast();
  const options = nextLeadStatuses(lead.status);
  const [status, setStatus] = useState<LeadStatus | ''>('');
  const [lostReason, setLostReason] = useState('');
  const [familyId, setFamilyId] = useState(lead.familyId ?? '');
  const [invalid, setInvalid] = useState<{ field: 'status' | 'lostReason' | 'familyId'; message: string } | null>(null);
  const fail = (field: 'status' | 'lostReason' | 'familyId', message: string) => {
    setInvalid({ field, message });
    toast.error(message);
  };
  const fieldError = (field: 'status' | 'lostReason' | 'familyId') => (invalid?.field === field ? invalid.message : null);

  const closing = status === 'WON' || status === 'LOST';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!status) return fail('status', 'Choose a stage.');
    if (status === 'LOST' && !lostReason.trim()) return fail('lostReason', 'A lost lead needs a reason.');
    if (lostReason.length > 2000) return fail('lostReason', 'Reason is limited to 2000 characters.');
    if (familyId.trim() && !isUuid(familyId)) return fail('familyId', 'Family id must be a valid id.');
    setInvalid(null);
    update.mutate(
      {
        leadId: lead.id,
        status,
        lostReason: status === 'LOST' ? lostReason.trim() : undefined,
        familyId: familyId.trim() && familyId.trim() !== lead.familyId ? familyId.trim() : undefined,
      },
      {
        onSuccess: (res) => {
          toast.success(`${lead.contactName} moved to ${humanize(res.status).toLowerCase()}`);
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
      title={`Move ${lead.contactName}`}
      description={`Currently ${humanize(lead.status).toLowerCase()}.`}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="New stage" htmlFor="move-status" required error={fieldError('status')}>
          <Select id="move-status" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus | '')}>
            <option value="">Choose…</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </Field>
        {status === 'LOST' && (
          <Field label="Why was it lost?" htmlFor="move-lost" required error={fieldError('lostReason')}>
            <TextArea id="move-lost" value={lostReason} maxLength={2000} onChange={(e) => setLostReason(e.target.value)} />
          </Field>
        )}
        <Field label="Converted family id" htmlFor="move-family" error={fieldError('familyId')} hint="Optional — link the family this lead became.">
          <TextInput id="move-family" value={familyId} onChange={(e) => setFamilyId(e.target.value)} autoComplete="off" />
        </Field>
        {closing && (
          <p className="text-xs text-amber" role="note">
            Closing a lead is final: its stage can no longer change and its open tasks are cancelled.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <UiButton variant="secondary" onClick={onClose} disabled={update.isPending}>
            Cancel
          </UiButton>
          <UiButton type="submit" variant={status === 'LOST' ? 'danger' : 'primary'} loading={update.isPending}>
            {closing ? `Close as ${humanize(status).toLowerCase()}` : 'Move lead'}
          </UiButton>
        </div>
      </form>
    </Modal>
  );
}

function TasksPanel() {
  const [filters, setFilters] = useState<TaskFilters>({ page: 1, limit: 25, status: 'OPEN' });
  const tasks = useCrmTasks(filters);
  const complete = useCompleteCrmTask();
  const toast = useToast();
  const [completingId, setCompletingId] = useState<string | null>(null);
  // Overdue is judged against when the list was fetched (pure during render).
  const now = tasks.dataUpdatedAt;

  const markDone = (task: TaskListItem) => {
    setCompletingId(task.id);
    complete.mutate(task.id, {
      onSuccess: () => toast.success('Task marked done'),
      onError: (err) => toast.error(err),
      onSettled: () => setCompletingId(null),
    });
  };

  return (
    <Card>
      <CardHeader title="Follow-up tasks" description="Overdue first, then by due date." />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Status" htmlFor="task-status-filter" className="w-44">
            <Select
              id="task-status-filter"
              value={filters.status ?? 'OPEN'}
              onChange={(e) => setFilters((f) => ({ ...f, page: 1, status: e.target.value as TaskStatus }))}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="pb-2">
            <Checkbox
              id="task-overdue"
              label="Overdue only"
              checked={Boolean(filters.overdueOnly)}
              onChange={(on) => setFilters((f) => ({ ...f, page: 1, overdueOnly: on || undefined }))}
            />
          </div>
        </div>
        <QueryState query={tasks} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No tasks here" icon={<CheckCircle2 className="w-5 h-5" />} />}>
          {(data) => (
            <>
              <ul className="divide-y divide-line">
                {data.items.map((t) => {
                  const overdue = t.status === 'OPEN' && new Date(t.dueAt).getTime() < now;
                  return (
                    <li key={t.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {humanize(t.type)}
                          {t.lead && <span className="text-ink-2 font-normal"> · {t.lead.contactName}</span>}
                        </p>
                        {t.note && <p className="text-xs text-muted mt-0.5">{t.note}</p>}
                        <p className={overdue ? 'text-[11px] text-red mt-1' : 'text-[11px] text-muted mt-1'}>
                          Due {formatDateTime(t.dueAt)}
                          {overdue && ' · overdue'}
                          {t.assignee && ` · ${t.assignee.name}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.lead && <StatusBadge status={t.lead.status} />}
                        {t.status === 'OPEN' ? (
                          <UiButton
                            size="sm"
                            variant="secondary"
                            loading={completingId === t.id}
                            disabled={completingId !== null && completingId !== t.id}
                            onClick={() => markDone(t)}
                            aria-label={`Mark ${humanize(t.type)} task done`}
                          >
                            Mark done
                          </UiButton>
                        ) : (
                          <Badge tone={t.status === 'DONE' ? 'green' : 'neutral'}>{humanize(t.status)}</Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Pager page={data.page} limit={data.limit} total={data.total} onPage={(page) => setFilters((f) => ({ ...f, page }))} />
            </>
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}

/** Create a follow-up task (`createTaskBody`), optionally for a lead and assigned to me. */
export function CreateTaskDialog({ lead, onClose }: { lead: LeadListItem | null; onClose: () => void }) {
  const { userId } = useAdminRoles();
  const create = useCreateCrmTask();
  const toast = useToast();
  const [type, setType] = useState<TaskType>('OTHER');
  const [dueAt, setDueAt] = useState(() => toLocalInputValue(new Date(Date.now() + 24 * 3600 * 1000)));
  const [note, setNote] = useState('');
  const [assignToMe, setAssignToMe] = useState(true);
  const [invalid, setInvalid] = useState<{ field: 'dueAt' | 'note'; message: string } | null>(null);
  const fail = (field: 'dueAt' | 'note', message: string) => {
    setInvalid({ field, message });
    toast.error(message);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const due = new Date(dueAt);
    if (!dueAt || Number.isNaN(due.getTime())) return fail('dueAt', 'Choose a due date and time.');
    if (note.length > 2000) return fail('note', 'Note is limited to 2000 characters.');
    setInvalid(null);
    create.mutate(
      {
        leadId: lead?.id,
        type,
        dueAt: due.toISOString(),
        note: note.trim() || undefined,
        assigneeId: assignToMe && userId ? userId : undefined,
      },
      {
        onSuccess: () => {
          toast.success('Task created');
          onClose();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title="New follow-up task" description={lead ? `For ${lead.contactName}` : 'Not linked to a lead.'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Type" htmlFor="task-type" required>
          <Select id="task-type" value={type} onChange={(e) => setType(e.target.value as TaskType)}>
            {TASK_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due" htmlFor="task-due" required error={invalid?.field === 'dueAt' ? invalid.message : null}>
          <TextInput id="task-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="task-note" error={invalid?.field === 'note' ? invalid.message : null}>
          <TextArea id="task-note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Checkbox id="task-assign-me" label="Assign to me" checked={assignToMe} disabled={!userId} onChange={setAssignToMe} />
        <div className="flex justify-end gap-2">
          <UiButton variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </UiButton>
          <UiButton type="submit" loading={create.isPending}>
            Create task
          </UiButton>
        </div>
      </form>
    </Modal>
  );
}
