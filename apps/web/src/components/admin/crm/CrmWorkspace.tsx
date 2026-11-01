'use client';

import React, { useState } from 'react';
import {
  AlarmClock,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ListPlus,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';
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
  Pagination,
  QueryState,
  Select,
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
  useLeadsByArea,
  useUpdateLeadStatus,
} from '@/hooks/useCrm';
import {
  LEAD_SOURCES,
  LEAD_STAGE_LABEL,
  LEAD_STATUSES,
  LeadFilters,
  LeadListItem,
  LeadStatus,
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
import { CountrySelect } from '@/components/ui/CountrySelect';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { useDebounced } from '@/hooks/useDebounced';
import { useAdminSearch } from '@/hooks/useAdminConsole';
import type { FamilySearchHit } from '@/lib/api/modules/admin-console';
import { cn } from '@/lib/utils';
import { toLocalInputValue } from '../shared/AdminUi';

type View = 'board' | 'list' | 'tasks' | 'areas';

/** How each pipeline stage is named and coloured everywhere in the CRM. */
const STAGE: Record<LeadStatus, { label: string; hint: string; dot: string; bar: string; soft: string }> = {
  NEW: { label: LEAD_STAGE_LABEL.NEW, hint: 'Not contacted about a trial yet', dot: 'bg-gold', bar: 'bg-gold', soft: 'bg-gold/10' },
  TRIAL_BOOKED: { label: LEAD_STAGE_LABEL.TRIAL_BOOKED, hint: 'Evaluation class is scheduled', dot: 'bg-amber-500', bar: 'bg-amber-500', soft: 'bg-amber-50' },
  TRIAL_DONE: { label: LEAD_STAGE_LABEL.TRIAL_DONE, hint: 'Waiting for the family to decide', dot: 'bg-sky-500', bar: 'bg-sky-500', soft: 'bg-sky-50' },
  WON: { label: LEAD_STAGE_LABEL.WON, hint: 'Became a paying family', dot: 'bg-green-700', bar: 'bg-green-700', soft: 'bg-green-50' },
  LOST: { label: LEAD_STAGE_LABEL.LOST, hint: 'Closed without enrolling', dot: 'bg-red', bar: 'bg-red/70', soft: 'bg-red/5' },
};

const TASK_LABEL: Record<TaskType, string> = {
  NO_SHOW_FOLLOWUP: 'Missed trial — call the family',
  TRIAL_NOT_CONVERTED: 'Trial not converted — follow up',
  OTHER: 'Follow-up',
};

/** A task's title: the specific follow-ups have fixed names; a general one shows its note. */
const taskTitle = (t: { type: TaskType; note: string | null }) => (t.type === 'OTHER' && t.note ? t.note : TASK_LABEL[t.type] ?? humanize(t.type));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const sourceLabel = (value: string) => LEAD_SOURCES.find((x) => x.value === value)?.label ?? humanize(value);

function StageDot({ status, withLabel = true }: { status: LeadStatus; withLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-ink-2">
      <span className={cn('h-2 w-2 rounded-full', STAGE[status].dot)} aria-hidden />
      {withLabel && STAGE[status].label}
    </span>
  );
}

function Initial({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-50 text-xs font-semibold text-green-800 ring-1 ring-green-800/10', className)}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/** "Overdue 2 days", "Due today", "Due in 3 days" — relative to `now`. */
function dueLabel(dueAt: string, now: number): { text: string; overdue: boolean; today: boolean } {
  const day = 86_400_000;
  const start = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const diff = Math.round((start(new Date(dueAt).getTime()) - start(now)) / day);
  if (new Date(dueAt).getTime() < now && diff < 0) return { text: `Overdue ${-diff} day${diff === -1 ? '' : 's'}`, overdue: true, today: false };
  if (diff <= 0) return { text: new Date(dueAt).getTime() < now ? 'Overdue today' : 'Due today', overdue: new Date(dueAt).getTime() < now, today: true };
  if (diff === 1) return { text: 'Due tomorrow', overdue: false, today: false };
  return { text: `Due in ${diff} days`, overdue: false, today: false };
}

function ContactLinks({ email, phone }: { email: string | null; phone: string | null }) {
  if (!email && !phone) return <span className="text-[11px] text-muted">No contact details</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
      {phone && (
        <a href={`tel:${phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-ink-2 hover:text-green-800">
          <Phone className="h-3 w-3" aria-hidden /> {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} onClick={(e) => e.stopPropagation()} className="inline-flex min-w-0 items-center gap-1 text-ink-2 hover:text-green-800">
          <Mail className="h-3 w-3 shrink-0" aria-hidden /> <span className="truncate">{email}</span>
        </a>
      )}
    </span>
  );
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

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
        description="Every enquiry from first contact to enrolment. Move a lead along the stages as you talk to the family; enrolled and lost leads are closed."
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
          { value: 'board', label: 'Pipeline board' },
          { value: 'list', label: 'All leads' },
          { value: 'tasks', label: 'Follow-up tasks' },
          { value: 'areas', label: 'Leads by area' },
        ]}
      />
      {view === 'board' && <LeadBoard onMove={setMoving} onAddTask={setTaskForLead} />}
      {view === 'list' && <LeadList onMove={setMoving} onAddTask={setTaskForLead} />}
      {view === 'tasks' && <TasksPanel />}
      {view === 'areas' && <LeadsByArea />}

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

/** Lead counts per country and region, for deciding where to market (M-GEO-01). */
function LeadsByArea() {
  const [country, setCountry] = useState('');
  const query = useLeadsByArea(country);
  const total = (query.data ?? []).reduce((sum, r) => sum + r.count, 0);

  return (
    <Card>
      <CardHeader
        title="Leads by area"
        description="Grouped by the country and region recorded on each lead. Add a region when you create a lead to see it here."
        action={
          <div className="w-56">
            <label htmlFor="area-country" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
              Country
            </label>
            <CountrySelect id="area-country" value={country} placeholder="All countries" onChange={setCountry} />
          </div>
        }
      />
      <CardBody className="px-0 sm:px-5">
        <QueryState query={query} loadingLabel="Loading areas…" empty={<EmptyState title="No leads in this area yet" />}>
          {(rows) => (
            <DataTable
              rows={rows}
              rowKey={(r) => `${r.country ?? '-'}:${r.region ?? '-'}`}
              columns={[
                {
                  key: 'country',
                  header: 'Country',
                  render: (r) => (r.country ? countryName(r.country) : <span className="text-muted">Not recorded</span>),
                },
                { key: 'region', header: 'Region', render: (r) => r.region ?? <span className="text-muted">Not recorded</span> },
                {
                  key: 'count',
                  header: 'Leads',
                  className: 'text-right tabular-nums',
                  render: (r) => (
                    <span className="inline-flex items-center gap-2 justify-end">
                      <span className="hidden sm:block h-1.5 rounded-full bg-gold" style={{ width: `${Math.max(4, (r.count / Math.max(1, total)) * 120)}px` }} aria-hidden />
                      {r.count}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}

function PipelineStrip() {
  const pipeline = useCrmPipeline();
  return (
    <div className="mb-5">
      <QueryState query={pipeline} loadingLabel="Loading pipeline…">
        {(p) => {
          const countOf = (st: LeadStatus) => p.counts.find((c) => c.status === st)?.count ?? 0;
          const kpis = [
            { icon: <Users className="h-4 w-4" />, label: 'All leads', value: String(p.total), note: plural(countOf('NEW'), 'new enquiry', 'new enquiries') },
            { icon: <TrendingUp className="h-4 w-4" />, label: 'Trial → enrolled', value: formatRate(p.trialToWonRate), note: p.won === 1 ? '1 family enrolled' : `${p.won} families enrolled` },
            { icon: <CalendarCheck className="h-4 w-4" />, label: 'Trials attended', value: formatRate(p.bookingToDoneRate), note: 'of trials booked' },
            {
              icon: <AlarmClock className="h-4 w-4" />,
              label: 'Follow-ups',
              value: String(p.openTasks),
              note: p.overdueTasks > 0 ? `${p.overdueTasks} overdue` : 'None overdue',
              alert: p.overdueTasks > 0,
            },
          ];
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {kpis.map((k) => (
                  <Card key={k.label} className="flex items-start gap-3 p-4">
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', k.alert ? 'bg-red/10 text-red' : 'bg-green-50 text-green-800')} aria-hidden>
                      {k.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs text-muted">{k.label}</span>
                      <span className="block text-2xl font-semibold leading-tight text-ink tabular-nums">{k.value}</span>
                      <span className={cn('block text-[11px]', k.alert ? 'font-medium text-red' : 'text-muted')}>{k.note}</span>
                    </span>
                  </Card>
                ))}
              </div>
              {p.total > 0 && (
                <Card className="p-4">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-ink">Where leads are now</span>
                    <span className="text-muted">{plural(p.total, 'lead')}</span>
                  </div>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-sand" aria-hidden>
                    {LEAD_STATUSES.map((st) => (
                      <span key={st} className={STAGE[st].bar} style={{ width: `${(countOf(st) / p.total) * 100}%` }} />
                    ))}
                  </div>
                  <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
                    {LEAD_STATUSES.map((st) => (
                      <li key={st} className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                        <StageDot status={st} />
                        <span className="font-semibold text-ink tabular-nums">{countOf(st)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}

const BOARD_LIMIT = 100;

function LeadBoard({ onMove, onAddTask }: { onMove: (l: LeadListItem) => void; onAddTask: (l: LeadListItem) => void }) {
  const pipeline = useCrmPipeline();
  const leads = useCrmLeads({ page: 1, limit: BOARD_LIMIT });
  const now = leads.dataUpdatedAt;
  return (
    <QueryState
      query={leads}
      isEmpty={(d) => d.items.length === 0}
      empty={
        <Card>
          <EmptyState title="No leads yet" description="Press “New lead” to add the first enquiry." />
        </Card>
      }
    >
      {(data) => (
        <>
          {data.total > data.items.length && (
            <p className="mb-2 text-xs text-muted">
              Showing the {data.items.length} most recent of {data.total} leads. Use the Leads tab to search and filter.
            </p>
          )}
          <div className="grid auto-cols-[minmax(260px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-3" role="list" aria-label="Pipeline stages">
            {LEAD_STATUSES.map((status) => {
              const column = data.items.filter((l) => l.status === status);
              const count = pipeline.data?.counts.find((c) => c.status === status)?.count ?? column.length;
              return (
                <section
                  key={status}
                  role="listitem"
                  aria-label={`${STAGE[status].label} leads`}
                  className="flex min-h-[220px] flex-col rounded-2xl border border-line bg-sand/40"
                >
                  <header className={cn('rounded-t-2xl border-b border-line px-3 py-2.5', STAGE[status].soft)}>
                    <div className="flex items-center justify-between gap-2">
                      <StageDot status={status} />
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink tabular-nums ring-1 ring-line">{count}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">{STAGE[status].hint}</p>
                  </header>
                  <div className="flex-1 space-y-2 overflow-y-auto p-2.5 lg:max-h-[620px]">
                    {column.length === 0 ? (
                      <p className="py-8 text-center text-[11px] text-muted">Nothing here</p>
                    ) : (
                      column.map((lead) => <LeadCard key={lead.id} lead={lead} now={now} onMove={onMove} onAddTask={onAddTask} />)
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </QueryState>
  );
}

function LeadCard({
  lead,
  now,
  onMove,
  onAddTask,
}: {
  lead: LeadListItem;
  now: number;
  onMove: (l: LeadListItem) => void;
  onAddTask: (l: LeadListItem) => void;
}) {
  const closed = nextLeadStatuses(lead.status).length === 0;
  const place = [lead.city, lead.country ? countryName(lead.country) : null].filter(Boolean).join(', ');
  const nextTask = lead.tasks[0];
  const due = nextTask ? dueLabel(nextTask.dueAt, now) : null;
  return (
    <article className="rounded-xl border border-line bg-white p-3 shadow-sm transition hover:border-gold/60 hover:shadow">
      <div className="flex items-start gap-2.5">
        <Initial name={lead.contactName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{lead.contactName}</p>
          <ContactLinks email={lead.email} phone={lead.phone} />
        </div>
      </div>
      {(lead.courseInterest || lead.childAge || place) && (
        <dl className="mt-2.5 space-y-1 text-[11px] text-ink-2">
          {(lead.courseInterest || lead.childAge) && (
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-3 w-3 text-muted" aria-hidden />
              <dt className="sr-only">Interest</dt>
              <dd className="truncate">{[lead.courseInterest ? humanize(lead.courseInterest) : null, lead.childAge ? `child aged ${lead.childAge}` : null].filter(Boolean).join(' · ')}</dd>
            </div>
          )}
          {place && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 text-muted" aria-hidden />
              <dt className="sr-only">Location</dt>
              <dd className="truncate">{place}</dd>
            </div>
          )}
        </dl>
      )}
      {lead.lostReason && <p className="mt-2 rounded-lg bg-red/5 px-2 py-1 text-[11px] text-red">Lost: {lead.lostReason}</p>}
      {nextTask && due && (
        <p
          className={cn(
            'mt-2 flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-[11px] leading-snug',
            due.overdue ? 'bg-red/5 font-medium text-red' : due.today ? 'bg-amber-50 text-amber-800' : 'bg-sand/60 text-ink-2',
          )}
        >
          <AlarmClock className="mt-px h-3 w-3 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block">{taskTitle(nextTask)}</span>
            <span className="block font-medium">{due.text}</span>
            {lead.tasks.length > 1 && <span className="block text-muted">+{lead.tasks.length - 1} more</span>}
          </span>
        </p>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2">
        <span className="truncate text-[10px] text-muted">
          {lead.source ? `${sourceLabel(lead.source)} · ` : ''}
          {formatDate(lead.createdAt)}
        </span>
        {!closed && (
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => onAddTask(lead)}
              className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-ink-2 hover:bg-sand"
              aria-label={`Add a task for ${lead.contactName}`}
            >
              <ListPlus className="h-3.5 w-3.5" aria-hidden /> Task
            </button>
            <button
              type="button"
              onClick={() => onMove(lead)}
              className="inline-flex h-7 items-center gap-1 rounded-lg bg-green-800 px-2 text-[11px] font-semibold text-white hover:bg-green-900"
              aria-label={`Move ${lead.contactName} to another stage`}
            >
              Move <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        )}
      </div>
    </article>
  );
}

function LeadList({ onMove, onAddTask }: { onMove: (l: LeadListItem) => void; onAddTask: (l: LeadListItem) => void }) {
  const { userId } = useAdminRoles();
  const [filters, setFilters] = useState<LeadFilters>({ page: 1, limit: 25 });
  const [searchDraft, setSearchDraft] = useState('');
  const search = useDebounced(searchDraft.trim());
  const leads = useCrmLeads({ ...filters, search: search || undefined });

  const now = leads.dataUpdatedAt;
  const columns: Column<LeadListItem>[] = [
    {
      key: 'contact',
      header: 'Contact',
      sortValue: (l) => l.contactName.toLowerCase(),
      render: (l) => (
        <div className="flex min-w-[200px] items-start gap-2.5">
          <Initial name={l.contactName} />
          <div className="min-w-0">
            <p className="font-semibold text-ink">{l.contactName}</p>
            <ContactLinks email={l.email} phone={l.phone} />
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Stage', sortValue: (l) => LEAD_STATUSES.indexOf(l.status), render: (l) => <StageDot status={l.status} /> },
    {
      key: 'interest',
      header: 'Interest',
      render: (l) => [l.courseInterest ? humanize(l.courseInterest) : null, l.childAge ? `age ${l.childAge}` : null].filter(Boolean).join(' · ') || '—',
    },
    {
      key: 'location',
      header: 'Location',
      render: (l) => [l.city, l.region, l.country ? countryName(l.country) : null].filter(Boolean).join(', ') || '—',
    },
    { key: 'source', header: 'Source', render: (l) => (l.source ? sourceLabel(l.source) : '—') },
    {
      key: 'next',
      header: 'Next follow-up',
      sortValue: (l) => l.tasks[0]?.dueAt ?? '9999',
      render: (l) => {
        const t = l.tasks[0];
        if (!t) return <span className="text-muted">—</span>;
        const due = dueLabel(t.dueAt, now);
        return <span className={cn('whitespace-nowrap text-xs', due.overdue ? 'font-medium text-red' : due.today ? 'text-amber-800' : 'text-ink-2')}>{due.text}</span>;
      },
    },
    { key: 'owner', header: 'Owner', render: (l) => l.owner?.name ?? <span className="text-muted">Unassigned</span> },
    { key: 'created', header: 'Added', render: (l) => formatDate(l.createdAt), sortValue: (l) => l.createdAt },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      sortable: false,
      className: 'text-right',
      render: (l) =>
        nextLeadStatuses(l.status).length === 0 ? (
          <span className="text-[11px] text-muted">Closed</span>
        ) : (
          <div className="flex justify-end gap-1.5">
            <UiButton size="sm" variant="ghost" onClick={() => onAddTask(l)}>
              Add task
            </UiButton>
            <UiButton size="sm" variant="secondary" onClick={() => onMove(l)}>
              Move stage
            </UiButton>
          </div>
        ),
    },
  ];

  return (
    <Card>
      <CardBody className="pt-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-72">
            <label htmlFor="lead-search" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
              Search
            </label>
            <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <TextInput
              id="lead-search"
              className="pl-9"
              type="search"
              maxLength={160}
              value={searchDraft}
              onChange={(e) => {
                setSearchDraft(e.target.value);
                setFilters((f) => ({ ...f, page: 1 }));
              }}
              placeholder="Name, email or phone"
            />
            </div>
          </div>
          <FilterSelect
            id="lead-status-filter"
            label="Stage"
            value={filters.status ?? ''}
            onChange={(v) => setFilters((f) => ({ ...f, page: 1, status: (v || undefined) as LeadStatus | undefined }))}
            options={[{ value: '', label: 'All stages' }, ...LEAD_STATUSES.map((st) => ({ value: st, label: STAGE[st].label }))]}
          />
          <FilterSelect
            id="lead-source-filter"
            label="Source"
            value={filters.source ?? ''}
            onChange={(v) => setFilters((f) => ({ ...f, page: 1, source: v || undefined }))}
            options={[{ value: '', label: 'All sources' }, ...LEAD_SOURCES]}
          />
          <FilterSelect
            id="lead-owner-filter"
            label="Owner"
            value={filters.ownerId ? 'mine' : ''}
            onChange={(v) => setFilters((f) => ({ ...f, page: 1, ownerId: v === 'mine' && userId ? userId : undefined }))}
            options={[
              { value: '', label: 'All owners' },
              { value: 'mine', label: 'My leads' },
            ]}
          />
        </div>
        <QueryState query={leads} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No leads match these filters" />}>
          {(data) => (
            <>
              <DataTable paginate={false} columns={columns} rows={data.items} rowKey={(l) => l.id} />
              <Pagination
                page={data.page}
                limit={data.limit}
                total={data.total}
                onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
                onLimitChange={(limit) => setFilters((f) => ({ ...f, limit, page: 1 }))}
                itemName="leads"
              />
            </>
          )}
        </QueryState>
      </CardBody>
    </Card>
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
  const [familyTerm, setFamilyTerm] = useState('');
  const familySearch = useAdminSearch(useDebounced(familyTerm), 'families', 20);
  const families = (familySearch.data?.items ?? []) as FamilySearchHit[];
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
    if (familyId.trim() && !isUuid(familyId)) return fail('familyId', 'That is not a valid family reference.');
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
        <Field label="Family it became (optional)" htmlFor="move-family" error={fieldError('familyId')} hint="Type the family's name.">
          <Select
            id="move-family"
            value={familyId}
            searchable
            onInputChange={setFamilyTerm}
            noOptionsText={familyTerm.trim().length < 2 ? 'Type 2+ letters of the family name' : 'No family found'}
            onChange={(e) => setFamilyId(e.target.value)}
          >
            <option value="">{lead.familyId ? 'Linked family' : 'Select a family'}</option>
            {lead.familyId && !families.some((f) => f.id === lead.familyId) && <option value={lead.familyId}>Currently linked family</option>}
            {families.map((f) => (
              <option key={f.id} value={f.id} data-description={f.country ? countryName(f.country) : undefined}>
                {f.name}
              </option>
            ))}
          </Select>
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

type TaskView = 'open' | 'overdue' | 'DONE' | 'CANCELLED' | 'all';

function TasksPanel() {
  const [view, setView] = useState<TaskView>('open');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const filters: TaskFilters = {
    page,
    limit,
    status: view === 'open' || view === 'overdue' ? 'OPEN' : view === 'all' ? undefined : (view as TaskStatus),
    overdueOnly: view === 'overdue' || undefined,
  };
  const tasks = useCrmTasks(filters);
  const pipeline = useCrmPipeline();
  const complete = useCompleteCrmTask();
  const toast = useToast();
  const [completingId, setCompletingId] = useState<string | null>(null);
  // Due dates are judged against when the list was fetched (pure during render).
  const now = tasks.dataUpdatedAt;

  const markDone = (task: TaskListItem) => {
    setCompletingId(task.id);
    complete.mutate(task.id, {
      onSuccess: () => toast.success('Task marked done'),
      onError: (err) => toast.error(err),
      onSettled: () => setCompletingId(null),
    });
  };

  const VIEWS: Array<{ value: TaskView; label: string; count?: number; alert?: boolean }> = [
    { value: 'open', label: 'To do', count: pipeline.data?.openTasks },
    { value: 'overdue', label: 'Overdue', count: pipeline.data?.overdueTasks, alert: (pipeline.data?.overdueTasks ?? 0) > 0 },
    { value: 'DONE', label: 'Done' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'all', label: 'All tasks' },
  ];

  return (
    <Card>
      <CardHeader title="Follow-up tasks" description="Calls and messages to families. Overdue first, then by due date." />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-sand/60 p-1" role="tablist" aria-label="Which tasks">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="tab"
              aria-selected={view === v.value}
              onClick={() => {
                setView(v.value);
                setPage(1);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                view === v.value ? 'bg-white text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
              )}
            >
              {v.label}
              {v.count !== undefined && (
                <span className={cn('rounded-full px-1.5 text-[10px] font-semibold tabular-nums', v.alert ? 'bg-red text-white' : 'bg-sand text-ink-2')}>{v.count}</span>
              )}
            </button>
          ))}
        </div>
        <QueryState
          query={tasks}
          isEmpty={(d) => d.items.length === 0}
          empty={
            <EmptyState
              title={view === 'overdue' ? 'Nothing overdue' : view === 'open' ? 'All caught up' : 'No tasks here'}
              description={view === 'open' || view === 'overdue' ? 'Every follow-up has been done.' : undefined}
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
          }
        >
          {(data) => (
            <>
              <DataTable
                paginate={false}
                rows={data.items}
                rowKey={(t) => t.id}
                columns={[
                  {
                    key: 'task',
                    header: 'Task',
                    render: (t) => (
                      <span className="block min-w-[200px]">
                        <span className="font-medium text-ink">{taskTitle(t)}</span>
                        {t.note && t.type !== 'OTHER' && <span className="mt-0.5 block text-xs text-muted line-clamp-2">{t.note}</span>}
                      </span>
                    ),
                  },
                  {
                    key: 'lead',
                    header: 'Family',
                    sortValue: (t) => t.lead?.contactName.toLowerCase() ?? '',
                    render: (t) =>
                      t.lead ? (
                        <span className="flex items-center gap-2">
                          <Initial name={t.lead.contactName} className="h-7 w-7" />
                          <span className="min-w-0">
                            <span className="block text-ink">{t.lead.contactName}</span>
                            <StageDot status={t.lead.status} />
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted">Not linked to a lead</span>
                      ),
                  },
                  {
                    key: 'due',
                    header: 'Due',
                    sortValue: (t) => t.dueAt,
                    render: (t) => {
                      const due = dueLabel(t.dueAt, now);
                      const open = t.status === 'OPEN';
                      return (
                        <span className="block whitespace-nowrap">
                          <span className={cn('block text-xs', open && due.overdue ? 'font-semibold text-red' : open && due.today ? 'font-medium text-amber-800' : 'text-ink-2')}>
                            {open ? due.text : humanize(t.status)}
                          </span>
                          <span className="block text-[11px] text-muted">{formatDateTime(t.dueAt)}</span>
                        </span>
                      );
                    },
                  },
                  { key: 'assignee', header: 'Assigned to', render: (t) => t.assignee?.name ?? <span className="text-muted">Unassigned</span> },
                  {
                    key: 'status',
                    header: <span className="sr-only">Action</span>,
                    sortable: false,
                    className: 'text-right',
                    render: (t) =>
                      t.status === 'OPEN' ? (
                        <UiButton
                          size="sm"
                          variant="secondary"
                          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          loading={completingId === t.id}
                          disabled={completingId !== null && completingId !== t.id}
                          onClick={() => markDone(t)}
                          aria-label={`Mark “${taskTitle(t)}” done`}
                        >
                          Mark done
                        </UiButton>
                      ) : (
                        <Badge tone={t.status === 'DONE' ? 'green' : 'neutral'}>{t.status === 'DONE' && t.completedAt ? `Done ${formatDate(t.completedAt)}` : humanize(t.status)}</Badge>
                      ),
                  },
                ]}
              />
              <Pagination
                page={data.page}
                limit={data.limit}
                total={data.total}
                onPageChange={setPage}
                onLimitChange={(l) => {
                  setLimit(l);
                  setPage(1);
                }}
                itemName="tasks"
              />
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
                {t === 'OTHER' ? 'General follow-up' : TASK_LABEL[t]}
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
