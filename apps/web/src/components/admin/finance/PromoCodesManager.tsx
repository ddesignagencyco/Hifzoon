'use client';

import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Modal,
  QueryState,
  Select,
  TextInput,
  UiButton,
  formatDate,
  formatMoney,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminPrices, usePromoCodes, useSavePromoCode } from '@/hooks/useFinance';
import { PromoCode, PromoCodeInput, parseMajorToMinor } from '@/lib/api/modules/billing-admin';
import { BILLING_CURRENCY } from '@/lib/api/modules/billing-family';
import { ConfirmDialog, useAdminRoles } from '../system/shared';

/** "25% off" / "$5 off" for a code's discount (an older code keeps its own currency). */
export function promoDiscountText(p: Pick<PromoCode, 'percentOff' | 'amountOffMinor' | 'currency'>): string {
  if (p.percentOff !== null) return `${p.percentOff}% off`;
  return `${formatMoney(p.amountOffMinor ?? 0, p.currency ?? BILLING_CURRENCY)} off`;
}

/** Whether a family could use the code right now, in words. */
export function promoState(p: PromoCode, now = new Date()): { label: string; tone: 'green' | 'neutral' | 'amber' } {
  if (!p.active) return { label: 'Off', tone: 'neutral' };
  if (p.expiresAt && new Date(p.expiresAt) <= now) return { label: 'Expired', tone: 'amber' };
  if (p.maxRedemptions !== null && p.redeemedCount >= p.maxRedemptions) return { label: 'Used up', tone: 'amber' };
  return { label: 'Live', tone: 'green' };
}

/**
 * `/admin/billing` → Promo codes. A code is checked when the family applies it at checkout
 * and counted only once their first payment goes through. It never adds to the sibling
 * discount: the family gets whichever is larger.
 */
export function PromoCodesManager() {
  const { isAdmin, isSuperAdmin } = useAdminRoles();
  const codes = usePromoCodes(isAdmin);
  const save = useSavePromoCode();
  const toast = useToast();
  const [editing, setEditing] = useState<PromoCode | 'new' | null>(null);
  const [deleting, setDeleting] = useState<PromoCode | null>(null);

  return (
    <Card className="mb-6">
      <CardHeader
        title="Promo codes"
        description="Families enter a code at checkout. It is counted only once their payment goes through, each family can use a code once, and it never adds to the sibling discount (the larger one applies)."
        action={
          isSuperAdmin ? (
            <UiButton size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              New code
            </UiButton>
          ) : undefined
        }
      />
      <CardBody className="px-0 sm:px-5">
        {!isSuperAdmin && (
          <Alert tone="neutral" className="mx-5 mb-4 sm:mx-0">
            Only a super admin can create or change promo codes.
          </Alert>
        )}
        <QueryState query={codes} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No promo codes yet" />}>
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Discount</th>
                    <th className="px-3 py-2 font-medium">Used</th>
                    <th className="px-3 py-2 font-medium">Expires</th>
                    <th className="px-3 py-2 font-medium">Plans</th>
                    <th className="px-3 py-2 font-medium">State</th>
                    {isSuperAdmin && <th className="px-3 py-2"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const state = promoState(p);
                    return (
                      <tr key={p.id} className="border-b border-line">
                        <td className="px-3 py-2.5 font-mono font-semibold text-ink">{p.code}</td>
                        <td className="px-3 py-2.5">{promoDiscountText(p)}</td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {p.redeemedCount}
                          {p.maxRedemptions !== null ? ` / ${p.maxRedemptions}` : ''}
                        </td>
                        <td className="px-3 py-2.5">{p.expiresAt ? formatDate(p.expiresAt) : 'Never'}</td>
                        <td className="px-3 py-2.5">{p.appliesToPlanIds.length ? `${p.appliesToPlanIds.length} plans` : 'All'}</td>
                        <td className="px-3 py-2.5">
                          <Badge tone={state.tone}>{state.label}</Badge>
                        </td>
                        {isSuperAdmin && (
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setEditing(p)}
                              className="rounded p-1 text-muted hover:bg-sand hover:text-ink"
                              aria-label={`Edit ${p.code}`}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            {p.redeemedCount === 0 && (
                              <button
                                type="button"
                                onClick={() => setDeleting(p)}
                                className="rounded p-1 text-muted hover:bg-sand hover:text-red-700"
                                aria-label={`Delete ${p.code}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </CardBody>
      {editing && <PromoModal promo={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.code ?? 'this code'}?`}
        description="Nobody has used it yet, so it can be removed. Families who type it will be told it is not valid."
        confirmLabel="Delete code"
        pending={save.isPending}
        onConfirm={() =>
          deleting &&
          save.mutate(
            { kind: 'delete', id: deleting.id },
            {
              onSuccess: () => (toast.success(`${deleting.code} deleted`), setDeleting(null)),
              onError: (err) => toast.error(err),
            },
          )
        }
        onClose={() => setDeleting(null)}
      />
    </Card>
  );
}

interface PromoForm {
  code: string;
  kind: 'percent' | 'amount';
  percent: string;
  /** In USD, like every price. */
  amount: string;
  maxRedemptions: string;
  expiresOn: string;
  active: boolean;
  planIds: string[];
}

/** Turns the form into the API body, or an error message for the first bad field. */
export function promoBody(form: PromoForm): { body?: PromoCodeInput; error?: string } {
  const code = form.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return { error: 'A code is 3–40 letters, digits, dashes or underscores.' };
  let percentOff: number | null = null;
  let amountOffMinor: number | null = null;
  if (form.kind === 'percent') {
    percentOff = Number(form.percent);
    if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 50) {
      return { error: 'A percentage off is a whole number from 1 to 50.' };
    }
  } else {
    amountOffMinor = parseMajorToMinor(form.amount);
    if (amountOffMinor === null || amountOffMinor <= 0) return { error: 'Enter an amount off like 5 or 5.50.' };
  }
  let maxRedemptions: number | null = null;
  if (form.maxRedemptions.trim()) {
    maxRedemptions = Number(form.maxRedemptions);
    if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1) return { error: 'The limit is a whole number of at least 1.' };
  }
  return {
    body: {
      code,
      percentOff,
      amountOffMinor,
      maxRedemptions,
      // The code works through the whole of its last day, in UTC.
      expiresAt: form.expiresOn ? `${form.expiresOn}T23:59:59.000Z` : null,
      active: form.active,
      appliesToPlanIds: form.planIds,
    },
  };
}

function PromoModal({ promo, onClose }: { promo: PromoCode | null; onClose: () => void }) {
  const toast = useToast();
  const save = useSavePromoCode();
  const prices = useAdminPrices();
  const used = Boolean(promo && promo.redeemedCount > 0);
  const [form, setForm] = useState<PromoForm>(() => ({
    code: promo?.code ?? '',
    kind: promo && promo.amountOffMinor !== null ? 'amount' : 'percent',
    percent: promo?.percentOff ? String(promo.percentOff) : '10',
    amount: promo?.amountOffMinor ? (promo.amountOffMinor / 100).toFixed(2) : '',
    maxRedemptions: promo?.maxRedemptions ? String(promo.maxRedemptions) : '',
    expiresOn: promo?.expiresAt ? promo.expiresAt.slice(0, 10) : '',
    active: promo?.active ?? true,
    planIds: promo?.appliesToPlanIds ?? [],
  }));
  const set = <K extends keyof PromoForm>(key: K, value: PromoForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const { body, error } = promoBody(form);
    if (!body) return toast.error(error ?? 'Check the form.');
    const done = {
      onSuccess: () => (toast.success(promo ? 'Promo code saved' : `${body.code} created`), onClose()),
      onError: (err: unknown) => toast.error(err),
    };
    if (promo) {
      const { code: _code, ...rest } = body;
      void _code;
      // A used code keeps its discount; only limits, expiry, plans and on/off may change.
      const patch = used
        ? { maxRedemptions: rest.maxRedemptions, expiresAt: rest.expiresAt, active: rest.active, appliesToPlanIds: rest.appliesToPlanIds }
        : rest;
      save.mutate({ kind: 'update', id: promo.id, body: patch }, done);
    } else {
      save.mutate({ kind: 'create', body }, done);
    }
  };

  const plans = prices.data?.plans ?? [];
  return (
    <Modal
      open
      size="md"
      onClose={save.isPending ? () => undefined : onClose}
      title={promo ? `Edit ${promo.code}` : 'New promo code'}
      footer={
        <>
          <UiButton variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </UiButton>
          <UiButton type="submit" form="promo-form" loading={save.isPending}>
            {promo ? 'Save' : 'Create code'}
          </UiButton>
        </>
      }
    >
      <form id="promo-form" onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2">
        <Field label="Code" htmlFor="promo-code-input" hint="Families can type it in any case.">
          <TextInput
            id="promo-code-input"
            value={form.code}
            disabled={Boolean(promo)}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            placeholder="WELCOME10"
          />
        </Field>
        <Field label="Discount" htmlFor="promo-kind">
          <Select id="promo-kind" value={form.kind} disabled={used} onChange={(e) => set('kind', e.target.value as PromoForm['kind'])}>
            <option value="percent">Percentage off</option>
            <option value="amount">Amount off</option>
          </Select>
        </Field>
        {form.kind === 'percent' ? (
          <Field label="Percent off" htmlFor="promo-percent" hint="1–50, off each period.">
            <TextInput
              id="promo-percent"
              type="number"
              min={1}
              max={50}
              value={form.percent}
              disabled={used}
              onChange={(e) => set('percent', e.target.value)}
            />
          </Field>
        ) : (
          <>
            <Field label={`Amount off (${BILLING_CURRENCY})`} htmlFor="promo-amount" hint="Off each period.">
              <TextInput id="promo-amount" inputMode="decimal" value={form.amount} disabled={used} onChange={(e) => set('amount', e.target.value)} />
            </Field>
          </>
        )}
        <Field label="Limit" htmlFor="promo-max" hint="Families in total; empty = no limit.">
          <TextInput id="promo-max" type="number" min={1} value={form.maxRedemptions} onChange={(e) => set('maxRedemptions', e.target.value)} />
        </Field>
        <Field label="Last day" htmlFor="promo-expires" hint="Empty = never expires.">
          <TextInput id="promo-expires" type="date" value={form.expiresOn} onChange={(e) => set('expiresOn', e.target.value)} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-xs font-semibold text-ink-2">Plans (none ticked = every plan)</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {plans.map((plan) => (
              <label key={plan.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-green-800"
                  checked={form.planIds.includes(plan.id)}
                  onChange={(e) =>
                    set('planIds', e.target.checked ? [...form.planIds, plan.id] : form.planIds.filter((id) => id !== plan.id))
                  }
                />
                {plan.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="accent-green-800" />
          On (untick to stop new families using it)
        </label>
        {used && (
          <p className="text-[11px] text-muted sm:col-span-2">
            Families have used this code, so its discount is fixed. Create a new code for a different discount.
          </p>
        )}
      </form>
    </Modal>
  );
}
