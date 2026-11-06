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
  TextInput,
  UiButton,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminPrices, useCreatePlan, useSetPrice, useUpdatePlan } from '@/hooks/useFinance';
import { useSetPlanTier } from '@/hooks/useTeacherTiers';
import { AdminPriceList, PlanInput } from '@/lib/api/modules/billing-admin';
import { BILLING_CURRENCY } from '@/lib/api/modules/billing-family';
import { useAdminRoles } from '../system/shared';

type Plan = AdminPriceList['plans'][number];
type Tier = AdminPriceList['tiers'][number];

/** Cents → the text an admin edits ("71.00"). */
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
 * standard price and, optionally, a price per teacher tier, all in USD (Stripe shows the
 * family their local currency at checkout). The family is charged the price for their
 * teacher's tier, or the standard price.
 */
export function PricingManager() {
  const { isSuperAdmin, isAdmin } = useAdminRoles();
  const prices = useAdminPrices(isAdmin);
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);

  return (
    <Card className="mb-6">
      <CardHeader
        title="Plans & prices"
        description="Every price is in US dollars, per month; Stripe shows each family their local currency at checkout. A prepaid plan charges the monthly price × its months, less its period discount. The standard price applies to teachers without a tier, or when a tier has no price of its own. Price changes apply to new subscriptions and plan changes; families already subscribed keep their price."
        action={
          isSuperAdmin ? (
            <UiButton size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              New plan
            </UiButton>
          ) : undefined
        }
      />
      <CardBody className="px-0 sm:px-5">
        {!isSuperAdmin && (
          <Alert tone="neutral" className="mx-5 mb-4 sm:mx-0">
            Only a super admin can change prices and plans.
          </Alert>
        )}
        <QueryState query={prices} empty={<EmptyState title="No plans yet" />} isEmpty={(d) => d.plans.length === 0}>
          {(data) => (
            <PriceTable data={data} canEdit={isSuperAdmin} onEditPlan={setEditing} />
          )}
        </QueryState>
      </CardBody>
      {editing && <PlanModal plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function PriceTable({
  data,
  canEdit,
  onEditPlan,
}: {
  data: AdminPriceList;
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
            <th className="px-3 py-2 font-medium">
              Standard
              <span className="block text-[10px] font-normal">{BILLING_CURRENCY} per month</span>
            </th>
            {tiers.map((t) => (
              <th key={t.id} className="px-3 py-2 font-medium">
                <TierHeading tier={t} />
              </th>
            ))}
            <th className="px-3 py-2 font-medium">
              Public page tier
              <span className="block text-[10px] font-normal">Shown instead of a price</span>
            </th>
            {canEdit && <th className="px-3 py-2 font-medium" aria-label="Save" />}
          </tr>
        </thead>
        <tbody>
          {data.plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} tiers={tiers} allTiers={data.tiers} canEdit={canEdit} onEditPlan={onEditPlan} />
          ))}
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

/**
 * One plan, priced in USD. The admin edits its prices and the public page tier, then saves the
 * row with its own Save button (nothing is saved while typing). An empty tier price means the
 * tier uses the standard price.
 */
function PlanRow({
  plan,
  tiers,
  allTiers,
  canEdit,
  onEditPlan,
}: {
  plan: Plan;
  tiers: Tier[];
  allTiers: Tier[];
  canEdit: boolean;
  onEditPlan: (plan: Plan) => void;
}) {
  const toast = useToast();
  const setPrice = useSetPrice();
  const setTier = useSetPlanTier();
  const standard = plan.prices[0]?.amountMinor;
  const tierPrice = (tierId: string) => plan.tierPrices.find((p) => p.tierId === tierId)?.amountMinor;

  // What is saved now, keyed '' for the standard price and the tier id for a tier price.
  const saved: Record<string, string> = { '': toMajor(standard) };
  for (const t of tiers) saved[t.id] = toMajor(tierPrice(t.id));
  const savedTier = plan.tierId ?? '';
  const savedKey = JSON.stringify([saved, savedTier]);

  const [drafts, setDrafts] = useState(saved);
  const [tierDraft, setTierDraft] = useState(savedTier);
  const [syncedFrom, setSyncedFrom] = useState(savedKey);
  const [saving, setSaving] = useState(false);
  if (savedKey !== syncedFrom) {
    setSyncedFrom(savedKey);
    setDrafts(saved);
    setTierDraft(savedTier);
  }

  const changedPrices = Object.keys(saved).filter((k) => (drafts[k] ?? '') !== saved[k]);
  const tierChanged = tierDraft !== savedTier;
  const dirty = changedPrices.length > 0 || tierChanged;

  const save = async () => {
    const updates: Array<{ tierId: string | null; amountMinor: number | null }> = [];
    for (const k of changedPrices) {
      const minor = toMinor(drafts[k] ?? '');
      if (Number.isNaN(minor)) return toast.error('Enter a price like 71 or 71.50.');
      if (minor === null && k === '') return toast.error('A plan needs a standard price.');
      if (minor === 0) return toast.error('A price must be above zero.');
      updates.push({ tierId: k || null, amountMinor: minor });
    }
    setSaving(true);
    try {
      for (const u of updates) await setPrice.mutateAsync({ planId: plan.id, ...u });
      if (tierChanged) await setTier.mutateAsync({ planId: plan.id, tierId: tierDraft || null });
      toast.success(`${plan.name}: saved`);
    } catch (error) {
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  const currentTier = allTiers.find((t) => t.id === plan.tierId);

  return (
    <tr className={plan.active ? 'border-b border-line' : 'border-b border-line opacity-60'}>
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
        {plan.billingPeriod !== 'MONTHLY' && plan.periodDiscountPercent > 0 && (
          <Badge tone="gold" className="mt-1">
            {plan.periodDiscountPercent}% off for paying ahead
          </Badge>
        )}
      </td>
      {['', ...tiers.map((t) => t.id)].map((k) => (
        <td key={k || 'standard'} className="px-3 py-3 align-top">
          <PriceInput
            label={`${plan.name} ${k ? 'tier' : 'standard'} price in ${BILLING_CURRENCY}`}
            value={drafts[k] ?? ''}
            placeholder={k ? (standard !== undefined ? `${toMajor(standard)} (std)` : 'Standard') : 'Not set'}
            canEdit={canEdit}
            disabled={saving}
            onChange={(v) => setDrafts((d) => ({ ...d, [k]: v }))}
            onEnter={() => dirty && void save()}
          />
        </td>
      ))}
      <td className="px-3 py-3 align-top">
        {canEdit ? (
          <Select
            aria-label={`Tier shown for ${plan.name} on the public plans page`}
            value={tierDraft}
            disabled={saving}
            onChange={(e) => setTierDraft(e.target.value)}
            className="min-w-[9rem]"
          >
            <option value="">None</option>
            {allTiers
              .filter((t) => t.active || t.id === plan.tierId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.badgeIcon ? `${t.badgeIcon} ` : ''}
                  {t.name}
                </option>
              ))}
          </Select>
        ) : (
          <span className="text-xs text-ink-2">{currentTier?.name ?? '—'}</span>
        )}
      </td>
      {canEdit && (
        <td className="px-3 py-3 align-top">
          <div className="flex items-center gap-2">
            <UiButton size="sm" onClick={() => void save()} disabled={!dirty || saving} aria-label={`Save ${plan.name}`}>
              {saving ? 'Saving…' : 'Save'}
            </UiButton>
            {dirty && !saving && (
              <button
                type="button"
                onClick={() => {
                  setDrafts(saved);
                  setTierDraft(savedTier);
                }}
                className="text-xs font-semibold text-muted hover:text-ink"
              >
                Undo
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
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

/** One price field in a plan row; the row's Save button saves it. */
function PriceInput({
  label,
  value,
  placeholder,
  canEdit,
  disabled,
  onChange,
  onEnter,
}: {
  label: string;
  value: string;
  placeholder: string;
  canEdit: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onEnter: () => void;
}) {
  if (!canEdit) {
    return <span className="tabular-nums">{value || <span className="text-muted">{placeholder}</span>}</span>;
  }
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted">{BILLING_CURRENCY}</span>
      <input
        aria-label={label}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter();
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
  periodDiscountPercent: 0,
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
    const discount = form.billingPeriod === 'MONTHLY' ? 0 : (form.periodDiscountPercent ?? 0);
    if (!Number.isInteger(discount) || discount < 0 || discount > 50) {
      return toast.error('The period discount is a whole number from 0 to 50.');
    }
    const done = { onSuccess: () => (toast.success(plan ? 'Plan updated' : 'Plan created — now set its prices'), onClose()), onError: (err: unknown) => toast.error(err) };
    if (plan) {
      update.mutate(
        {
          planId: plan.id,
          // The period discount only prices new subscriptions, so it stays editable.
          body: locked
            ? { name: form.name, active: form.active, periodDiscountPercent: discount }
            : {
                name: form.name,
                active: form.active,
                classesPerWeek: form.classesPerWeek,
                classMinutes: form.classMinutes,
                roomType: form.roomType,
                billingPeriod: form.billingPeriod,
                periodDiscountPercent: discount,
              },
        },
        done,
      );
    } else {
      const { active: _active, ...body } = form;
      void _active;
      create.mutate({ ...body, periodDiscountPercent: discount }, done);
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
        {form.billingPeriod !== 'MONTHLY' && (
          <Field
            label="Discount for paying ahead"
            htmlFor="plan-period-discount"
            hint="0–50%, off the monthly price × months. Applies to new subscriptions."
          >
            <TextInput
              id="plan-period-discount"
              type="number"
              min={0}
              max={50}
              step={1}
              value={form.periodDiscountPercent ?? 0}
              onChange={(e) => set('periodDiscountPercent', Number(e.target.value))}
            />
          </Field>
        )}
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
            Families are on this plan, so only the name, the discount for paying ahead and whether it is offered can
            change. Create a new plan for a different shape.
          </p>
        )}
      </form>
    </Modal>
  );
}
