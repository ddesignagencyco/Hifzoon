'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Download, FileDown, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  QueryState,
  Select,
  StatTile,
  StatusBadge,
  UiButton,
  formatDate,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useCreateDataRequest, useDataRequests, usePrivacySummary } from '@/hooks/useFamilyConsent';
import { CONSENT_PURPOSES, DataRequestRecord, DataRequestType, PrivacySummary } from '@/lib/api/modules/consent';
import { FamilySwitcher, WithActiveFamily } from './shared';
import { Onboarding } from './Onboarding';
import { GuardianVerification, GuardiansCard } from './GuardianPanels';

/** `/parent/privacy` — verification, privacy summary, consents and CR-05 data requests. */
export function PrivacyScreen() {
  return (
    <WithActiveFamily onNoFamily={<Onboarding familyId={null} membership={null} />}>
      {({ familyId, membership }) => <PrivacyForFamily key={familyId} familyId={familyId} membership={membership} />}
    </WithActiveFamily>
  );
}

function PrivacyForFamily({
  familyId,
  membership,
}: {
  familyId: string;
  membership: { verifiedAt: string | null; isPrimary: boolean } | null;
}) {
  const summary = usePrivacySummary(familyId);
  return (
    <>
      <PageHeader
        title="Privacy & consent"
        description="See what we hold about your family, manage consent and request a copy or deletion of your data."
        actions={<FamilySwitcher />}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader title="Consent overview" description="Current consent per child. Change it from each child’s Consent tab." />
            <CardBody>
              <QueryState query={summary} isEmpty={(s) => s.students.length === 0} empty={<EmptyState title="No children yet" />}>
                {(s) => <ConsentMatrix summary={s} />}
              </QueryState>
            </CardBody>
          </Card>
          <DataRequestsCard familyId={familyId} students={summary.data?.students ?? []} />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Your verification" />
            <CardBody>
              <GuardianVerification
                familyId={familyId}
                verifiedAt={membership?.verifiedAt ?? null}
                isPrimary={membership?.isPrimary ?? false}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Guardians" description="Verification status of everyone in the family." />
            <CardBody>
              <GuardiansCard familyId={familyId} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Privacy summary" />
            <CardBody>
              <QueryState query={summary}>
                {(s) => (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <StatTile label="Children" value={s.students.length} />
                      <StatTile label="Consent records" value={s.consents.length} />
                      <StatTile label="Data requests" value={s.requests.length} />
                    </div>
                    <p className="text-[11px] text-muted">Generated {formatDateTime(s.generatedAt)}</p>
                  </div>
                )}
              </QueryState>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

export function ConsentMatrix({ summary }: { summary: PrivacySummary }) {
  return (
    <div className="space-y-5">
      {summary.students.map((student) => {
        const rows = summary.consents.filter((c) => c.studentId === student.id);
        return (
          <section key={student.id} aria-label={`Consent for ${student.displayName}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-ink font-sans">
                {student.displayName} <span className="text-xs font-normal text-muted">born {student.birthYear}</span>
              </h3>
              <Link href={`/parent/children/${student.id}?tab=consent`} className="text-xs font-semibold text-green-700 hover:underline">
                Manage
              </Link>
            </div>
            <ul className="grid sm:grid-cols-2 gap-2">
              {CONSENT_PURPOSES.map((p) => {
                const row = rows.find((r) => r.purpose === p.purpose);
                const granted = row?.status === 'GRANTED';
                return (
                  <li key={p.purpose} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-xs text-ink">{p.label}</span>
                      <span className="block text-[11px] text-muted">
                        {row
                          ? granted
                            ? `Given ${formatDate(row.grantedAt)} · ${humanize(row.method)} · ${row.policyVersion}`
                            : `Withdrawn ${formatDate(row.withdrawnAt)}`
                          : 'Never given'}
                      </span>
                    </span>
                    <Badge tone={granted ? 'green' : 'neutral'}>{granted ? 'Allowed' : 'Off'}</Badge>
                    {row && row.events.length > 0 && <ConsentHistory events={row.events} />}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Every grant / withdrawal for one purpose, newest first (CR-05 transparency). */
function ConsentHistory({ events }: { events: PrivacySummary['consents'][number]['events'] }) {
  const ordered = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <details className="basis-full text-[11px] text-muted">
      <summary className="cursor-pointer text-green-800 hover:underline w-fit">
        History ({ordered.length})
      </summary>
      <ol className="mt-1.5 space-y-1 border-l border-line pl-3">
        {ordered.map((e) => (
          <li key={e.id}>
            <span className="text-ink">{formatDateTime(e.createdAt)}</span> · {humanize(e.fromStatus)} → {humanize(e.toStatus)}
            {e.reason ? <span className="block italic">“{e.reason}”</span> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

function DataRequestsCard({ familyId, students }: { familyId: string; students: PrivacySummary['students'] }) {
  const toast = useToast();
  const requests = useDataRequests(familyId);
  const create = useCreateDataRequest(familyId);
  const [type, setType] = useState<DataRequestType>('EXPORT');
  const [studentId, setStudentId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const scopeLabel = studentId ? students.find((s) => s.id === studentId)?.displayName ?? 'this child' : 'the whole family';

  const send = () => {
    create.mutate(
      { type, studentId: studentId || undefined },
      {
        onSuccess: (res) => {
          toast.success(
            `${type === 'EXPORT' ? 'Export' : 'Deletion'} request received. We’ll complete it by ${formatDate(res.dueAt)}.`,
          );
          setConfirmDelete(false);
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'DELETE') setConfirmDelete(true);
    else send();
  };

  return (
    <Card>
      <CardHeader title="Your data" description="Ask for a copy of your data or for it to be deleted. We respond within 30 days." />
      <CardBody className="space-y-5">
        <form onSubmit={submit} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <Field label="Request" htmlFor="dr-type">
            <Select id="dr-type" value={type} onChange={(e) => setType(e.target.value as DataRequestType)}>
              <option value="EXPORT">Export a copy</option>
              <option value="DELETE">Delete data</option>
            </Select>
          </Field>
          <Field label="For" htmlFor="dr-student">
            <Select id="dr-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Whole family</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.displayName}</option>
              ))}
            </Select>
          </Field>
          <UiButton
            type="submit"
            variant={type === 'DELETE' ? 'danger' : 'primary'}
            loading={create.isPending && !confirmDelete}
            icon={type === 'DELETE' ? <Trash2 className="w-4 h-4" /> : <FileDown className="w-4 h-4" />}
          >
            Send request
          </UiButton>
        </form>

        <QueryState query={requests} empty={<EmptyState title="No requests yet" description="Requests you make will be tracked here." />}>
          {(rows) => (
            <DataTable<DataRequestRecord>
              rows={rows}
              rowKey={(r) => r.id}
              columns={[
                { key: 'type', header: 'Request', render: (r) => (r.type === 'EXPORT' ? 'Export' : 'Deletion') },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'requested', header: 'Requested', render: (r) => formatDate(r.requestedAt) },
                {
                  key: 'due',
                  header: 'Due / done',
                  render: (r) => (r.completedAt ? `Done ${formatDate(r.completedAt)}` : `Due ${formatDate(r.dueAt)}`),
                },
                {
                  key: 'file',
                  header: <span className="sr-only">Download</span>,
                  render: (r) =>
                    r.fileUrl ? (
                      <a
                        href={r.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden /> Download
                      </a>
                    ) : null,
                },
              ]}
            />
          )}
        </QueryState>
      </CardBody>

      <Modal
        open={confirmDelete}
        onClose={() => (create.isPending ? undefined : setConfirmDelete(false))}
        title="Request deletion?"
        description={`This asks us to delete the personal data we hold for ${scopeLabel}.`}
        footer={
          <>
            <UiButton variant="secondary" onClick={() => setConfirmDelete(false)} disabled={create.isPending}>
              Cancel
            </UiButton>
            <UiButton variant="danger" onClick={send} loading={create.isPending}>
              Yes, request deletion
            </UiButton>
          </>
        }
      >
        <Alert tone="warning" title="This can’t be undone once processed">
          Lesson history, progress and recordings for {scopeLabel} will be removed. Consider requesting an export first.
        </Alert>
      </Modal>
    </Card>
  );
}

