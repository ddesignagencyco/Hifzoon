'use client';

import React, { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Alert, Card, DataTable, EmptyState, Field, Modal, PageHeader, Pagination, QueryState, Select, TextInput, UiButton, formatDateTime } from '@/components/ui/primitives';
import { useSupervisedTeachers } from '@/hooks/useQa';
import { supervisorMessagesApi } from '@/lib/api/modules/supervisor-messages';
import { useAdminRoles } from '@/components/admin/system/shared';
import { useAuth } from '@/hooks/useAuth';
import { Role } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Read-only view of guardian–teacher conversations. Opening one is recorded in the audit log. */
export function SupervisorMessages() {
  const { currentUser } = useAuth();
  const { isSuperAdmin } = useAdminRoles();
  const allowed = isSuperAdmin || currentUser?.roles.includes(Role.SUPERVISOR);
  const teachers = useSupervisedTeachers();
  const [teacherId, setTeacherId] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const params = { teacherId: teacherId || undefined, q: q.trim() || undefined, page, limit: 25 };
  const query = useQuery({ queryKey: ['supervision', 'messages', params], queryFn: () => supervisorMessagesApi.threads(params), placeholderData: keepPreviousData, enabled: Boolean(allowed) });

  if (!allowed) return <Card><EmptyState title="Supervisors only" /></Card>;
  return (
    <>
      <PageHeader eyebrow="Quality" title="Family–teacher messages" description="Read-only. The list shows who talked and when, not what was said." />
      <div className="flex flex-wrap gap-3 mb-4">
        <Field label="Teacher" htmlFor="sm-teacher" className="min-w-52">
          <Select id="sm-teacher" value={teacherId} searchable onChange={(e) => { setTeacherId(e.target.value); setPage(1); }}>
            <option value="">All my teachers</option>
            {(teachers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.user?.name ?? t.id}</option>)}
          </Select>
        </Field>
        <Field label="Family name" htmlFor="sm-q"><TextInput id="sm-q" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></Field>
      </div>
      <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No conversations" />}>
        {(d) => (
          <>
            <DataTable paginate={false} rows={d.items} rowKey={(t) => t.id}
              columns={[
                { key: 'f', header: 'Family', render: (t) => <span className="font-medium text-ink">{t.family.name}</span> },
                { key: 't', header: 'Teacher', render: (t) => t.teacher.name },
                { key: 'c', header: 'Messages', className: 'tabular-nums', render: (t) => t.messageCount },
                { key: 'l', header: 'Last message', render: (t) => (t.lastMessageAt ? formatDateTime(t.lastMessageAt) : '—') },
                { key: 'o', header: <span className="sr-only">Open</span>, className: 'text-right', render: (t) => <UiButton size="sm" variant="secondary" onClick={() => setOpen(t.id)}>Open</UiButton> },
              ]} />
            <Pagination page={d.page} limit={d.limit} total={d.total} onPageChange={setPage} itemName="conversations" />
          </>
        )}
      </QueryState>
      {open && <ThreadModal id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ThreadModal({ id, onClose }: { id: string; onClose: () => void }) {
  // Fetched once per opening; a refetch would write another audit row.
  const query = useQuery({ queryKey: ['supervision', 'messages', 'thread', id], queryFn: () => supervisorMessagesApi.thread(id), staleTime: Infinity, gcTime: 0, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  return (
    <Modal open onClose={onClose} title="Conversation" description={query.data ? `${query.data.thread.family.name} · ${query.data.thread.teacher.name}` : undefined} size="md">
      <Alert tone="warning">Opening this conversation is recorded in the audit log.</Alert>
      <div className="mt-3">
        <QueryState query={query} isEmpty={(d) => d.messages.length === 0} empty={<EmptyState title="No messages" />}>
          {(d) => (
            <ul className="space-y-2" aria-label="Messages">
              {d.messages.map((m) => (
                <li key={m.id} className={cn('max-w-[85%] rounded-xl px-3 py-2 text-sm', m.from === 'TEACHER' ? 'bg-green-50 text-ink' : 'ml-auto bg-sand text-ink')}>
                  <p className="text-[11px] font-semibold text-muted">{m.senderName} · {m.from === 'TEACHER' ? 'Teacher' : 'Guardian'} · {formatDateTime(m.sentAt)}</p>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </div>
    </Modal>
  );
}
