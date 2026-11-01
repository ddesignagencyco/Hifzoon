'use client';

import React, { useState } from 'react';
import { FilterBar, FilterSelect } from '@/components/ui/FilterSelect';
import Link from 'next/link';
import { Repeat } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
  Pagination,
  QueryState,
  StatusBadge,
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
import { ConfirmDialog, DetailList, Drawer } from '../shared/AdminUi';

type Filter = TeacherChangeStatus | 'ALL';
type Resolution = Exclude<TeacherChangeStatus, 'OPEN'>;

/** `/admin/teacher-changes` — family requests for a different teacher. */
export function TeacherChangesQueue() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TeacherChangeRequest | null>(null);
  const list = useTeacherChanges(filter === 'ALL' ? undefined : filter, page);

  return (
    <>
      <PageHeader
        eyebrow="Academy admin"
        title="Teacher changes"
        description="Requests from families for a different teacher. Review the matching suggestions before resolving."
      />
      <FilterBar className="mb-4">
        <FilterSelect
          id="tc-status"
          label="Status"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          options={['ALL' as const, ...TEACHER_CHANGE_STATUSES].map((s) => ({ value: s, label: s === 'ALL' ? 'All requests' : humanize(s) }))}
        />
      </FilterBar>
      <Card>
        <CardBody className="pt-5">
          <QueryState
            query={list}
            isEmpty={(d) => d.items.length === 0}
            empty={<EmptyState icon={<Repeat className="w-5 h-5" />} title={filter === 'OPEN' ? 'No open requests' : 'No requests'} />}
          >
            {(data) => (
              <>
                <ul className="divide-y divide-line">
                  {data.items.map((r) => (
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
                <Pagination
                  page={data.meta.page}
                  limit={data.meta.limit}
                  total={data.meta.total}
                  onPageChange={setPage}
                  itemName="requests"
                  className="mt-4"
                />
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
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<Resolution | null>(null);
  const [resolved, setResolved] = useState<Resolution | null>(null);

  const confirm = () => {
    if (!pending) return;
    resolve.mutate(
      { requestId: request.id, status: pending, newTeacherId: pending === 'APPROVED' ? newTeacherId : undefined, resolutionNote: note },
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
                : 'Enrolment details unavailable',
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
            Approving moves the enrolment and its future scheduled classes to the chosen teacher. Check the new teacher&apos;s
            availability afterwards and reschedule any class that no longer fits.
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
          {enrolment?.student.displayName ?? 'The student'} now has {chosen?.name ?? 'the new teacher'}, and their future classes moved
          with them. To change the weekly times, use the{' '}
          <Link href={scheduleHref} className="underline font-semibold">
            schedule builder
          </Link>
          .
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
            ? `${enrolment?.student.displayName ?? 'The student'} moves to ${chosen?.name ?? 'the selected teacher'}, with their future scheduled classes. A resolved request cannot be reopened.`
            : 'The request will be closed. A resolved request cannot be reopened.'}
        </p>
        <label htmlFor="tc-note" className="mt-3 block text-xs font-semibold text-ink-2">
          Note to the family <span className="font-normal text-muted">(optional, sent with the decision)</span>
        </label>
        <textarea
          id="tc-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          rows={3}
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-green-700 focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
      </ConfirmDialog>
    </Drawer>
  );
}
