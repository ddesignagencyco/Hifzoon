'use client';

import React, { useState } from 'react';
import { FileText, Undo2 } from 'lucide-react';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  Field,
  Select,
  TextArea,
  TextInput,
  UiButton,
  formatDate,
  formatMoney,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { newIdempotencyKey } from '@/lib/api/http';
import { useIssueInvoice, useRefund } from '@/hooks/useFinance';
import {
  CURRENCIES,
  CurrencyCode,
  Invoice,
  InvoiceErrors,
  IssueInvoiceInput,
  Refund,
  RefundErrors,
  RefundInput,
  validateInvoice,
  validateRefund,
} from '@/lib/api/modules/billing-admin';
import { ConfirmDialog, CopyId } from '../system/shared';

/**
 * One pending submission = one user intent. The idempotency key is minted when the
 * operator confirms intent and reused if they retry the same confirmation.
 */
interface Pending<T> {
  body: T;
  key: string;
}

export function RefundForm() {
  const toast = useToast();
  const refund = useRefund();
  const [values, setValues] = useState({ paymentId: '', amount: '', reason: '', maxRefundable: '' });
  const [currency, setCurrency] = useState<CurrencyCode>('GBP');
  const [errors, setErrors] = useState<RefundErrors>({});
  const [pending, setPending] = useState<Pending<RefundInput> | null>(null);
  const [last, setLast] = useState<{ refund: Refund; currency: CurrencyCode } | null>(null);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateRefund(values);
    setErrors(result.errors);
    if (!result.body) return toast.error(Object.values(result.errors).find(Boolean) ?? 'Please fix the highlighted fields');
    setPending({ body: result.body, key: newIdempotencyKey() });
  };

  const confirm = () => {
    if (!pending) return;
    refund.mutate(
      { body: pending.body, idempotencyKey: pending.key },
      {
        onSuccess: (row) => {
          toast.success(`Refund of ${formatMoney(row.amountMinor, currency)} issued`);
          setLast({ refund: row, currency });
          setPending(null);
          setValues({ paymentId: '', amount: '', reason: '', maxRefundable: '' });
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <Card>
      <CardHeader
        title="Refund a payment"
        description="Full or partial refund of a succeeded payment. The API rejects amounts above what is still refundable."
      />
      <CardBody>
        <form onSubmit={submit} noValidate className="space-y-4" aria-label="Refund a payment">
          <Field
            label="Payment ID"
            htmlFor="refund-payment"
            required
            error={errors.paymentId}
            hint="Paste it from “Copy reference” on the payment's entry under Recent billing activity (super admins) or in the audit log."
          >
            <TextInput
              id="refund-payment"
              value={values.paymentId}
              onChange={set('paymentId')}
              placeholder="Paste payment reference"
              aria-invalid={Boolean(errors.paymentId)}
              autoComplete="off"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <Field label="Refund amount" htmlFor="refund-amount" required error={errors.amount} hint="In major units, e.g. 12.50">
              <TextInput
                id="refund-amount"
                inputMode="decimal"
                value={values.amount}
                onChange={set('amount')}
                placeholder="0.00"
                aria-invalid={Boolean(errors.amount)}
              />
            </Field>
            <Field label="Currency" htmlFor="refund-currency" hint="Display only">
              <Select id="refund-currency" value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label="Refundable balance (optional check)"
            htmlFor="refund-max"
            error={errors.maxRefundable}
            hint="If you know the payment's remaining balance, enter it to catch typos before submitting."
          >
            <TextInput
              id="refund-max"
              inputMode="decimal"
              value={values.maxRefundable}
              onChange={set('maxRefundable')}
              aria-invalid={Boolean(errors.maxRefundable)}
            />
          </Field>
          <Field label="Reason" htmlFor="refund-reason" required error={errors.reason} hint="3–2000 characters; recorded in the audit log.">
            <TextArea
              id="refund-reason"
              value={values.reason}
              onChange={set('reason')}
              maxLength={2000}
              aria-invalid={Boolean(errors.reason)}
            />
          </Field>
          <UiButton type="submit" variant="danger" icon={<Undo2 className="w-4 h-4" aria-hidden />} disabled={refund.isPending}>
            Review refund
          </UiButton>
        </form>

        {last && (
          <Alert tone="success" title="Refund recorded" className="mt-4">
            {formatMoney(last.refund.amountMinor, last.currency)} refunded · {formatDate(last.refund.createdAt)} <CopyId value={last.refund.id} label="refund reference" />
          </Alert>
        )}
      </CardBody>

      <ConfirmDialog
        open={pending !== null}
        title="Issue this refund?"
        description="Money is returned to the family through the payment provider. This cannot be reversed."
        confirmLabel={pending ? `Refund ${formatMoney(pending.body.amountMinor, currency)}` : 'Refund'}
        pending={refund.isPending}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      >
        {pending && (
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted">Payment</dt>
              <dd className="text-ink-2">The payment you pasted</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Amount</dt>
              <dd className="font-semibold text-ink">
                {formatMoney(pending.body.amountMinor, currency)}{' '}
                <span className="text-xs font-normal text-muted">({pending.body.amountMinor} minor units)</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Reason</dt>
              <dd className="text-ink-2 whitespace-pre-wrap break-words">{pending.body.reason}</dd>
            </div>
          </dl>
        )}
      </ConfirmDialog>
    </Card>
  );
}

export function IssueInvoiceForm() {
  const toast = useToast();
  const issue = useIssueInvoice();
  const [values, setValues] = useState({ subscriptionId: '', discount: '' });
  const [errors, setErrors] = useState<InvoiceErrors>({});
  const [pending, setPending] = useState<Pending<IssueInvoiceInput> | null>(null);
  const [last, setLast] = useState<Invoice | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateInvoice(values);
    setErrors(result.errors);
    if (!result.body) return toast.error(Object.values(result.errors).find(Boolean) ?? 'Please fix the highlighted fields');
    setPending({ body: result.body, key: newIdempotencyKey() });
  };

  const confirm = () => {
    if (!pending) return;
    issue.mutate(
      { body: pending.body, idempotencyKey: pending.key },
      {
        onSuccess: (invoice) => {
          toast.success(`Invoice ${invoice.number} issued`);
          setLast(invoice);
          setPending(null);
          setValues({ subscriptionId: '', discount: '' });
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <Card>
      <CardHeader
        title="Issue an invoice"
        description="Bills the subscription's plan price in its currency. Due date follows the billing.invoice_due_days setting."
      />
      <CardBody>
        <form onSubmit={submit} noValidate className="space-y-4" aria-label="Issue an invoice">
          <Field
            label="Subscription ID"
            htmlFor="invoice-subscription"
            required
            error={errors.subscriptionId}
            hint="Paste it from “Copy reference” on the subscription's entry under Recent billing activity (super admins) or in the audit log."
          >
            <TextInput
              id="invoice-subscription"
              value={values.subscriptionId}
              onChange={(e) => setValues((v) => ({ ...v, subscriptionId: e.target.value }))}
              placeholder="Paste subscription reference"
              aria-invalid={Boolean(errors.subscriptionId)}
              autoComplete="off"
            />
          </Field>
          <Field
            label="Discount (optional)"
            htmlFor="invoice-discount"
            error={errors.discount}
            hint="Major units in the subscription's currency. Must not exceed the plan price."
          >
            <TextInput
              id="invoice-discount"
              inputMode="decimal"
              value={values.discount}
              onChange={(e) => setValues((v) => ({ ...v, discount: e.target.value }))}
              placeholder="0.00"
              aria-invalid={Boolean(errors.discount)}
            />
          </Field>
          <UiButton type="submit" icon={<FileText className="w-4 h-4" aria-hidden />} disabled={issue.isPending}>
            Review invoice
          </UiButton>
        </form>

        {last && (
          <Alert tone="success" title={`Invoice ${last.number}`} className="mt-4">
            Subtotal {formatMoney(last.subtotalMinor, last.currency)} · discount {formatMoney(last.discountMinor, last.currency)} ·{' '}
            <strong>total {formatMoney(last.totalMinor, last.currency)}</strong> · due {formatDate(last.dueAt)}
            <br />
            <CopyId value={last.id} label="invoice reference" />
          </Alert>
        )}
      </CardBody>

      <ConfirmDialog
        open={pending !== null}
        title="Issue this invoice?"
        description="The family will owe this invoice; it is recorded in the audit log."
        confirmLabel="Issue invoice"
        tone="primary"
        pending={issue.isPending}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      >
        {pending && (
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted">Subscription</dt>
              <dd className="text-ink-2">The subscription you pasted</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Discount</dt>
              <dd className="text-ink-2">
                {pending.body.discountMinor !== undefined ? `${pending.body.discountMinor} minor units` : 'None'}
              </dd>
            </div>
          </dl>
        )}
      </ConfirmDialog>
    </Card>
  );
}

