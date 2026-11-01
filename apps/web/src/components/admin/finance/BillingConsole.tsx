'use client';

import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  QueryState,
  StatTile,
  StatusBadge,
  Tabs,
  UiButton,
  formatDate,
  formatDateTime,
  formatMoney,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { newIdempotencyKey } from '@/lib/api/http';
import { useAdminInvoices, useBillingActivity, useRunDunning } from '@/hooks/useFinance';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { DunningResult, Invoice } from '@/lib/api/modules/billing-admin';

const INVOICE_STATUSES: Invoice['status'][] = ['DRAFT', 'OPEN', 'PAID', 'FAILED', 'REFUNDED', 'VOID'];
import { ConfirmDialog, CopyId, useAdminRoles } from '../system/shared';
import { IssueInvoiceForm, RefundForm, WriteOffForm } from './BillingForms';
import { PricingManager } from './PricingManager';

type Section = 'plans' | 'activity';

/** /admin/billing — plans and prices, then the payment tools, then the audit trail. */
export function BillingConsole() {
  const { isSuperAdmin } = useAdminRoles();
  const [section, setSection] = useState<Section>('plans');

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Billing"
        description="Plans and prices, and every billing change. Invoices and refunds have their own page."
      />
      <Tabs
        className="mb-5"
        value={section}
        onChange={setSection}
        tabs={[
          { value: 'plans', label: 'Plans & prices' },
          ...(isSuperAdmin ? [{ value: 'activity' as const, label: 'Activity' }] : []),
        ]}
      />

      {section === 'plans' && <PricingManager />}

      {section === 'activity' && isSuperAdmin && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start">
          <DunningCard />
          <BillingActivity />
        </div>
      )}
    </>
  );
}

/** `/admin/invoices` — issue an invoice, refund a payment or write one off. */
export function InvoicesConsole() {
  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Invoices & refunds"
        description="Every invoice, and the actions to bill a family by hand, refund a payment, or write off an invoice they will never pay. Every action is audited."
      />
      <AllInvoices />
      <h2 className="mb-3 mt-8 font-serif text-lg text-ink">Actions</h2>
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <div className="space-y-6 min-w-0">
          <IssueInvoiceForm />
          <WriteOffForm />
        </div>
        <div className="min-w-0">
          <RefundForm />
        </div>
      </div>
    </>
  );
}

/** Every invoice, card-billed and manual, server-paginated with status and source filters. */
function AllInvoices() {
  const [status, setStatus] = useState<Invoice['status'] | ''>('');
  const [source, setSource] = useState<'CARD' | 'MANUAL' | ''>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const invoices = useAdminInvoices({ status, source, page, limit });
  return (
    <Card>
      <CardHeader title="Invoices" description="Newest first. Card invoices are billed by Stripe automatically; manual ones are issued below." />
      <CardBody className="pt-0">
        <QueryState query={invoices} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No invoices yet" />}>
          {(data) => {
            return (
              <>
                <DataTable
                  paginate={false}
                  rows={data.items}
                  rowKey={(i) => i.id}
                  toolbar={
                    <>
                  <FilterSelect
                    id="inv-status"
                    label="Status"
                    value={status}
                    onChange={(v) => {
                      setStatus(v);
                      setPage(1);
                    }}
                    options={[{ value: '', label: 'All statuses' }, ...INVOICE_STATUSES.map((s) => ({ value: s, label: humanize(s) }))]}
                  />
                  <FilterSelect
                    id="inv-source"
                    label="Billed by"
                    value={source}
                    onChange={(v) => {
                      setSource(v);
                      setPage(1);
                    }}
                    options={[
                      { value: '', label: 'Card and manual' },
                      { value: 'CARD', label: 'Card (automatic)' },
                      { value: 'MANUAL', label: 'Manual' },
                    ]}
                  />
                    </>
                  }
                  columns={[
                    {
                      key: 'number',
                      header: 'Invoice',
                      render: (i) => (
                        <span className="block">
                          <span className="font-medium text-ink">{i.number}</span>
                          <span className="block text-[11px] text-muted">{i.source === 'CARD' ? 'Card · automatic' : 'Manual'}</span>
                        </span>
                      ),
                    },
                    { key: 'family', header: 'Family', render: (i) => i.family.name },
                    {
                      key: 'amount',
                      header: 'Amount',
                      className: 'text-right tabular-nums',
                      sortValue: (i) => i.totalMinor,
                      render: (i) => formatMoney(i.totalMinor, i.currency),
                    },
                    { key: 'status', header: 'Status', sortValue: (i) => i.status, render: (i) => <StatusBadge status={i.status} /> },
                    { key: 'issued', header: 'Issued', sortValue: (i) => i.createdAt, render: (i) => formatDate(i.createdAt) },
                    {
                      key: 'due',
                      header: 'Due / paid',
                      sortValue: (i) => i.paidAt ?? i.dueAt ?? '',
                      render: (i) => (i.paidAt ? `Paid ${formatDate(i.paidAt)}` : i.dueAt ? `Due ${formatDate(i.dueAt)}` : '—'),
                    },
                    {
                      key: 'open',
                      header: <span className="sr-only">Open</span>,
                      sortable: false,
                      className: 'text-right',
                      render: (i) =>
                        i.hostedUrl ? (
                          <a href={i.hostedUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-green-800 hover:underline">
                            View invoice
                          </a>
                        ) : null,
                    },
                  ]}
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
                  itemName="invoices"
                  className="mt-3"
                />
              </>
            );
          }}
        </QueryState>
      </CardBody>
    </Card>
  );
}

function DunningCard() {
  const toast = useToast();
  const dunning = useRunDunning();
  const [intentKey, setIntentKey] = useState<string | null>(null);
  const [result, setResult] = useState<{ at: Date; data: DunningResult } | null>(null);

  const run = () => {
    if (!intentKey) return;
    dunning.mutate(intentKey, {
      onSuccess: (data) => {
        setResult({ at: new Date(), data });
        setIntentKey(null);
        toast.success(`Retries done: ${data.retried} retried, ${data.cancelled} cancelled`);
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <Card>
      <CardHeader
        title="Retry overdue payments"
        description="For invoices the academy issued by hand: retries overdue ones (day 1, 3, 7) and ends the plan after the last try. Card subscriptions are retried by Stripe on their own."
      />
      <CardBody className="space-y-4">
        <UiButton
          variant="gold"
          icon={<RefreshCw className="w-4 h-4" aria-hidden />}
          onClick={() => setIntentKey(newIdempotencyKey())}
          loading={dunning.isPending}
        >
          Run retries now
        </UiButton>
        {result && (
          <div aria-live="polite">
            <p className="text-xs text-muted mb-2">Last run {formatDateTime(result.at)}</p>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Retries scheduled" value={result.data.retried} />
              <StatTile label="Subscriptions cancelled" value={result.data.cancelled} />
            </div>
          </div>
        )}
      </CardBody>
      <ConfirmDialog
        open={intentKey !== null}
        title="Retry overdue payments now?"
        description="Overdue invoices get a retry scheduled; families past the final retry have their subscription cancelled."
        confirmLabel="Run retries"
        pending={dunning.isPending}
        onConfirm={run}
        onClose={() => setIntentKey(null)}
      />
    </Card>
  );
}

/** "bil.subscription.change_plan" → "Subscription change plan". */
function activityLabel(action: string): string {
  const words = action.replace(/^bil\./, '').split(/[._]/).filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ACTIVITY_PAGE = 10;

function BillingActivity() {
  const query = useBillingActivity(true);
  const [showAll, setShowAll] = useState(false);
  return (
    <Card>
      <CardHeader title="Recent billing activity" description="The latest billing changes, newest first." />
      <CardBody>
        <QueryState
          query={query}
          isEmpty={(d) => d.items.length === 0}
          empty={<EmptyState title="No billing activity yet" />}
        >
          {(data) => (
            <>
              <ul className="divide-y divide-line">
                {(showAll ? data.items : data.items.slice(0, ACTIVITY_PAGE)).map((e) => (
                  <li key={e.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{activityLabel(e.action)}</p>
                      <p className="text-[11px] text-muted">
                        {formatDateTime(e.at)} · {e.actor?.name ?? 'System'}
                      </p>
                    </div>
                    {e.targetId && (
                      <CopyId value={e.targetId} label={`${e.targetType ? humanize(e.targetType).toLowerCase() : 'target'} reference`} />
                    )}
                  </li>
                ))}
              </ul>
              {data.items.length > ACTIVITY_PAGE && (
                <UiButton variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show less' : `Show all ${data.items.length}`}
                </UiButton>
              )}
            </>
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}
