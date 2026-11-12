'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { DataTable, EmptyState, Field, Modal, PageHeader, Pagination, QueryState, Select, StatusBadge, Tabs, TextInput, formatDateTime, humanize } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/primitives';
import { usePastReviews, useReviewDetail, useReviewQueue, useSupervisedTeachers } from '@/hooks/useQa';
import { ScoreBadge } from './QaWidgets';
import { SupervisorRoleGate } from './SupervisorRoleGate';

const month = () => new Date().toISOString().slice(0, 7);

/** Review queue (sampled classes awaiting a review) and past reviews with the teachers' replies. */
export function QualityDesk({ initial = 'queue' }: { initial?: 'queue' | 'past' }) {
  const [tab, setTab] = useState<'queue' | 'past'>(initial);
  return (
    <SupervisorRoleGate>
      <PageHeader eyebrow="Quality" title="Class reviews desk" description="Sampled classes still waiting for you, and what has been reviewed and answered." />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[{ value: 'queue', label: 'Review queue' }, { value: 'past', label: 'Past reviews' }]}
      />
      {tab === 'queue' ? <Queue /> : <Past />}
    </SupervisorRoleGate>
  );
}

function TeacherFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const teachers = useSupervisedTeachers();
  return (
    <Field label="Teacher" htmlFor="qd-teacher" className="min-w-52">
      <Select id="qd-teacher" value={value} searchable onChange={(e) => onChange(e.target.value)}>
        <option value="">All my teachers</option>
        {(teachers.data ?? []).map((t) => (
          <option key={t.id} value={t.id}>{t.user?.name ?? t.id}</option>
        ))}
      </Select>
    </Field>
  );
}

function Queue() {
  const [period, setPeriod] = useState(month());
  const [teacherId, setTeacherId] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;
  const query = useReviewQueue({ period: /^\d{4}-\d{2}$/.test(period) ? period : undefined, teacherId: teacherId || undefined, page, limit });
  return (
    <>
      <div className="flex flex-wrap gap-3 mb-4">
        <Field label="Month" htmlFor="qd-period"><TextInput id="qd-period" type="month" value={period} onChange={(e) => { setPeriod(e.target.value); setPage(1); }} /></Field>
        <TeacherFilter value={teacherId} onChange={(v) => { setTeacherId(v); setPage(1); }} />
      </div>
      <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="Nothing waiting" description="Every sampled class for this selection has been reviewed. Your own classes are never listed." />}>
        {(d) => (
          <>
            <DataTable paginate={false} rows={d.items} rowKey={(r) => r.sampleId}
              columns={[
                { key: 'w', header: 'Waiting', className: 'tabular-nums', render: (r) => `${r.waitingDays} day${r.waitingDays === 1 ? '' : 's'}` },
                { key: 't', header: 'Teacher', render: (r) => <span className="font-medium text-ink">{r.teacher.name}</span> },
                { key: 'c', header: 'Class', render: (r) => `${r.class.course} · ${humanize(r.class.type)}` },
                { key: 's', header: 'Held', render: (r) => formatDateTime(r.class.startsAt) },
                { key: 'r', header: 'Recording', render: (r) => (r.class.hasRecording ? <Badge tone="green">Ready</Badge> : <span className="text-xs text-muted">None</span>) },
                { key: 'a', header: <span className="sr-only">Review</span>, className: 'text-right', render: (r) => (
                  <Link className="text-sm font-semibold text-green-800 hover:underline" href={`/supervisor/reviews?classId=${r.class.id}&teacherId=${r.teacher.id}`}>Review</Link>
                ) },
              ]} />
            <Pagination page={d.page} limit={d.limit} total={d.total} onPageChange={setPage} itemName="classes" />
          </>
        )}
      </QueryState>
    </>
  );
}

function Past() {
  const [teacherId, setTeacherId] = useState('');
  const [replied, setReplied] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const query = usePastReviews({ teacherId: teacherId || undefined, replied: replied || undefined, page, limit: 25 });
  return (
    <>
      <div className="flex flex-wrap gap-3 mb-4">
        <TeacherFilter value={teacherId} onChange={(v) => { setTeacherId(v); setPage(1); }} />
        <Field label="Teacher reply" htmlFor="qd-replied" className="min-w-40">
          <Select id="qd-replied" value={replied} onChange={(e) => { setReplied(e.target.value); setPage(1); }}>
            <option value="">Any</option><option value="true">Replied</option><option value="false">No reply yet</option>
          </Select>
        </Field>
      </div>
      <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No reviews match" />}>
        {(d) => (
          <>
            <DataTable paginate={false} rows={d.items} rowKey={(r) => r.id}
              columns={[
                { key: 'd', header: 'Reviewed', render: (r) => formatDateTime(r.reviewedAt) },
                { key: 't', header: 'Teacher', render: (r) => <span className="font-medium text-ink">{r.teacher.name}</span> },
                { key: 'c', header: 'Class', render: (r) => `${r.class.course} · ${formatDateTime(r.class.startsAt)}` },
                { key: 'a', header: 'Average', render: (r) => <ScoreBadge value={r.average} /> },
                { key: 'r', header: 'Reply', render: (r) => (r.hasReply ? <StatusBadge status="REPLIED" /> : <span className="text-xs text-muted">None</span>) },
                { key: 'o', header: <span className="sr-only">Open</span>, className: 'text-right', render: (r) => (
                  <button type="button" className="text-sm font-semibold text-green-800 hover:underline cursor-pointer" onClick={() => setOpen(r.id)}>Open</button>
                ) },
              ]} />
            <Pagination page={d.page} limit={d.limit} total={d.total} onPageChange={setPage} itemName="reviews" />
          </>
        )}
      </QueryState>
      {open && <ReviewModal id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ReviewModal({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useReviewDetail(id);
  return (
    <Modal open onClose={onClose} title="Review" size="md">
      <QueryState query={query}>
        {(r) => (
          <div className="space-y-4">
            <p className="text-sm text-ink-2">{r.teacher.name} · {r.class.course} · {formatDateTime(r.class.startsAt)}<br />Rubric: {r.rubric.name}</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {r.criteria.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>{c.label} <span className="text-xs text-muted">· weight {c.weight}</span></span>
                  <span className="font-semibold tabular-nums">{c.score ?? '—'} / 5</span>
                </li>
              ))}
            </ul>
            {r.feedback && <div><h4 className="text-xs font-semibold text-muted mb-1">Feedback</h4><p className="text-sm text-ink-2 whitespace-pre-wrap">{r.feedback}</p></div>}
            <div><h4 className="text-xs font-semibold text-muted mb-1">Teacher&apos;s reply</h4>
              <p className="text-sm text-ink-2 whitespace-pre-wrap">{r.teacherReply ?? 'No reply yet.'}</p></div>
          </div>
        )}
      </QueryState>
    </Modal>
  );
}

