'use client';

import React, { useMemo, useState } from 'react';
import { ALL, FilterBar, FilterSearch, FilterSelect, matchesSearch, optionsFrom } from '@/components/ui/FilterSelect';
import Link from 'next/link';
import { Repeat } from 'lucide-react';
import {
  Alert,
  Badge,
  DataTable,
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

/** The queue is small, so one page holds the API's largest page and is filtered here. */
const QUEUE_PAGE = 100;

/** `/admin/teacher-changes` — family requests for a different teacher. */
export function TeacherChangesQueue() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState<string>(ALL);
  const [child, setChild] = useState<string>(ALL);
  const [teacher, setTeacher] = useState<string>(ALL);
  const [selected, setSelected] = useState<TeacherChangeRequest | null>(null);
  const list = useTeacherChanges(filter === 'ALL' ? undefined : filter, page, QUEUE_PAGE);
  const loaded = useMemo(() => list.data?.items ?? [], [list.data]);

  const familyOptions = useMemo(
    () => optionsFrom(loaded, (r) => ({ value: r.family.id, label: r.family.name }), 'All families'),
    [loaded],
  );
  const childOptions = useMemo(
    () =>
      optionsFrom(
        loaded.filter((r) => family === ALL || r.family.id === family),
        (r) => ({ value: r.studentId, label: r.studentName ?? 'Unknown student' }),
        'All children',
      ),
    [loaded, family],
  );
  const teacherOptions = useMemo(
    () =>
      optionsFrom(
        loaded.flatMap((r) => [r.currentTeacher, r.newTeacher]),
        (t) => (t ? { value: t.id, label: t.name } : null),
        'All teachers',
      ),
    [loaded],
  );

  const rows = loaded.filter(
    (r) =>
      (family === ALL || r.family.id === family) &&
      (child === ALL || r.studentId === child) &&
      (teacher === ALL || r.currentTeacher?.id === teacher || r.newTeacher?.id === teacher) &&
      matchesSearch(search, r.studentName, r.family.name),
  );

  return (
    <>
      <PageHeader
        eyebrow="Academy admin"
        title="Teacher changes"
        description="Requests from families for a different teacher. Review the matching suggestions before resolving."
      />
      <FilterBar className="mb-4">
        <FilterSearch id="tc-search" value={search} onChange={setSearch} placeholder="Family or child name" />
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
        <FilterSelect
          id="tc-family"
          label="Family"
          value={family}
          onChange={(v) => {
            setFamily(v);
            setChild(ALL);
          }}
          options={familyOptions}
        />
        <FilterSelect id="tc-child" label="Child" value={child} onChange={setChild} options={childOptions} />
        {teacherOptions.length > 1 && (
          <FilterSelect id="tc-teacher" label="Teacher" value={teacher} onChange={setTeacher} options={teacherOptions} />
        )}
      </FilterBar>
      <QueryState
        query={list}
        isEmpty={(d) => d.items.length === 0}
        empty={
          <EmptyState
            className="rounded-xl border border-line bg-white"
            icon={<Repeat className="w-5 h-5" />}
            title={filter === 'OPEN' ? 'No open requests' : 'No requests'}
          />
        }
      >
        {(data) => (
          <>
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              pageSize={25}
              searchable={false}
              empty={<EmptyState icon={<Repeat className="w-5 h-5" />} title="No requests match these filters" />}
              columns={[
                {
                  key: 'child',
                  header: 'Child',
                  sortValue: (r) => (r.studentName ?? '').toLowerCase(),
                  render: (r) => (
                    <span className="block">
                      <span className="font-medium text-ink">{r.studentName ?? 'Unknown student'}</span>
                      {r.course && <span className="block text-[11px] text-muted">{r.course.name}</span>}
                    </span>
                  ),
                },
                { key: 'family', header: 'Family', render: (r) => r.family.name },
                {
                  key: 'current',
                  header: 'Current teacher',
                  sortValue: (r) => r.currentTeacher?.name ?? '',
                  render: (r) => r.currentTeacher?.name ?? <span className="text-[11px] text-muted">None</span>,
                },
                {
                  key: 'requested',
                  header: 'Requested / assigned',
                  sortValue: (r) => r.newTeacher?.name ?? '',
                  render: (r) =>
                    r.newTeacher ? (
                      r.newTeacher.name
                    ) : (
                      <span className="text-[11px] text-muted">{r.status === 'OPEN' ? 'Chosen on review' : '—'}</span>
                    ),
                },
                {
                  key: 'reason',
                  header: 'Reason',
                  sortable: false,
                  className: 'max-w-xs',
                  render: (r) => (
                    <span className="block truncate text-xs" title={r.reason}>
                      {r.reason}
                    </span>
                  ),
                },
                { key: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
                {
                  key: 'requestedOn',
                  header: 'Requested on',
                  sortValue: (r) => r.createdAt,
                  render: (r) => (
                    <span className="whitespace-nowrap text-xs" title={formatDateTime(r.createdAt)}>
                      {formatDate(r.createdAt)}
                    </span>
                  ),
                },
                {
                  key: 'resolved',
                  header: 'Resolved',
                  sortValue: (r) => r.resolvedAt ?? '',
                  render: (r) =>
                    r.resolvedAt ? (
                      <span className="block text-xs">
                        <span className="whitespace-nowrap">{formatDate(r.resolvedAt)}</span>
                        {r.resolvedBy && <span className="block text-[11px] text-muted">by {r.resolvedBy.name}</span>}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted">—</span>
                    ),
                },
                {
                  key: 'action',
                  header: '',
                  className: 'text-right',
                  render: (r) => (
                    <UiButton size="sm" variant={r.status === 'OPEN' ? 'primary' : 'secondary'} onClick={() => setSelected(r)}>
                      {r.status === 'OPEN' ? 'Review' : 'View'}
                    </UiButton>
                  ),
                },
              ]}
            />
            {data.meta.total > data.meta.limit && (
              <Pagination
                page={data.meta.page}
                limit={data.meta.limit}
                total={data.meta.total}
                onPageChange={setPage}
                itemName="requests"
                className="mt-4"
              />
            )}
          </>
        )}
      </QueryState>
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
