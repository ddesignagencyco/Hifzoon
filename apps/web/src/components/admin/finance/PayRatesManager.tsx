'use client';

import React, { useState } from 'react';
import { Pencil, Plus, Power } from 'lucide-react';
import {
  Badge,
  DataTable,
  EmptyState,
  Field,
  Modal,
  QueryState,
  Select,
  TextInput,
  UiButton,
  formatMoney,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { usePayRates, useSavePayRate } from '@/hooks/useFinance';
import {
  PAY_RATE_CLASS_TYPES,
  PayRate,
  PayRateClassType,
  formatPeriodDate,
  validatePayRate,
} from '@/lib/api/modules/payroll-admin';

const today = () => new Date().toISOString().slice(0, 10);

/** Pay rates: list (with switched-off ones on request), create, edit and switch on/off (FR-BIL). */
export function PayRatesManager({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [showInactive, setShowInactive] = useState(false);
  const rates = usePayRates(showInactive);
  const save = useSavePayRate();
  const [editing, setEditing] = useState<PayRate | 'new' | null>(null);

  const toggle = (rate: PayRate) =>
    save.mutate(
      { kind: 'active', id: rate.id, active: !rate.active },
      {
        onSuccess: () => toast.success(`${rate.name} switched ${rate.active ? 'off' : 'on'}`),
        // 409 when teachers are still on the rate: the API message carries the count.
        onError: (err) => toast.error(err),
      },
    );

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-ink font-sans">Pay rates</h2>
          <p className="text-xs text-muted mt-1 mb-3">
            Applied per completed class. An edit only affects periods calculated from now on.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show switched-off
          </label>
          {canManage && (
            <UiButton size="sm" icon={<Plus className="w-3.5 h-3.5" aria-hidden />} onClick={() => setEditing('new')}>
              New rate
            </UiButton>
          )}
        </div>
      </div>
      <QueryState
        query={rates}
        empty={<EmptyState className="rounded-xl border border-line bg-white" title="No pay rates" />}
      >
        {(rows) => (
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              {
                key: 'name',
                header: 'Rate',
                render: (r) => (
                  <span className="font-medium text-ink">
                    {r.name} {!r.active && <Badge tone="neutral">Off</Badge>}
                  </span>
                ),
              },
              { key: 'type', header: 'Class type', render: (r) => (r.classType ? humanize(r.classType) : 'Any') },
              {
                key: 'amount',
                header: 'Per class',
                className: 'text-right tabular-nums whitespace-nowrap',
                render: (r) => formatMoney(r.ratePerClassMinor, r.currency),
              },
              { key: 'from', header: 'Effective from', render: (r) => formatPeriodDate(r.effectiveFrom) },
              { key: 'teachers', header: 'Teachers', className: 'tabular-nums', render: (r) => r._count?.teachers ?? '—' },
              ...(canManage
                ? [
                    {
                      key: 'actions',
                      header: <span className="sr-only">Actions</span>,
                      className: 'text-right whitespace-nowrap',
                      render: (r: PayRate) => (
                        <div className="inline-flex gap-1">
                          <UiButton
                            size="sm"
                            variant="secondary"
                            icon={<Pencil className="w-3.5 h-3.5" aria-hidden />}
                            onClick={() => setEditing(r)}
                            aria-label={`Edit ${r.name}`}
                          >
                            Edit
                          </UiButton>
                          <UiButton
                            size="sm"
                            variant="secondary"
                            icon={<Power className="w-3.5 h-3.5" aria-hidden />}
                            onClick={() => toggle(r)}
                            disabled={save.isPending}
                            aria-label={`${r.active ? 'Switch off' : 'Switch on'} ${r.name}`}
                          >
                            {r.active ? 'Switch off' : 'Switch on'}
                          </UiButton>
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </QueryState>
      {editing && <RateModal rate={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function RateModal({ rate, onClose }: { rate: PayRate | null; onClose: () => void }) {
  const toast = useToast();
  const save = useSavePayRate();
  const [form, setForm] = useState({
    name: rate?.name ?? '',
    currency: rate?.currency ?? 'USD',
    amount: rate ? String(rate.ratePerClassMinor / 100) : '',
    classType: (rate?.classType ?? '') as PayRateClassType | '',
    effectiveFrom: rate ? rate.effectiveFrom.slice(0, 10) : today(),
  });
  const [errors, setErrors] = useState<ReturnType<typeof validatePayRate>>({});
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validatePayRate(form);
    setErrors(next);
    if (Object.keys(next).length > 0) return toast.error(Object.values(next)[0] ?? 'Please fix the highlighted fields');
    const body = {
      name: form.name.trim(),
      currency: form.currency.trim().toUpperCase(),
      ratePerClassMinor: Math.round(Number(form.amount) * 100),
      classType: form.classType || null,
      effectiveFrom: form.effectiveFrom,
    };
    save.mutate(rate ? { kind: 'update', id: rate.id, body } : { kind: 'create', body }, {
      onSuccess: () => {
        toast.success(rate ? 'Pay rate updated' : 'Pay rate created');
        onClose();
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <Modal open onClose={() => (save.isPending ? undefined : onClose())} title={rate ? 'Edit pay rate' : 'New pay rate'} size="sm">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Pay rate">
        <Field label="Name" htmlFor="rate-name" required error={errors.name}>
          <TextInput id="rate-name" value={form.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount per class" htmlFor="rate-amount" required error={errors.amount}>
            <TextInput id="rate-amount" inputMode="decimal" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
          </Field>
          <Field label="Currency" htmlFor="rate-currency" required error={errors.currency}>
            <TextInput id="rate-currency" value={form.currency} maxLength={3} onChange={(e) => set({ currency: e.target.value })} />
          </Field>
        </div>
        <Field label="Class type" htmlFor="rate-type" hint="Leave on “Any” to apply to every class type.">
          <Select id="rate-type" value={form.classType} onChange={(e) => set({ classType: e.target.value as PayRateClassType | '' })}>
            <option value="">Any</option>
            {PAY_RATE_CLASS_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Effective from" htmlFor="rate-from" required error={errors.effectiveFrom}>
          <TextInput id="rate-from" type="date" value={form.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <UiButton variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </UiButton>
          <UiButton type="submit" loading={save.isPending}>
            {rate ? 'Save changes' : 'Create rate'}
          </UiButton>
        </div>
      </form>
    </Modal>
  );
}
