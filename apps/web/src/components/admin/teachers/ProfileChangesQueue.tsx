'use client';

import React, { useState } from 'react';
import { BadgeCheck, ExternalLink } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  Modal,
  QueryState,
  TextArea,
  UiButton,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { usePendingProfileChanges, useReviewTeacherProfile } from '@/hooks/useHiring';
import type { PendingProfileChange } from '@/lib/api/modules/teacher-hiring';
import type { TeacherCredential } from '@/lib/api/modules/teacher';

const FIELD_LABEL: Record<string, string> = {
  bio: 'Bio',
  photoUrl: 'Photo',
  introVideoUrl: 'Intro video',
  recitationSampleUrl: 'Recitation sample',
  qualifications: 'Certificates & associations',
  languages: 'Languages',
  subjects: 'Subjects',
  ageGroups: 'Age groups',
};

const isHttpUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//i.test(v);

function asCredentials(value: unknown): TeacherCredential[] {
  return Array.isArray(value) ? (value.filter((c) => c && typeof c === 'object') as TeacherCredential[]) : [];
}

const sameCredential = (a: TeacherCredential, b: TeacherCredential) =>
  a.type === b.type && a.title === b.title && a.issuer === b.issuer && a.documentUrl === b.documentUrl;

function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-muted">—</span>;
  if (Array.isArray(value)) return <span>{value.length ? value.join(', ') : '—'}</span>;
  if (isHttpUrl(value))
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline decoration-gold underline-offset-2 break-all">
        Open <ExternalLink className="w-3 h-3" aria-hidden />
      </a>
    );
  return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
}

function CredentialList({ items, live }: { items: TeacherCredential[]; live?: TeacherCredential[] }) {
  if (!items.length) return <span className="text-muted">None</span>;
  return (
    <ul className="space-y-2">
      {items.map((c, i) => {
        const alreadyVerified = c.verified || Boolean(live?.some((l) => l.verified && sameCredential(l, c)));
        return (
          <li key={`${c.title}-${i}`} className="rounded-lg border border-line p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{c.title}</span>
              <Badge tone="neutral">{humanize(c.type)}</Badge>
              {live &&
                (alreadyVerified ? (
                  <Badge tone="green">Already verified</Badge>
                ) : (
                  <Badge tone="gold">Verified on approval</Badge>
                ))}
              {!live && c.verified && (
                <span className="inline-flex items-center gap-1 text-[11px] text-green-700">
                  <BadgeCheck className="w-3.5 h-3.5" aria-hidden /> Verified
                </span>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5">{c.issuer}</p>
            {isHttpUrl(c.documentUrl) && (
              <a
                href={c.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs underline decoration-gold underline-offset-2"
              >
                View document <ExternalLink className="w-3 h-3" aria-hidden />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Before/after view of one teacher's staged profile change. */
export function ProfileChangeDiff({ change }: { change: PendingProfileChange }) {
  const fields = Object.keys(change.changes);
  if (!fields.length) return <p className="text-sm text-muted">The staged change is empty.</p>;
  return (
    <div className="divide-y divide-line rounded-xl border border-line">
      {fields.map((field) => (
        <div key={field} className="grid gap-3 p-3 sm:grid-cols-[140px_1fr_1fr] text-sm">
          <p className="font-semibold text-ink-2">{FIELD_LABEL[field] ?? humanize(field)}</p>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted mb-1">Now</p>
            {field === 'qualifications' ? (
              <CredentialList items={asCredentials(change.current[field])} />
            ) : (
              <Value value={change.current[field]} />
            )}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted mb-1">Proposed</p>
            {field === 'qualifications' ? (
              <CredentialList items={asCredentials(change.changes[field])} live={asCredentials(change.current[field])} />
            ) : (
              <Value value={change.changes[field]} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Approve / reject buttons with a reason the teacher sees on rejection. */
export function ProfileChangeActions({ change }: { change: PendingProfileChange }) {
  const toast = useToast();
  const review = useReviewTeacherProfile();
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const hasCredentials = 'qualifications' in change.changes;

  const submit = () => {
    if (!mode) return;
    const approve = mode === 'approve';
    review.mutate(
      { profileId: change.profileId, approve, reason: approve ? undefined : reason },
      {
        onSuccess: () => {
          toast.success(approve ? `${change.teacherName}'s changes are live` : `${change.teacherName}'s changes were rejected`);
          setMode(null);
          setReason('');
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <UiButton size="sm" onClick={() => setMode('approve')}>
          Approve & publish
        </UiButton>
        <UiButton size="sm" variant="secondary" onClick={() => setMode('reject')}>
          Reject
        </UiButton>
      </div>
      <Modal
        open={mode !== null}
        size="sm"
        onClose={review.isPending ? () => undefined : () => setMode(null)}
        title={mode === 'approve' ? `Publish ${change.teacherName}'s changes?` : `Reject ${change.teacherName}'s changes?`}
        footer={
          <>
            <UiButton variant="secondary" onClick={() => setMode(null)} disabled={review.isPending}>
              Back
            </UiButton>
            <UiButton
              variant={mode === 'reject' ? 'danger' : 'primary'}
              onClick={submit}
              loading={review.isPending}
            >
              {mode === 'approve' ? 'Publish' : 'Reject changes'}
            </UiButton>
          </>
        }
      >
        {mode === 'approve' ? (
          <p className="text-sm text-ink-2">
            The changes go live on the public teacher profile now.
            {hasCredentials && ' Approving also marks every new certificate and association as verified by you, so check the documents first.'}
          </p>
        ) : (
          <Field label="Reason for the teacher" htmlFor={`reject-${change.profileId}`} hint="Shown to the teacher so they can fix and resubmit.">
            <TextArea
              id={`reject-${change.profileId}`}
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}
      </Modal>
    </>
  );
}

/** `/admin/teachers` → Profile changes: every teacher waiting for review (M54). */
export function ProfileChangesQueue() {
  const query = usePendingProfileChanges();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader
        title="Profile changes waiting for review"
        description="Teachers' edits to their public profile stay hidden until you approve them. Approving verifies any new certificates or associations."
      />
      <CardBody>
        <QueryState
          query={query}
          loadingLabel="Loading profile changes…"
          empty={<EmptyState title="Nothing to review" description="No teacher has a profile change waiting." />}
        >
          {(rows) => (
            <>
              <DataTable
                rows={rows}
                rowKey={(r) => r.profileId}
                onRowClick={(r) => setOpenId(r.profileId)}
                columns={[
                  { key: 'teacher', header: 'Teacher', render: (r) => <span className="font-semibold text-ink">{r.teacherName}</span> },
                  {
                    key: 'fields',
                    header: 'What changed',
                    render: (r) =>
                      Object.keys(r.changes)
                        .map((f) => FIELD_LABEL[f] ?? humanize(f))
                        .join(', '),
                  },
                  {
                    key: 'submitted',
                    header: 'Submitted',
                    sortValue: (r) => r.submittedAt ?? '',
                    render: (r) => (r.submittedAt ? formatDateTime(r.submittedAt) : '—'),
                  },
                  {
                    key: 'actions',
                    header: '',
                    className: 'text-right',
                    render: (r) => (
                      <UiButton size="sm" variant="secondary" onClick={() => setOpenId(r.profileId)}>
                        Review changes
                      </UiButton>
                    ),
                  },
                ]}
              />
              {(() => {
                const row = rows.find((r) => r.profileId === openId);
                return row ? (
                  <Modal open size="lg" title={`${row.teacherName}: profile changes`} onClose={() => setOpenId(null)}>
                    <ProfileChangeDiff change={row} />
                    <div className="mt-4 flex justify-end border-t border-line pt-4">
                      <ProfileChangeActions change={row} />
                    </div>
                  </Modal>
                ) : null;
              })()}
            </>
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}
