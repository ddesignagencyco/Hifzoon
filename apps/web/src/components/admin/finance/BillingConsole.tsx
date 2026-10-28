'use client';

import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  QueryState,
  StatTile,
  UiButton,
  formatDateTime,
  formatMoney,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { newIdempotencyKey } from '@/lib/api/http';
import { useBillingActivity, useBillingPlans, useRunDunning } from '@/hooks/useFinance';
import { BillingPlan, DunningResult } from '@/lib/api/modules/billing-admin';
import { ConfirmDialog, CopyId, useAdminRoles } from '../system/shared';
import { IssueInvoiceForm, RefundForm, WriteOffForm } from './BillingForms';

/** /admin/billing — invoice issuing, refunds, dunning and the plan price reference. */
export function BillingConsole() {
  const { isSuperAdmin } = useAdminRoles();

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Billing operations"
        description="Issue invoices, refund payments, write off what a family will never pay, and run the dunning sweep. Every action is audited."
      />
      <Alert tone="neutral" title="Looking up records" className="mb-6">
        The admin API does not yet list subscriptions, invoices or payments, so these tools take a pasted reference.
        {isSuperAdmin
          ? ' Recent billing activity from the audit log is shown below to help you find them.'
          : ' Ask a super admin to copy the reference from the audit log if you need one.'}
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <IssueInvoiceForm />
        <RefundForm />
        <WriteOffForm />
      </div>

      {isSuperAdmin && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start mt-6">
          <DunningCard />
          <BillingActivity />
        </div>
      )}

      <PlansReference />
    </>
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
        toast.success(`Dunning run complete: ${data.retried} retried, ${data.cancelled} cancelled`);
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <Card>
      <CardHeader
        title="Dunning sweep"
        description="Schedules retries on overdue invoices (1, 3, 7 days) and cancels subscriptions after the last attempt."
      />
      <CardBody className="space-y-4">
        <UiButton
          variant="gold"
          icon={<RefreshCw className="w-4 h-4" aria-hidden />}
          onClick={() => setIntentKey(newIdempotencyKey())}
          loading={dunning.isPending}
        >
          Run dunning now
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
        title="Run the dunning sweep?"
        description="Overdue invoices get a retry scheduled; families past the final retry have their subscription cancelled."
        confirmLabel="Run dunning"
        pending={dunning.isPending}
        onConfirm={run}
        onClose={() => setIntentKey(null)}
      />
    </Card>
  );
}

function BillingActivity() {
  const query = useBillingActivity(true);
  return (
    <Card>
      <CardHeader title="Recent billing activity" description="Last 20 billing audit entries (bil.*)." />
      <CardBody>
        <QueryState
          query={query}
          isEmpty={(d) => d.items.length === 0}
          empty={<EmptyState title="No billing activity yet" />}
        >
          {(data) => (
            <ul className="divide-y divide-line">
              {data.items.map((e) => (
                <li key={e.id} className="py-2.5 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">
                      <code className="font-mono text-xs">{e.action}</code>
                      {e.targetType && <Badge className="ml-2">{e.targetType}</Badge>}
                    </p>
                    {e.targetId && (
                      <div className="mt-0.5">
                        <CopyId value={e.targetId} label={`${e.targetType ? humanize(e.targetType).toLowerCase() : 'target'} reference`} />
                      </div>
                    )}
                  </div>
                  <div className="text-right text-[11px] text-muted shrink-0">
                    <p>{formatDateTime(e.at)}</p>
                    <p>{e.actor?.name ?? 'System'}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}

function PlansReference() {
  const query = useBillingPlans();
  const currencies = (plans: BillingPlan[]) =>
    [...new Set(plans.flatMap((p) => p.prices.map((pr) => pr.currency)))].sort();

  return (
    <Card className="mt-6">
      <CardHeader title="Plans & prices" description="Read-only reference of active plans (GET /billing/plans)." />
      <CardBody className="px-0 sm:px-5">
        <QueryState query={query} empty={<EmptyState title="No active plans" />}>
          {(plans) => {
            const cols = currencies(plans);
            return (
              <DataTable
                rows={plans}
                rowKey={(p) => p.id}
                columns={[
                  {
                    key: 'plan',
                    header: 'Plan',
                    render: (p) => (
                      <>
                        <p className="font-medium text-ink">{p.name}</p>
                        <p className="text-[11px] text-muted font-mono">{p.code}</p>
                      </>
                    ),
                  },
                  {
                    key: 'shape',
                    header: 'Classes',
                    render: (p) => (
                      <span className="whitespace-nowrap">
                        {p.classesPerWeek}×/week · {p.classMinutes} min
                      </span>
                    ),
                  },
                  { key: 'room', header: 'Room', render: (p) => humanize(p.roomType) },
                  { key: 'period', header: 'Billed', render: (p) => humanize(p.billingPeriod) },
                  ...cols.map((c) => ({
                    key: c,
                    header: c,
                    className: 'text-right tabular-nums whitespace-nowrap',
                    render: (p: BillingPlan) => {
                      const price = p.prices.find((pr) => pr.currency === c);
                      return price ? formatMoney(price.amountMinor, c) : '—';
                    },
                  })),
                ]}
              />
            );
          }}
        </QueryState>
      </CardBody>
    </Card>
  );
}
