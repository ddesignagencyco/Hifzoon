'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import {
  Alert, Card, CardBody, CardHeader, DataTable, EmptyState, Field, Modal, PageHeader, QueryState,
  StatTile, StatusBadge, TextInput, UiButton, formatDate, formatDateTime, formatMoney, humanize,
} from '@/components/ui/primitives';
import { TimezoneSelect } from '@/components/ui/TimezoneSelect';
import { BackLink } from '@/components/ui/BackLink';
import { useToast } from '@/components/ui/toast';
import { useFamilyDetail, useUpdateFamily } from '@/hooks/useOpsAdmin';
import { useMyPermissions } from '@/hooks/usePermissions';
import { FamilyDetail } from '@/lib/api/modules/ops-admin';
import { FamilyCredits } from '../finance/ClassCreditsConsole';

/** /admin/families/:id — one read of a family: guardians, children, plans, invoices, balances. */
export function FamilyDetailScreen({ familyId }: { familyId: string }) {
  const query = useFamilyDetail(familyId);
  const { can } = useMyPermissions();
  const [editing, setEditing] = useState(false);
  return (
    <QueryState query={query}>
      {(f) => (
        <>
          <BackLink fallback="/admin/users" />
          <PageHeader
            eyebrow="Family"
            title={f.name}
            description={[f.country, f.timeZone, f.billingName ? `Billing name: ${f.billingName}` : null].filter(Boolean).join(' · ') || undefined}
            actions={can('families.edit') ? (
              <UiButton variant="secondary" icon={<Pencil className="w-4 h-4" aria-hidden />} onClick={() => setEditing(true)}>Edit</UiButton>
            ) : undefined}
          />
          {f.deletedAt && <Alert tone="warning">This family has been deleted.</Alert>}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 my-4">
            <StatTile label="Class credits" value={f.balances.classCredits} />
            <StatTile label="Make-up credits" value={f.balances.availableMakeupCredits} />
            <StatTile label="Open invoices" value={f.balances.openInvoices} hint={f.balances.openInvoices ? formatMoney(f.balances.openInvoicesMinor, f.currency ?? 'USD') : undefined} />
            <StatTile label="Open data requests" value={f.balances.openDataRequests} />
            <StatTile label="Since" value={formatDate(f.createdAt)} />
          </div>
          <Sections family={f} />
          {editing && <EditFamilyModal family={f} onClose={() => setEditing(false)} />}
        </>
      )}
    </QueryState>
  );
}

function Sections({ family: f }: { family: FamilyDetail }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Guardians" />
        <CardBody>
          <DataTable paginate={false} rows={f.members} rowKey={(m) => m.id} empty={<EmptyState title="No guardians" />}
            columns={[
              { key: 'n', header: 'Name', render: (m) => <span className="font-medium text-ink">{m.user.name}{m.isPrimary ? ' (primary)' : ''}</span> },
              { key: 'r', header: 'Relationship', render: (m) => humanize(m.relationship) },
              { key: 'c', header: 'Contact', render: (m) => [m.user.email, m.user.phone].filter(Boolean).join(' · ') || '—' },
              { key: 's', header: 'Status', render: (m) => <StatusBadge status={m.user.status} /> },
              { key: 'l', header: 'Last active', render: (m) => (m.user.lastActiveAt ? formatDateTime(m.user.lastActiveAt) : 'Never') },
            ]} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Children" />
        <CardBody>
          <DataTable paginate={false} rows={f.students} rowKey={(s) => s.id} empty={<EmptyState title="No children" />}
            columns={[
              { key: 'n', header: 'Child', render: (s) => <Link className="font-medium text-green-800 hover:underline" href={`/admin/students/${s.id}`}>{s.displayName}</Link> },
              { key: 'b', header: 'Born', render: (s) => s.birthYear },
              { key: 'e', header: 'Enrolments', render: (s) => s.enrolments.map((e) => `${e.course.name}${e.teacher ? ` · ${e.teacher.user.name}` : ''} (${humanize(e.status)})`).join('; ') || '—' },
            ]} />
        </CardBody>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Subscriptions" description="Latest five" />
          <CardBody>
            <DataTable paginate={false} rows={f.subscriptions} rowKey={(s) => s.id} empty={<EmptyState title="No subscriptions" />}
              columns={[
                { key: 'p', header: 'Plan', render: (s) => s.plan.name },
                { key: 's', header: 'Status', render: (s) => <StatusBadge status={s.cancelAtPeriodEnd ? 'CANCELLING' : s.status} /> },
                { key: 'a', header: 'Amount', className: 'text-right tabular-nums', render: (s) => formatMoney(s.amountMinor, s.currency) },
                { key: 'e', header: 'Renews', render: (s) => (s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : '—') },
              ]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Invoices" description="Latest five" />
          <CardBody>
            <DataTable paginate={false} rows={f.invoices} rowKey={(i) => i.id} empty={<EmptyState title="No invoices" />}
              columns={[
                { key: 'n', header: 'Number', render: (i) => i.number },
                { key: 's', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
                { key: 't', header: 'Total', className: 'text-right tabular-nums', render: (i) => formatMoney(i.totalMinor, i.currency) },
                { key: 'd', header: 'Due', render: (i) => (i.dueAt ? formatDate(i.dueAt) : '—') },
              ]} />
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Class credits" />
        <CardBody><FamilyCredits family={{ id: f.id, name: f.name }} /></CardBody>
      </Card>
    </div>
  );
}

function EditFamilyModal({ family, onClose }: { family: FamilyDetail; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateFamily(family.id);
  const [name, setName] = useState(family.name);
  const [country, setCountry] = useState(family.country ?? '');
  const [timeZone, setTimeZone] = useState(family.timeZone ?? 'UTC');
  const [billingName, setBillingName] = useState(family.billingName ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { setError('Name must be at least 2 characters.'); return toast.error('Name must be at least 2 characters.'); }
    if (country && !/^[A-Za-z]{2}$/.test(country.trim())) { setError('Use a 2-letter country code.'); return toast.error('Use a 2-letter country code.'); }
    setError(null);
    update.mutate(
      { name: name.trim(), country: country.trim() ? country.trim().toUpperCase() : null, timeZone, billingName: billingName.trim() || null },
      { onSuccess: () => { toast.success('Family updated'); onClose(); }, onError: (err) => toast.error(err) },
    );
  };

  return (
    <Modal open onClose={() => (update.isPending ? undefined : onClose())} title="Edit family" size="sm">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Edit family">
        <Field label="Family name" htmlFor="fam-name" required error={error}><TextInput id="fam-name" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Country (2-letter code)" htmlFor="fam-country"><TextInput id="fam-country" value={country} maxLength={2} onChange={(e) => setCountry(e.target.value)} /></Field>
        <Field label="Time zone" htmlFor="fam-tz"><TimezoneSelect id="fam-tz" value={timeZone} onChange={setTimeZone} /></Field>
        <Field label="Billing name" htmlFor="fam-bill"><TextInput id="fam-bill" value={billingName} maxLength={160} onChange={(e) => setBillingName(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <UiButton variant="secondary" onClick={onClose} disabled={update.isPending}>Cancel</UiButton>
          <UiButton type="submit" loading={update.isPending}>Save</UiButton>
        </div>
      </form>
    </Modal>
  );
}
