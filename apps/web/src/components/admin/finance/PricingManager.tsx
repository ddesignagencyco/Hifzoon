'use client';

import React, { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
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
  Tabs,
  TextInput,
  UiButton,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminPrices, useCreatePlan, useSetPrice, useUpdatePlan } from '@/hooks/useFinance';
import { useSetPlanTier } from '@/hooks/useTeacherTiers';
import { AdminPriceList, CURRENCIES, CurrencyCode, PlanInput } from '@/lib/api/modules/billing-admin';
import { useAdminRoles } from '../system/shared';

type Plan = AdminPriceList['plans'][number];
type Tier = AdminPriceList['tiers'][number];

/** Minor units → the text an admin edits ("71.00"); every listed currency has 2 decimals. */
const toMajor = (minor: number | undefined) => (minor === undefined ? '' : (minor / 100).toFixed(2));

/** "71" / "71.5" / "71.00" → 7100; null when empty; NaN when not a price. */
function toMinor(text: string): number | null {
  const t = text.trim().replace(/,/g, '');
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return Number.NaN;
  return Math.round(Number(t) * 100);
}

/**
 * `/admin/billing` — plans and prices (FR-OPS-05) with tier pricing: each plan has a
 * standard price and, optionally, a price per teacher tier, in every currency. The family
 * is charged the price for their teacher's tier, or the standard price.
 */
export function PricingManager() {
  const { isSuperAdmin, isAdmin } = useAdminRoles();
  const prices = useAdminPrices(isAdmin);
  const [currency, setCurrency] = useState<CurrencyCode>('GBP');
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);

  return (
    <Card className="mb-6">
      <CardHeader
        title="Plans & prices"
        description="The standard price applies to teachers without a tier, or when a tier has no price of its own. Price changes apply to new subscriptions and plan changes; families already subscribed keep their price."
        action={
          isSuperAdmin ? (
            <UiButton size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              New plan
            </UiButton>
          ) : undefined
        }
      />
      <CardBody className="px-0 sm:px-5">
        <div className="mb-3 px-5 sm:px-0">
          <Tabs
            value={currency}
            onChange={setCurrency}
            tabs={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </div>
        {!isSuperAdmin && (
          <Alert tone="neutral" className="mx-5 mb-4 sm:mx-0">
            Only a super admin can change prices and plans.
          </Alert>
        )}
        <QueryState query={prices} empty={<EmptyState title="No plans yet" />} isEmpty={(d) => d.plans.length === 0}>
          {(data) => (
            <PriceTable data={data} currency={currency} canEdit={isSuperAdmin} onEditPlan={setEditing} />
          )}
        </QueryState>
      </CardBody>
      {editing && <PlanModal plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function PriceTable({
  data,
  currency,
  canEdit,
  onEditPlan,
}: {
  data: AdminPriceList;
  currency: CurrencyCode;
  canEdit: boolean;
  onEditPlan: (plan: Plan) => void;
}) {
  const tiers = data.tiers.filter((t) => t.active);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-3 py-2 font-medium">Plan</th>
            <th className="px-3 py-2 font-medium">Standard</th>
            {tiers.map((t) => (
              <th key={t.id} className="px-3 py-2 font-medium">
                <TierHeading tier={t} />
              </th>
            ))}
            <th className="px-3 py-2 font-medium">
              Public page tier
              <span className="block text-[10px] font-normal">Shown instead of a price</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.plans.map((plan) => {
            const standard = plan.prices.find((p) => p.currency === currency)?.amountMinor;
            return (
              <tr key={plan.id} className={plan.active ? 'border-b border-line' : 'border-b border-line opacity-60'}>
                <td className="px-3 py-3 align-top">
                  <p className="flex items-center gap-2 font-medium text-ink">
                    {plan.name}
                    {!plan.active && <Badge>Hidden</Badge>}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onEditPlan(plan)}
                        className="rounded p-1 text-muted hover:bg-sand hover:text-ink"
                        aria-label={`Edit ${plan.name}`}
                        title="Edit plan"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </p>
                  <p className="text-[11px] text-muted">
                    {plan.classesPerWeek}×{plan.classMinutes} min · {humanize(plan.roomType)} · billed{' '}
                    {humanize(plan.billingPeriod).toLowerCase()}
                    {plan.liveSubscriptions > 0 ? ` · ${plan.liveSubscriptions} active` : ''}
                  </p>
                </td>
                <td className="px-3 py-3 align-top">
                  <PriceCell plan={plan} tierId={null} currency={currency} amountMinor={standard} canEdit={canEdit} />
                </td>
                {tiers.map((t) => (
                  <td key={t.id} className="px-3 py-3 align-top">
                    <PriceCell
                      plan={plan}
                      tierId={t.id}
                      currency={currency}
                      amountMinor={plan.tierPrices.find((p) => p.tierId === t.id && p.currency === currency)?.amountMinor}
                      fallback={standard}
                      canEdit={canEdit}
                    />
                  </td>
                ))}
                <td className="px-3 py-3 align-top">
                  <PublicTierCell plan={plan} tiers={data.tiers} canEdit={canEdit} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {tiers.length === 0 && (
        <p className="px-3 py-3 text-xs text-muted">
          No teacher tiers yet. Create tiers under Teachers → Teacher tiers and assign them to teachers to price by tier.
        </p>
      )}
    </div>
  );
}

/** The tier the public plans page shows for a plan (it never shows prices). */
function PublicTierCell({ plan, tiers, canEdit }: { plan: Plan; tiers: Tier[]; canEdit: boolean }) {
  const toast = useToast();
  const setTier = useSetPlanTier();
  const current = tiers.find((t) => t.id === plan.tierId);
  if (!canEdit) return <span className="text-xs text-ink-2">{current?.name ?? '—'}</span>;
  return (
    <Select
      aria-label={`Tier shown for ${plan.name} on the public plans page`}
      value={plan.tierId ?? ''}
      disabled={setTier.isPending}
      onChange={(e) =>
        setTier.mutate(
          { planId: plan.id, tierId: e.target.value || null },
          {
            onSuccess: () => toast.success(`${plan.name}: public tier updated`),
            onError: (error) => toast.error(error),
          },
        )
      }
      className="min-w-[9rem]"
    >
      <option value="">None</option>
      {tiers
        .filter((t) => t.active || t.id === plan.tierId)
        .map((t) => (
          <option key={t.id} value={t.id}>
            {t.badgeIcon ? `${t.badgeIcon} ` : ''}
            {t.name}
          </option>
        ))}
    </Select>
  );
}

function TierHeading({ tier }: { tier: Tier }) {
  return (
    <span className="whitespace-nowrap">
      {tier.badgeIcon ? `${tier.badgeIcon} ` : ''}
      {tier.name}
      <span className="block text-[10px] font-normal">{tier.teacherCount} teachers</span>
    </span>
  );
}

/** One price, edited in place: Enter or leaving the field saves; empty tier price = use standard. */
function PriceCell({
  plan,
  tierId,
  currency,
  amountMinor,
  fallback,
  canEdit,
}: {
  plan: Plan;
  tierId: string | null;
  currency: CurrencyCode;
  amountMinor: number | undefined;
  fallback?: number;
  canEdit: boolean;
}) {
  const toast = useToast();
  const setPrice = useSetPrice();
  const saved = toMajor(amountMinor);
  const [draft, setDraft] = useState(saved);
  const [syncedFrom, setSyncedFrom] = useState(saved);
  if (saved !== syncedFrom) {
    setSyncedFrom(saved);
    setDraft(saved);
  }
  const label = `${plan.name} ${tierId ? 'tier' : 'standard'} price in ${currency}`;

  if (!canEdit) {
    return (
      <span className="tabular-nums">
        {amountMinor !== undefined ? saved : <span className="text-muted">{tierId ? 'Standard' : '—'}</span>}
      </span>
    );
  }

  const save = () => {
    if (draft === saved) return;
    const minor = toMinor(draft);
    if (Number.isNaN(minor)) {
      toast.error('Enter a price like 71 or 71.50.');
      setDraft(saved);
      return;
    }
    if (minor === null && !tierId) {
      toast.error('A plan needs a standard price.');
      setDraft(saved);
      return;
    }
    if (minor === 0) {
      toast.error('A price must be above zero.');
      setDraft(saved);
      return;
    }
    setPrice.mutate(
      { planId: plan.id, tierId, currency, amountMinor: minor },
      {
        onSuccess: () =>
          toast.success(minor === null ? `${plan.name}: this tier now uses the standard price` : `${plan.name}: price saved`),
        onError: (error) => {
          toast.error(error);
          setDraft(saved);
        },
      },
    );
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted">{currency}</span>
      <input
        aria-label={label}
        inputMode="decimal"
        value={draft}
        placeholder={tierId ? (fallback !== undefined ? `${toMajor(fallback)} (std)` : 'Standard') : 'Not set'}
        disabled={setPrice.isPending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraft(saved);
        }}
        className="w-28 rounded-lg border border-line bg-white px-2 py-1.5 text-right tabular-nums text-ink placeholder:text-muted/70 focus:border-green-700 focus:outline-none focus:ring-2 focus:ring-gold/40"
      />
    </div>
  );
}

const EMPTY_PLAN: PlanInput = {
  code: '',
  name: '',
  classesPerWeek: 2,
  classMinutes: 30,
  roomType: 'ONE_TO_ONE',
  billingPeriod: 'MONTHLY',
};

/** New plan, or rename / show-hide (and reshape while nobody is subscribed). */
function PlanModal({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const toast = useToast();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const [form, setForm] = useState<PlanInput & { active: boolean }>(
    plan ? { ...plan } : { ...EMPTY_PLAN, active: true },
  );
  const locked = Boolean(plan && plan.liveSubscriptions > 0);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const pending = create.isPending || update.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return toast.error('Give the plan a name.');
    if (!plan && !/^[A-Za-z0-9_]{2,40}$/.test(form.code)) return toast.error('Code: letters, numbers and _ only.');
    const done = { onSuccess: () => (toast.success(plan ? 'Plan updated' : 'Plan created — now set its prices'), onClose()), onError: (err: unknown) => toast.error(err) };
    if (plan) {
      update.mutate(
        {
          planId: plan.id,
          body: locked
            ? { name: form.name, active: form.active }
            : {
                name: form.name,
                active: form.active,
                classesPerWeek: form.classesPerWeek,
                classMinutes: form.classMinutes,
                roomType: form.roomType,
                billingPeriod: form.billingPeriod,
              },
        },
        done,
      );
    } else {
      const { active: _active, ...body } = form;
      void _active;
      create.mutate(body, done);
    }
  };

  return (
    <Modal
      open
      size="md"
      onClose={pending ? () => undefined : onClose}
      title={plan ? `Edit ${plan.name}` : 'New plan'}
      footer={
        <>
          <UiButton variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </UiButton>
          <UiButton type="submit" form="plan-form" loading={pending}>
            {plan ? 'Save' : 'Create plan'}
          </UiButton>
        </>
      }
    >
      <form id="plan-form" onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="plan-name" className="sm:col-span-2">
          <TextInput id="plan-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="One-to-one, 3 classes/week" />
        </Field>
        {!plan && (
          <Field label="Code" htmlFor="plan-code" hint="Fixed once created, e.g. ONE_TO_ONE_3X_Q.">
            <TextInput id="plan-code" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />
          </Field>
        )}
        <Field label="Billed" htmlFor="plan-period">
          <Select id="plan-period" value={form.billingPeriod} disabled={locked} onChange={(e) => set('billingPeriod', e.target.value as PlanInput['billingPeriod'])}>
            <option value="MONTHLY">Every month</option>
            <option value="QUARTERLY">Every 3 months (prepaid)</option>
            <option value="HALF_YEARLY">Every 6 months (prepaid)</option>
          </Select>
        </Field>
        <Field label="Classes a week" htmlFor="plan-cpw">
          <TextInput
            id="plan-cpw"
            type="number"
            min={1}
            max={7}
            value={form.classesPerWeek}
            disabled={locked}
            onChange={(e) => set('classesPerWeek', Number(e.target.value))}
          />
        </Field>
        <Field label="Minutes per class" htmlFor="plan-min">
          <Select id="plan-min" value={form.classMinutes} disabled={locked} onChange={(e) => set('classMinutes', Number(e.target.value))}>
            {[30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Room" htmlFor="plan-room">
          <Select id="plan-room" value={form.roomType} disabled={locked} onChange={(e) => set('roomType', e.target.value as PlanInput['roomType'])}>
            <option value="ONE_TO_ONE">One to one</option>
            <option value="CIRCLE">Circle (group)</option>
          </Select>
        </Field>
        {plan && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="accent-green-800" />
            Offered to families (untick to hide it from new subscriptions)
          </label>
        )}
        {locked && (
          <p className="text-[11px] text-muted sm:col-span-2">
            Families are on this plan, so only the name and whether it is offered can change. Create a new plan for a
            different shape.
          </p>
        )}
      </form>
    </Modal>
  );
}
