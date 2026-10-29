'use client';

import React, { useState } from 'react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Modal,
  QueryState,
  TextArea,
  TextInput,
  UiButton,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useCreateTeacherTier, useTeacherTiers, useUpdateTeacherTier } from '@/hooks/useTeacherTiers';
import type { TeacherTier } from '@/lib/api/modules/backend-updates-oct2026';
import { TeacherTierBadge } from '@/components/shared/TeacherTierBadge';

interface TierForm {
  code: string;
  name: string;
  badgeIcon: string;
  description: string;
  sortOrder: string;
}

const EMPTY: TierForm = { code: '', name: '', badgeIcon: '', description: '', sortOrder: '' };

/** Mirrors Create/UpdateTeacherTierDto: code 2–40, name 2–120, icon ≤120, description ≤2000, integer order. */
export function validateTierForm(form: TierForm, isNew: boolean): Partial<Record<keyof TierForm, string>> {
  const errors: Partial<Record<keyof TierForm, string>> = {};
  if (isNew) {
    const code = form.code.trim();
    if (code.length < 2 || code.length > 40) errors.code = 'Code must be 2–40 characters.';
    else if (!/^[A-Z0-9_]+$/.test(code)) errors.code = 'Use capital letters, numbers and underscores, e.g. SENIOR.';
  }
  const name = form.name.trim();
  if (name.length < 2 || name.length > 120) errors.name = 'Name must be 2–120 characters.';
  if (form.badgeIcon.length > 120) errors.badgeIcon = 'Keep the badge to 120 characters.';
  if (form.description.length > 2000) errors.description = 'Keep the description to 2000 characters.';
  if (form.sortOrder.trim() && !/^-?\d+$/.test(form.sortOrder.trim())) errors.sortOrder = 'Order must be a whole number.';
  return errors;
}

/** `/admin/teachers` → Teacher tiers: the catalogue a teacher's tier and a plan's promise come from. */
export function TeacherTiersCatalogue() {
  const { isStaffAdmin } = useAdminRoles();
  const tiers = useTeacherTiers();
  const update = useUpdateTeacherTier();
  const toast = useToast();
  const [editing, setEditing] = useState<TeacherTier | 'new' | null>(null);

  const toggleActive = (tier: TeacherTier) =>
    update.mutate(
      { id: tier.id, body: { active: !tier.active } },
      {
        onSuccess: () => toast.success(tier.active ? `${tier.name} hidden from new assignments` : `${tier.name} is active again`),
        onError: (err) => toast.error(err),
      },
    );

  return (
    <Card>
      <CardHeader
        title="Teacher tiers"
        description="Tiers are admin-maintained badges. Assign one to each teacher, and link each plan to the tier it guarantees in Finance → Billing."
        action={
          isStaffAdmin ? (
            <UiButton size="sm" onClick={() => setEditing('new')}>
              Add tier
            </UiButton>
          ) : undefined
        }
      />
      <CardBody>
        <QueryState query={tiers} loadingLabel="Loading tiers…" empty={<EmptyState title="No tiers yet" description="Add the first tier to start badging teachers." />}>
          {(rows) => (
            <ul className="divide-y divide-line">
              {[...rows]
                .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                .map((tier) => (
                  <li key={tier.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <TeacherTierBadge tier={tier} size="sm" />
                        <span className="text-[11px] font-mono text-muted">{tier.code}</span>
                        {!tier.active && <Badge tone="neutral">Inactive</Badge>}
                      </div>
                      {tier.description && <p className="text-xs text-muted mt-1 max-w-xl">{tier.description}</p>}
                    </div>
                    {isStaffAdmin && (
                      <div className="flex gap-2">
                        <UiButton size="sm" variant="secondary" onClick={() => setEditing(tier)}>
                          Edit
                        </UiButton>
                        <UiButton size="sm" variant="ghost" onClick={() => toggleActive(tier)} disabled={update.isPending}>
                          {tier.active ? 'Deactivate' : 'Reactivate'}
                        </UiButton>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </QueryState>
      </CardBody>
      {editing && <TierEditor tier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function TierEditor({ tier, onClose }: { tier: TeacherTier | null; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateTeacherTier();
  const update = useUpdateTeacherTier();
  const pending = create.isPending || update.isPending;
  const [form, setForm] = useState<TierForm>(
    tier
      ? {
          code: tier.code,
          name: tier.name,
          badgeIcon: tier.badgeIcon ?? '',
          description: tier.description ?? '',
          sortOrder: String(tier.sortOrder),
        }
      : EMPTY,
  );
  const [errors, setErrors] = useState<Partial<Record<keyof TierForm, string>>>({});
  const set = (key: keyof TierForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateTierForm(form, !tier);
    setErrors(found);
    if (Object.keys(found).length) return;
    const sortOrder = form.sortOrder.trim() ? Number(form.sortOrder.trim()) : undefined;
    const done = { onSuccess: () => { toast.success(tier ? 'Tier updated' : 'Tier added'); onClose(); }, onError: (err: unknown) => toast.error(err) };
    if (tier) {
      update.mutate(
        {
          id: tier.id,
          body: {
            name: form.name.trim(),
            badgeIcon: form.badgeIcon.trim(),
            description: form.description.trim(),
            ...(sortOrder !== undefined ? { sortOrder } : {}),
          },
        },
        done,
      );
    } else {
      create.mutate(
        {
          code: form.code.trim(),
          name: form.name.trim(),
          ...(form.badgeIcon.trim() ? { badgeIcon: form.badgeIcon.trim() } : {}),
          ...(form.description.trim() ? { description: form.description.trim() } : {}),
          ...(sortOrder !== undefined ? { sortOrder } : {}),
        },
        done,
      );
    }
  };

  return (
    <Modal
      open
      onClose={pending ? () => undefined : onClose}
      title={tier ? `Edit ${tier.name}` : 'Add a teacher tier'}
      footer={
        <>
          <UiButton variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </UiButton>
          <UiButton type="submit" form="tier-form" loading={pending}>
            {tier ? 'Save' : 'Add tier'}
          </UiButton>
        </>
      }
    >
      <form id="tier-form" onSubmit={submit} noValidate className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Code" htmlFor="tier-code" required={!tier} hint={tier ? 'The code cannot change.' : 'e.g. SENIOR'} error={errors.code}>
            <TextInput id="tier-code" value={form.code} disabled={Boolean(tier)} maxLength={40} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
          </Field>
          <Field label="Name" htmlFor="tier-name" required error={errors.name}>
            <TextInput id="tier-name" value={form.name} maxLength={120} onChange={set('name')} />
          </Field>
          <Field label="Badge icon" htmlFor="tier-icon" hint="An emoji or short symbol" error={errors.badgeIcon}>
            <TextInput id="tier-icon" value={form.badgeIcon} maxLength={120} onChange={set('badgeIcon')} />
          </Field>
          <Field label="Display order" htmlFor="tier-order" hint="Lower comes first" error={errors.sortOrder}>
            <TextInput id="tier-order" inputMode="numeric" value={form.sortOrder} onChange={set('sortOrder')} />
          </Field>
        </div>
        <Field label="Description" htmlFor="tier-desc" hint="Shown to families on the plans page" error={errors.description}>
          <TextArea id="tier-desc" value={form.description} maxLength={2000} onChange={set('description')} />
        </Field>
      </form>
    </Modal>
  );
}
