'use client';

import React, { useState } from 'react';
import { Gift, Undo2 } from 'lucide-react';
import {
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  QueryState,
  StatTile,
  TextArea,
  TextInput,
  UiButton,
  formatDateTime,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminSearch } from '@/hooks/useAdminConsole';
import { useClassCredits, useIssueClassCredit, useRevokeClassCredit } from '@/hooks/useFinance';
import { useMyPermissions } from '@/hooks/usePermissions';
import { MAX_CLASS_CREDIT } from '@/lib/api/modules/billing-admin';
import { newIdempotencyKey } from '@/lib/api/http';

/** /admin/class-credits — complimentary classes per family: balance, history, give and revoke. */
export function ClassCreditsConsole() {
  const [term, setTerm] = useState('');
  const [family, setFamily] = useState<{ id: string; name: string } | null>(null);
  const search = useAdminSearch(term, 'families', 8, 1, !family);

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Class credits"
        description="Give a family complimentary classes, see what they have been given, or remove a grant made by mistake."
      />
      {!family ? (
        <Card>
          <CardHeader title="Find a family" description="Search by family name, guardian name or email." />
          <CardBody>
            <div className="max-w-md">
              <Field label="Family" htmlFor="cc-search">
                <TextInput
                  id="cc-search"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="At least 2 characters"
                  autoFocus
                />
              </Field>
            </div>
            {term.trim().length >= 2 && (
              <div className="mt-4">
                <QueryState query={search} empty={<EmptyState title="No families match" />} isEmpty={(d) => d.items.length === 0}>
                  {(res) => (
                    <ul className="divide-y divide-line rounded-xl border border-line bg-white">
                      {res.items.map((f) => (
                        <li key={f.id}>
                          <button
                            type="button"
                            className="w-full text-left px-4 py-3 hover:bg-sand cursor-pointer"
                            onClick={() => setFamily({ id: f.id, name: f.name })}
                          >
                            <span className="font-medium text-ink">{f.name}</span>
                            <span className="block text-xs text-muted">
                              {f.members.map((m) => m.user.name).join(', ') || 'No guardians'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </QueryState>
              </div>
            )}
          </CardBody>
        </Card>
      ) : (
        <FamilyCredits family={family} onBack={() => setFamily(null)} />
      )}
    </>
  );
}

/** Reusable panel: one family's balance and history, with give / revoke actions. */
export function FamilyCredits({ family, onBack }: { family: { id: string; name: string }; onBack?: () => void }) {
  const credits = useClassCredits(family.id);
  const { can } = useMyPermissions();
  const [giving, setGiving] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink font-sans">{family.name}</h2>
        <div className="flex gap-2">
          {onBack && (
            <UiButton variant="secondary" onClick={onBack}>
              Choose another family
            </UiButton>
          )}
          {can('billing.classCredit.issue') && (
            <UiButton icon={<Gift className="w-4 h-4" aria-hidden />} onClick={() => setGiving(true)}>
              Give classes
            </UiButton>
          )}
        </div>
      </div>
      <QueryState query={credits}>
        {(data) => (
          <>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <StatTile label="Credit balance (classes)" value={String(data.totalClasses)} />
              <StatTile label="Grants" value={String(data.credits.length)} />
            </div>
            <DataTable
              rows={data.credits}
              rowKey={(c) => c.id}
              empty={<EmptyState title="No credits given yet" />}
              columns={[
                { key: 'when', header: 'Given', render: (c) => formatDateTime(c.createdAt) },
                { key: 'n', header: 'Classes', className: 'tabular-nums', render: (c) => c.amountClasses },
                { key: 'reason', header: 'Reason', render: (c) => c.reason },
                { key: 'by', header: 'Given by', render: (c) => c.issuedBy ?? '—' },
                ...(can('billing.classCredit.revoke')
                  ? [
                      {
                        key: 'actions',
                        header: <span className="sr-only">Actions</span>,
                        className: 'text-right',
                        render: (c: { id: string }) => (
                          <UiButton
                            size="sm"
                            variant="secondary"
                            icon={<Undo2 className="w-3.5 h-3.5" aria-hidden />}
                            onClick={() => setRevoking(c.id)}
                          >
                            Revoke
                          </UiButton>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </>
        )}
      </QueryState>
      {giving && <GiveModal family={family} onClose={() => setGiving(false)} />}
      {revoking && <RevokeModal creditId={revoking} familyId={family.id} onClose={() => setRevoking(null)} />}
    </div>
  );
}

function GiveModal({ family, onClose }: { family: { id: string; name: string }; onClose: () => void }) {
  const toast = useToast();
  const issue = useIssueClassCredit();
  // One key per confirm dialog, so a double-click or retry cannot give the classes twice.
  const [key] = useState(newIdempotencyKey);
  const [amount, setAmount] = useState('1');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    const next: typeof errors = {};
    if (!Number.isInteger(n) || n < 1 || n > MAX_CLASS_CREDIT) next.amount = `Enter a whole number from 1 to ${MAX_CLASS_CREDIT}.`;
    if (reason.trim().length < 3) next.reason = 'Give a reason (at least 3 characters).';
    setErrors(next);
    if (next.amount || next.reason) return toast.error(next.amount ?? next.reason ?? 'Please fix the highlighted fields');
    issue.mutate(
      { body: { familyId: family.id, amountClasses: n, reason: reason.trim() }, idempotencyKey: key },
      {
        onSuccess: () => {
          toast.success(`${n} class${n === 1 ? '' : 'es'} given to ${family.name}`);
          onClose();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <Modal open onClose={() => (issue.isPending ? undefined : onClose())} title="Give classes" description={family.name} size="sm">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Give class credits">
        <Field label="Number of classes" htmlFor="cc-amount" required error={errors.amount}>
          <TextInput id="cc-amount" type="number" min={1} max={MAX_CLASS_CREDIT} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Reason" htmlFor="cc-reason" required error={errors.reason} hint="Kept in the audit log.">
          <TextArea id="cc-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <UiButton variant="secondary" onClick={onClose} disabled={issue.isPending}>
            Cancel
          </UiButton>
          <UiButton type="submit" loading={issue.isPending}>
            Give classes
          </UiButton>
        </div>
      </form>
    </Modal>
  );
}

function RevokeModal({ creditId, familyId, onClose }: { creditId: string; familyId: string; onClose: () => void }) {
  const toast = useToast();
  const revoke = useRevokeClassCredit();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError('Give a reason (at least 3 characters).');
      return toast.error('Give a reason (at least 3 characters).');
    }
    revoke.mutate(
      { id: creditId, familyId, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success('Credit revoked');
          onClose();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <Modal open onClose={() => (revoke.isPending ? undefined : onClose())} title="Revoke this credit?" description="Use this for a grant made by mistake. The row is removed and the reason is audited." size="sm">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Revoke class credit">
        <Field label="Reason" htmlFor="cc-revoke-reason" required error={error}>
          <TextArea id="cc-revoke-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <UiButton variant="secondary" onClick={onClose} disabled={revoke.isPending}>
            Cancel
          </UiButton>
          <UiButton type="submit" variant="danger" loading={revoke.isPending}>
            Revoke credit
          </UiButton>
        </div>
      </form>
    </Modal>
  );
}
