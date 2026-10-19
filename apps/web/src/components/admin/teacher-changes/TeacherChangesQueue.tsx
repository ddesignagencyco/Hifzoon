'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Repeat } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
  QueryState,
  StatusBadge,
  Tabs,
  UiButton,
  formatDate,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useResolveTeacherChange, useTeacherChanges } from '@/hooks/useAdminAdmissions';
import { useAdminEnrolments, useAdminMatching } from '@/hooks/useAdminScheduling';
import {
  TEACHER_CHANGE_STATUSES,
  TeacherChangeRequest,
  TeacherChangeStatus,
} from '@/lib/api/modules/admissions-admin';
import { ConfirmDialog, DetailList, Drawer, IdText } from '../shared/AdminUi';

type Filter = TeacherChangeStatus | 'ALL';
type Resolution = Exclude<TeacherChangeStatus, 'OPEN'>;

/** `/admin/teacher-changes` — family requests for a different teacher. */
export function TeacherChangesQueue() {
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [selected, setSelected] = useState<TeacherChangeRequest | null>(null);
  const list = useTeacherChanges(filter === 'ALL' ? undefined : filter);

  return (
    <>
      <PageHeader
        eyebrow="Academy admin"
        title="Teacher changes"
        description="Requests from families for a different teacher. Review the matching suggestions before resolving."
      />
      <Tabs
        className="mb-4"
        value={filter}
        onChange={setFilter}
        tabs={[...TEACHER_CHANGE_STATUSES, 'ALL' as const].map((s) => ({ value: s, label: humanize(s) }))}
      />
      <Card>
        <CardBody className="pt-5">
          <QueryState
            query={list}
            empty={<EmptyState icon={<Repeat className="w-5 h-5" />} title={filter === 'OPEN' ? 'No open requests' : 'No requests'} />}
          >
            {(rows) => (
              <>
                {rows.length >= 100 && <p className="text-xs text-muted mb-2">Showing the 100 most recent requests.</p>}
                <ul className="divide-y divide-line">
                  {rows.map((r) => (
                    <li key={r.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 max-w-2xl">
                        <p className="text-sm font-semibold text-ink">
                          {r.studentName ?? 'Unknown student'} <span className="font-normal text-muted">· {r.family.name}</span>
                        </p>
                        <p className="text-xs text-ink-2 mt-1 whitespace-pre-line">{r.reason}</p>
                        <p className="text-[11px] text-muted mt-1">
                          Requested {formatDateTime(r.createdAt)}
                          {r.resolvedAt && ` · resolved ${formatDate(r.resolvedAt)}${r.resolvedBy ? ` by ${r.resolvedBy.name}` : ''}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.status} />
                        <UiButton size="sm" variant={r.status === 'OPEN' ? 'primary' : 'secondary'} onClick={() => setSelected(r)}>
                          {r.status === 'OPEN' ? 'Review' : 'View'}
                        </UiButton>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </QueryState>
        </CardBody>
      </Card>
      {selected && <ResolveDrawer key={selected.id} request={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function ResolveDrawer({ request, onClose }: { request: TeacherChangeRequest; onClose: () => void }) {
  const toast = useToast();
  const resolve = useResolveTeacherChange();
  const enrolments = useAdminEnrolments({ studentId: request.studentId });
  const enrolment = enrolments.data?.find((e) => e.id === request.enrolmentId);
  const isOpen = request.status === 'OPEN';
  const matching = useAdminMatching(isOpen ? request.studentId : null, enrolment?.course.id);
  const [newTeacherId, setNewTeacherId] = useState('');
  const [pending, setPending] = useState<Resolution | null>(null);
  const [resolved, setResolved] = useState<Resolution | null>(null);

  const confirm = () => {
    if (!pending) return;
    resolve.mutate(
      { requestId: request.id, status: pending },
      {
        onSuccess: () => {
          setResolved(pending);
          setPending(null);
          toast.success(`Request ${humanize(pending).toLowerCase()}`);
        },
        onError: (err) => {
          setPending(null);
          toast.error(err);
        },
      },
    );
  };

  const chosen = matching.data?.suggestions.find((s) => s.teacherId === newTeacherId);
  const scheduleHref =
    enrolment && newTeacherId
      ? `/admin/scheduling?enrolmentId=${encodeURIComponent(enrolment.id)}&teacherId=${encodeURIComponent(newTeacherId)}`
      : null;

  return (
    <Drawer open onClose={onClose} title={`${request.studentName ?? 'Student'} · ${request.family.name}`} description="Teacher change request">
      <DetailList
        items={[
          ['Status', <StatusBadge key="s" status={resolved ?? request.status} />],
          ['Requested', formatDateTime(request.createdAt)],
          ['Reason', <span key="r" className="whitespace-pre-line">{request.reason}</span>],
          [
            'Enrolment',
            enrolments.isLoading
              ? 'Loading…'
              : enrolment
                ? `${enrolment.course.name} · ${humanize(enrolment.status)}${enrolment.teacher ? ` · with ${enrolment.teacher.user.name}` : ''}`
                : <IdText key="e" id={request.enrolmentId} />,
          ],
          ...(request.resolvedBy ? ([['Resolved by', request.resolvedBy.name]] as Array<[string, React.ReactNode]>) : []),
        ]}
      />

      {isOpen && !resolved && (
        <section aria-labelledby="replacement-heading" className="space-y-3">
          <h3 id="replacement-heading" className="text-sm font-semibold text-ink font-sans">
            Choose a replacement
          </h3>
          {!enrolment && !enrolments.isLoading ? (
            <Alert tone="warning">The enrolment on this request could not be found, so matching cannot run.</Alert>
          ) : (
            <QueryState
              query={matching}
              isEmpty={(d) => d.suggestions.length === 0}
              empty={<EmptyState title="No cleared teacher matches this student" />}
            >
              {(data) => (
                <fieldset>
                  <legend className="sr-only">Replacement teacher</legend>
                  <ul className="space-y-2">
                    {data.suggestions.map((s) => {
                      const current = enrolment?.teacher?.id === s.teacherId;
                      return (
                        <li key={s.teacherId}>
                          <label
                            className={
                              'flex items-start gap-3 rounded-xl border p-3 ' +
                              (current ? 'opacity-60 border-line' : 'cursor-pointer ') +
                              (newTeacherId === s.teacherId ? 'border-green-700 bg-green-50' : 'border-line hover:bg-cream')
                            }
                          >
                            <input
                              type="radio"
                              name="replacement"
                              className="mt-1 accent-green-800"
                              disabled={current}
                              checked={newTeacherId === s.teacherId}
                              onChange={() => setNewTeacherId(s.teacherId)}
                            />
                            <span className="min-w-0">
                              <span className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-ink">{s.name}</span>
                                {current && <Badge>Current teacher</Badge>}
                              </span>
                              <span className="block text-xs text-ink-2">{s.reasons.join(' · ')}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              )}
            </QueryState>
          )}
          <Alert tone="neutral">
            Approving records the decision only — it does not move the enrolment or its classes. After approving, create the new
            recurring schedule with the chosen teacher.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <UiButton disabled={!newTeacherId} onClick={() => setPending('APPROVED')}>
              Approve with {chosen?.name ?? 'selected teacher'}
            </UiButton>
            <UiButton variant="secondary" onClick={() => setPending('DECLINED')}>
              Decline
            </UiButton>
            <UiButton variant="ghost" onClick={() => setPending('CANCELLED')}>
              Cancel request
            </UiButton>
          </div>
        </section>
      )}

      {resolved === 'APPROVED' && scheduleHref && (
        <Alert tone="success" title="Approved">
          Next, schedule {enrolment?.student.displayName ?? 'the student'} with {chosen?.name ?? 'the new teacher'}.{' '}
          <Link href={scheduleHref} className="underline font-semibold">
            Open the schedule builder
          </Link>
        </Alert>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending === 'APPROVED' ? 'Approve this request?' : pending === 'DECLINED' ? 'Decline this request?' : 'Cancel this request?'}
        tone={pending === 'APPROVED' ? 'primary' : 'danger'}
        confirmLabel={pending ? humanize(pending === 'CANCELLED' ? 'CANCEL_REQUEST' : pending.replace(/D$/, '')) : 'Confirm'}
        loading={resolve.isPending}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      >
        <p className="text-sm text-ink-2">
          {pending === 'APPROVED'
            ? `The request will be closed as approved${chosen ? ` with ${chosen.name} as the intended teacher` : ''}. A resolved request cannot be reopened.`
            : 'The request will be closed. A resolved request cannot be reopened.'}
        </p>
      </ConfirmDialog>
    </Drawer>
  );
}
