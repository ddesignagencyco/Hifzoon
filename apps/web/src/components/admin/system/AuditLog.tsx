'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Filter, X } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  QueryState,
  Select,
  TextInput,
  UiButton,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAuditLog } from '@/hooks/useAudit';
import { AuditEntry, AuditFilters, totalPages, validateAuditFilters } from '@/lib/api/modules/audit';
import { CopyId, JsonBlock, Pager, useAdminRoles } from './shared';

type FilterForm = {
  action: string;
  targetType: string;
  targetId: string;
  actorId: string;
  from: string;
  to: string;
  limit: string;
};

const EMPTY_FORM: FilterForm = { action: '', targetType: '', targetId: '', actorId: '', from: '', to: '', limit: '50' };

/** `datetime-local` value (viewer's timezone) → ISO string. */
function localToIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function toFilters(form: FilterForm, page: number): AuditFilters {
  return {
    action: form.action.trim() || undefined,
    targetType: form.targetType.trim() || undefined,
    targetId: form.targetId.trim() || undefined,
    actorId: form.actorId.trim() || undefined,
    from: localToIso(form.from),
    to: localToIso(form.to),
    page,
    limit: Number(form.limit) || 50,
  };
}

/** /admin/audit — append-only audit log viewer (FR-OPS-06). SUPER_ADMIN only. */
export function AuditLogScreen() {
  const { isSuperAdmin } = useAdminRoles();
  const [form, setForm] = useState<FilterForm>(EMPTY_FORM);
  const [applied, setApplied] = useState<FilterForm>(EMPTY_FORM);
  const [page, setPage] = useState(1);
  const [errors, setErrors] = useState<Partial<Record<keyof AuditFilters, string>>>({});

  const filters = toFilters(applied, page);
  const query = useAuditLog(filters, isSuperAdmin);
  const toast = useToast();

  if (!isSuperAdmin) {
    return (
      <>
        <PageHeader eyebrow="System" title="Audit log" />
        <Alert tone="warning" title="Super admin only">
          The audit log is restricted to super admins so that the people who change records are not the ones reviewing
          who changed them.
        </Alert>
      </>
    );
  }

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validateAuditFilters(toFilters(form, 1));
    setErrors(next);
    if (Object.keys(next).length > 0) return toast.error(Object.values(next).find(Boolean) ?? 'Please fix the highlighted fields');
    setApplied(form);
    setPage(1);
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    setApplied(EMPTY_FORM);
    setErrors({});
    setPage(1);
  };

  const set = (key: keyof FilterForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Audit log"
        description="Every sensitive change, who made it and what changed. Read-only and append-only."
      />

      <Card className="mb-6">
        <CardHeader title="Filters" description="Action matches anywhere in the action name (e.g. bil. or cms)." />
        <CardBody>
          <form onSubmit={apply} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Audit filters">
            <Field label="Action contains" htmlFor="audit-action" error={errors.action}>
              <TextInput id="audit-action" value={form.action} onChange={set('action')} maxLength={120} placeholder="e.g. bil.refund" />
            </Field>
            <Field label="Target type" htmlFor="audit-target-type" error={errors.targetType}>
              <TextInput id="audit-target-type" value={form.targetType} onChange={set('targetType')} maxLength={80} placeholder="e.g. invoice" />
            </Field>
            <Field label="Target ID" htmlFor="audit-target-id" error={errors.targetId} hint="Paste a “Copy reference” value from any admin screen.">
              <TextInput id="audit-target-id" value={form.targetId} onChange={set('targetId')} maxLength={80} />
            </Field>
            <Field label="Actor user ID" htmlFor="audit-actor" error={errors.actorId} hint="Users & search → open the person → “Copy reference”.">
              <TextInput id="audit-actor" value={form.actorId} onChange={set('actorId')} placeholder="Paste user reference" />
            </Field>
            <Field label="From" htmlFor="audit-from" error={errors.from}>
              <TextInput id="audit-from" type="datetime-local" value={form.from} onChange={set('from')} />
            </Field>
            <Field label="To" htmlFor="audit-to" error={errors.to}>
              <TextInput id="audit-to" type="datetime-local" value={form.to} onChange={set('to')} />
            </Field>
            <Field label="Rows per page" htmlFor="audit-limit">
              <Select id="audit-limit" value={form.limit} onChange={set('limit')}>
                {['25', '50', '100'].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end gap-2">
              <UiButton type="submit" icon={<Filter className="w-4 h-4" aria-hidden />} loading={query.isFetching}>
                Apply
              </UiButton>
              <UiButton variant="ghost" onClick={reset} icon={<X className="w-4 h-4" aria-hidden />}>
                Clear
              </UiButton>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Entries"
          description={query.data ? `${query.data.total} matching entr${query.data.total === 1 ? 'y' : 'ies'}` : undefined}
          action={
            query.data && query.data.failedWrites > 0 ? (
              <Badge tone="red">{query.data.failedWrites} failed audit write{query.data.failedWrites === 1 ? '' : 's'} since API start</Badge>
            ) : undefined
          }
        />
        <CardBody>
          <QueryState
            query={query}
            isEmpty={(d) => d.items.length === 0}
            empty={<EmptyState title="No audit entries match" description="Try widening the date range or clearing filters." />}
          >
            {(data) => (
              <>
                <AuditTable items={data.items} />
                <Pager
                  page={page}
                  totalPages={totalPages(data.total, filters.limit ?? 50)}
                  onChange={setPage}
                  disabled={query.isFetching}
                />
              </>
            )}
          </QueryState>
        </CardBody>
      </Card>
    </>
  );
}

function AuditTable({ items }: { items: AuditEntry[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto -mx-5 sm:mx-0">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="w-8 px-2 py-2.5"><span className="sr-only">Details</span></th>
            {['When', 'Actor', 'Action', 'Target'].map((h) => (
              <th key={h} scope="col" className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => {
            const expanded = open === entry.id;
            const detailId = `audit-detail-${entry.id}`;
            return (
              <React.Fragment key={entry.id}>
                <tr className="border-b border-line/60 align-top">
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : entry.id)}
                      aria-expanded={expanded}
                      aria-controls={detailId}
                      aria-label={`${expanded ? 'Hide' : 'Show'} details for ${entry.action}`}
                      className="p-1 rounded-md text-muted hover:bg-sand hover:text-ink cursor-pointer"
                    >
                      {expanded ? <ChevronDown className="w-4 h-4" aria-hidden /> : <ChevronRight className="w-4 h-4" aria-hidden />}
                    </button>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-ink-2">
                    <time dateTime={entry.at}>
                      {new Date(entry.at).toLocaleString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </time>
                  </td>
                  <td className="px-3 py-3">
                    {entry.actor ? (
                      <>
                        <p className="text-ink font-medium">{entry.actor.name}</p>
                        <p className="text-[11px] text-muted break-all">{entry.actor.email}</p>
                      </>
                    ) : (
                      <span className="text-muted">System</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <code className="font-mono text-xs text-ink">{entry.action}</code>
                  </td>
                  <td className="px-3 py-3">
                    {entry.targetType ? <Badge>{entry.targetType}</Badge> : <span className="text-muted">—</span>}
                    {entry.targetId && (
                      <div className="mt-1">
                        <CopyId value={entry.targetId} label="target reference" />
                      </div>
                    )}
                  </td>
                </tr>
                {expanded && (
                  <tr id={detailId} className="border-b border-line/60 bg-cream/50">
                    <td />
                    <td colSpan={4} className="px-3 py-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <JsonBlock label="Before" value={entry.before} />
                        <JsonBlock label="After" value={entry.after} />
                      </div>
                      <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                        <div><dt className="inline text-muted">Entry: </dt><dd className="inline"><CopyId value={entry.id} label="entry reference" /></dd></div>
                        <div><dt className="inline text-muted">IP: </dt><dd className="inline text-ink-2">{entry.ip ?? '—'}</dd></div>
                        <div><dt className="inline text-muted">Request: </dt><dd className="inline text-ink-2">{entry.requestId ? <CopyId value={entry.requestId} label="request reference" /> : '—'}</dd></div>
                        {entry.actorId && (
                          <div className="sm:col-span-3"><dt className="inline text-muted">Actor: </dt><dd className="inline">{entry.actor?.name ?? 'System'} <CopyId value={entry.actorId} label="actor reference" /></dd></div>
                        )}
                      </dl>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
