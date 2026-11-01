'use client';

import React, { useEffect, useState } from 'react';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { useDebounced } from '@/hooks/useDebounced';
import { Search, ShieldOff } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  DataTable,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Pagination,
  QueryState,
  Select,
  StatusBadge,
  TextInput,
  UiButton,
  formatDate,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useUserNotificationPreferences } from '@/hooks/useNotifications';
import { toHHmm } from '@/lib/api/modules/notifications';
import { useAdminSearch, useSetUserRoles, useSetUserStatus } from '@/hooks/useAdminConsole';
import {
  ALL_ROLES,
  ClassSearchHit,
  FamilySearchHit,
  SEARCH_ENTITIES,
  SearchEntity,
  StaffRole,
  StudentSearchHit,
  TeacherSearchHit,
  USER_STATUSES,
  UserStatus,
  validateSearchTerm,
} from '@/lib/api/modules/admin-console';
import { ConfirmDialog, DetailList, Drawer, IdText } from '../shared/AdminUi';

/** A user account reached from a search hit. */
export interface UserTarget {
  userId: string;
  name: string;
  email: string | null;
  phone?: string | null;
  /** Known only when the search payload included it. */
  status?: UserStatus;
  context: string;
}

/** `/admin/users` — cross-entity search with account administration (SUPER_ADMIN). */
export function UsersConsole() {
  const { isSuperAdmin } = useAdminRoles();
  return (
    <>
      <PageHeader
        eyebrow="Academy admin"
        title="Users & search"
        description="Find any student, family, teacher or class, then manage the account behind it."
      />
      {isSuperAdmin ? (
        <SearchWorkspace />
      ) : (
        <Card>
          <EmptyState
            icon={<ShieldOff className="w-5 h-5" />}
            title="Super admin only"
            description="Account search, locking and role assignment are restricted to super admins. Ask a super admin to make account changes."
          />
        </Card>
      )}
    </>
  );
}

function SearchWorkspace() {
  const [entity, setEntity] = useState<SearchEntity>('families');
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState<UserTarget | null>(null);
  // Searches as you type, once typing pauses; no button to press.
  const term = useDebounced(draft.trim());
  const termError = term && validateSearchTerm(term) ? validateSearchTerm(term) : null;

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end" role="search">
          <div className="flex-1">
            <label htmlFor="admin-search" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <TextInput
                id="admin-search"
                type="search"
                value={draft}
                maxLength={120}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Name, email or phone"
                aria-invalid={Boolean(termError)}
                className="pl-9"
              />
            </div>
            {termError && <p className="mt-1 text-xs text-red">{termError}</p>}
          </div>
          <FilterSelect
            id="admin-search-entity"
            label="Show"
            value={entity}
            onChange={setEntity}
            options={SEARCH_ENTITIES.map((e) => ({ value: e, label: humanize(e) }))}
          />
        </div>
      </Card>

      {term && !termError ? (
        <Results entity={entity} term={term} onOpenUser={setTarget} />
      ) : (
        <Card>
          <EmptyState title="Start typing to search" description="Results appear as you type, for the kind of record chosen under “Show”." />
        </Card>
      )}

      <UserDrawer key={target?.userId ?? 'none'} target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function Results({
  entity,
  term,
  onOpenUser,
}: {
  entity: SearchEntity;
  term: string;
  onOpenUser: (t: UserTarget) => void;
}) {
  const [limit, setLimit] = useState(25);
  const [page, setPage] = useState(1);
  // A new search term or a different entity starts over at the first page of matches.
  useEffect(() => setPage(1), [term, entity]);
  const query = useAdminSearch(term, entity, limit, page);
  return (
    <Card>
      <CardBody className="pt-5">
        <QueryState
          query={query}
          isEmpty={(d) => d.items.length === 0}
          empty={<EmptyState title={`No ${entity} matched “${term}”`} description="Try another option under “Show” — the same person may be a family member or a teacher." />}
        >
          {(data) => (
            <>
              <p className="text-xs text-muted mb-3" aria-live="polite">
                {data.total} {entity} match “{term}”
              </p>
              {entity === 'families' && <FamilyTable rows={data.items as FamilySearchHit[]} onOpenUser={onOpenUser} />}
              {entity === 'students' && <StudentTable rows={data.items as StudentSearchHit[]} onOpenUser={onOpenUser} />}
              {entity === 'teachers' && <TeacherTable rows={data.items as TeacherSearchHit[]} onOpenUser={onOpenUser} />}
              {entity === 'classes' && <ClassTable rows={data.items as ClassSearchHit[]} />}
              <Pagination
                page={page}
                limit={limit}
                total={data.total}
                onPageChange={setPage}
                onLimitChange={(l) => {
                  setLimit(l);
                  setPage(1);
                }}
                itemName={entity}
                className="mt-4"
              />
            </>
          )}
        </QueryState>
      </CardBody>
    </Card>
  );
}

function UserButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left text-sm font-semibold text-green-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded cursor-pointer"
    >
      {children}
    </button>
  );
}

function FamilyTable({ rows, onOpenUser }: { rows: FamilySearchHit[]; onOpenUser: (t: UserTarget) => void }) {
  return (
    <DataTable
      paginate={false}
      rows={rows}
      rowKey={(f) => f.id}
      columns={[
        { key: 'family', header: 'Family', render: (f) => <span className="font-semibold text-ink">{f.name}</span> },
        {
          key: 'guardians',
          header: 'Guardians',
          sortable: false,
          render: (f) => (
            <span className="flex flex-col gap-1">
              {f.members.map((m) => (
                <span key={m.user.id} className="flex flex-wrap items-center gap-1.5">
                  <UserButton
                    onClick={() =>
                      onOpenUser({
                        userId: m.user.id,
                        name: m.user.name,
                        email: m.user.email,
                        phone: m.user.phone,
                        status: m.user.status,
                        context: `${humanize(m.relationship)} · ${f.name}`,
                      })
                    }
                  >
                    {m.user.name}
                  </UserButton>
                  <span className="text-xs text-muted">{m.user.email ?? 'no email'}</span>
                  <StatusBadge status={m.user.status} />
                </span>
              ))}
            </span>
          ),
        },
        {
          key: 'students',
          header: 'Children',
          render: (f) => f.students.map((s) => `${s.displayName} (${s.birthYear})`).join(', ') || <span className="text-muted">—</span>,
        },
        { key: 'where', header: 'Country', render: (f) => [f.country, f.timeZone].filter(Boolean).join(' · ') || '—' },
        { key: 'since', header: 'Since', render: (f) => formatDate(f.createdAt), sortValue: (f) => f.createdAt },
      ]}
    />
  );
}

function StudentTable({ rows, onOpenUser }: { rows: StudentSearchHit[]; onOpenUser: (t: UserTarget) => void }) {
  return (
    <DataTable
      paginate={false}
      rows={rows}
      rowKey={(s) => s.id}
      columns={[
        {
          key: 'student',
          header: 'Student',
          render: (s) => (
            <span>
              <span className="font-semibold text-ink">{s.displayName}</span>
              <span className="block text-xs text-muted">born {s.birthYear}</span>
            </span>
          ),
          sortValue: (s) => s.displayName.toLowerCase(),
        },
        { key: 'family', header: 'Family', render: (s) => s.family.name },
        {
          key: 'courses',
          header: 'Courses',
          sortable: false,
          render: (s) =>
            s.enrolments.length === 0 ? (
              <span className="text-muted">No enrolments</span>
            ) : (
              <span className="flex flex-col gap-1">
                {s.enrolments.map((e) => (
                  <span key={e.id} className="flex items-center gap-1.5 text-xs">
                    <StatusBadge status={e.status} />
                    {e.course.name}
                    {e.teacher ? ` with ${e.teacher.user.name}` : ''}
                  </span>
                ))}
              </span>
            ),
        },
        {
          key: 'accounts',
          header: 'Accounts',
          sortable: false,
          render: (s) => (
            <span className="flex flex-col gap-1 text-xs">
              {s.userId && (
                <UserButton onClick={() => onOpenUser({ userId: s.userId as string, name: s.displayName, email: null, context: 'Student login' })}>
                  Student account
                </UserButton>
              )}
              {s.family.members.map((m) => (
                <UserButton
                  key={m.user.id}
                  onClick={() => onOpenUser({ userId: m.user.id, name: m.user.name, email: m.user.email, context: `Guardian · ${s.family.name}` })}
                >
                  Guardian: {m.user.name}
                </UserButton>
              ))}
            </span>
          ),
        },
      ]}
    />
  );
}

function TeacherTable({ rows, onOpenUser }: { rows: TeacherSearchHit[]; onOpenUser: (t: UserTarget) => void }) {
  return (
    <DataTable
      paginate={false}
      rows={rows}
      rowKey={(t) => t.id}
      columns={[
        {
          key: 'teacher',
          header: 'Teacher',
          sortValue: (t) => t.user.name.toLowerCase(),
          render: (t) => (
            <span>
              <UserButton
                onClick={() =>
                  onOpenUser({
                    userId: t.user.id,
                    name: t.user.name,
                    email: t.user.email,
                    phone: t.user.phone,
                    status: t.user.status,
                    context: 'Teacher',
                  })
                }
              >
                {t.user.name}
              </UserButton>
              <span className="block text-xs text-muted">{t.user.email}</span>
            </span>
          ),
        },
        { key: 'hiring', header: 'Hiring', render: (t) => <StatusBadge status={t.hiringStatus} />, sortValue: (t) => t.hiringStatus },
        {
          key: 'match',
          header: 'Matchable',
          sortValue: (t) => (t.readyToMatch ? 1 : 0),
          render: (t) => <Badge tone={t.readyToMatch ? 'green' : 'amber'}>{t.readyToMatch ? 'Yes' : 'Not yet'}</Badge>,
        },
        { key: 'students', header: 'Enrolments', className: 'text-right tabular-nums', render: (t) => t._count.enrolments },
        { key: 'classes', header: 'Classes', className: 'text-right tabular-nums', render: (t) => t._count.classes },
        { key: 'languages', header: 'Languages', render: (t) => t.languages.join(', ') || '—' },
        { key: 'account', header: 'Account', render: (t) => <StatusBadge status={t.user.status} />, sortValue: (t) => t.user.status },
      ]}
    />
  );
}

function ClassTable({ rows }: { rows: ClassSearchHit[] }) {
  return (
    <DataTable
      paginate={false}
      rows={rows}
      rowKey={(c) => c.id}
      columns={[
        { key: 'course', header: 'Course', render: (c) => <span className="font-semibold text-ink">{c.course.name}</span> },
        { key: 'when', header: 'When', render: (c) => formatDateTime(c.startsAt), sortValue: (c) => c.startsAt },
        { key: 'teacher', header: 'Teacher', render: (c) => c.teacher.user.name },
        { key: 'students', header: 'Students', className: 'text-right tabular-nums', render: (c) => c._count.students },
        { key: 'type', header: 'Type', render: (c) => <Badge>{humanize(c.type)}</Badge>, sortValue: (c) => c.type },
        { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} />, sortValue: (c) => c.status },
      ]}
    />
  );
}

type PendingAction = { kind: 'status'; status: UserStatus } | { kind: 'roles'; roles: StaffRole[] } | null;

/** Account detail drawer: status change and role assignment, each behind a confirmation. */
export function UserDrawer({ target, onClose }: { target: UserTarget | null; onClose: () => void }) {
  const { userId: me } = useAdminRoles();
  const toast = useToast();
  const setStatus = useSetUserStatus();
  const setRoles = useSetUserRoles();
  const [knownStatus, setKnownStatus] = useState<UserStatus | undefined>(target?.status);
  const [nextStatus, setNextStatus] = useState<UserStatus | ''>('');
  const [roles, setRoleSet] = useState<StaffRole[]>([]);
  const [confirmedRoles, setConfirmedRoles] = useState<StaffRole[] | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  if (!target) return null;
  const isSelf = target.userId === me;

  const toggleRole = (role: StaffRole, on: boolean) =>
    setRoleSet((current) => (on ? [...current, role] : current.filter((r) => r !== role)));

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === 'status') {
      setStatus.mutate(
        { userId: target.userId, status: pending.status },
        {
          onSuccess: (res) => {
            setKnownStatus(res?.status ?? pending.status);
            setNextStatus('');
            setPending(null);
            toast.success(`${target.name} is now ${humanize(res?.status ?? pending.status).toLowerCase()}`);
          },
          onError: (err) => toast.error(err),
        },
      );
    } else {
      setRoles.mutate(
        { userId: target.userId, roles: pending.roles },
        {
          onSuccess: (res) => {
            setConfirmedRoles(res?.roles?.map((r) => r.role) ?? pending.roles);
            setPending(null);
            toast.success(`Roles updated for ${target.name}`);
          },
          onError: (err) => toast.error(err),
        },
      );
    }
  };

  return (
    <Drawer open onClose={onClose} title={target.name} description={target.context}>
      <DetailList
        items={[
          ['Email', target.email ?? '—'],
          ['Phone', target.phone ?? '—'],
          ['Status', knownStatus ? <StatusBadge status={knownStatus} /> : 'Not included in this search result'],
          ['Reference', <IdText key="id" id={target.userId} label="user reference" />],
        ]}
      />

      {isSelf && (
        <Alert tone="warning" title="This is your own account">
          To avoid locking yourself out, ask another super admin to change your status or roles.
        </Alert>
      )}

      <section aria-labelledby="status-heading" className="space-y-3">
        <h3 id="status-heading" className="text-sm font-semibold text-ink font-sans">
          Account status
        </h3>
        <p className="text-xs text-muted">
          Locking or disabling ends every active session immediately. The account and its history are kept, so it can be reactivated.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <Field label="New status" htmlFor="user-status" className="flex-1">
            <Select
              id="user-status"
              value={nextStatus}
              disabled={isSelf}
              onChange={(e) => setNextStatus(e.target.value as UserStatus | '')}
            >
              <option value="">Choose…</option>
              {USER_STATUSES.filter((s) => s !== knownStatus).map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </Field>
          <UiButton
            variant={nextStatus && nextStatus !== 'ACTIVE' ? 'danger' : 'primary'}
            disabled={!nextStatus || isSelf}
            onClick={() => nextStatus && setPending({ kind: 'status', status: nextStatus })}
          >
            Apply status
          </UiButton>
        </div>
      </section>

      <NotificationChannels userId={target.userId} />

      <section aria-labelledby="roles-heading" className="space-y-3">
        <h3 id="roles-heading" className="text-sm font-semibold text-ink font-sans">
          Role assignment
        </h3>
        <Alert tone="neutral">
          Saving <strong>replaces</strong> every role this account holds. Search results do not include current roles, so select the complete set it should have.
        </Alert>
        {confirmedRoles && (
          <p className="text-xs text-ink-2" role="status">
            Current roles: {confirmedRoles.map(humanize).join(', ')}
          </p>
        )}
        <fieldset disabled={isSelf} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <legend className="sr-only">Roles</legend>
          {ALL_ROLES.map((role) => (
            <Checkbox
              key={role}
              id={`role-${role}`}
              label={humanize(role)}
              checked={roles.includes(role)}
              disabled={isSelf}
              onChange={(on) => toggleRole(role, on)}
            />
          ))}
        </fieldset>
        <UiButton disabled={roles.length === 0 || isSelf} onClick={() => setPending({ kind: 'roles', roles })}>
          Save roles
        </UiButton>
        {roles.length === 0 && !isSelf && <p className="text-[11px] text-muted">Select at least one role.</p>}
      </section>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'status' ? `Set ${target.name} to ${humanize(pending.status).toLowerCase()}?` : `Replace ${target.name}'s roles?`}
        tone={pending?.kind === 'status' && pending.status !== 'ACTIVE' ? 'danger' : 'primary'}
        confirmLabel={pending?.kind === 'status' ? 'Change status' : 'Replace roles'}
        loading={setStatus.isPending || setRoles.isPending}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      >
        {pending?.kind === 'roles' ? (
          <p className="text-sm text-ink-2">
            The account will hold exactly: <strong>{pending.roles.map(humanize).join(', ')}</strong>. Any other role is removed. This is audited.
          </p>
        ) : pending?.kind === 'status' && pending.status !== 'ACTIVE' ? (
          <p className="text-sm text-ink-2">They will be signed out everywhere and cannot sign in until reactivated. This is audited.</p>
        ) : (
          <p className="text-sm text-ink-2">They will be able to sign in again. This is audited.</p>
        )}
      </ConfirmDialog>
    </Drawer>
  );
}

/** Read-only channels & quiet hours, for "why didn't they get the reminder?" (FR-NTF-04). */
export function NotificationChannels({ userId }: { userId: string }) {
  const prefs = useUserNotificationPreferences(userId);
  const p = prefs.data;
  return (
    <section aria-labelledby="channels-heading" className="space-y-2">
      <h3 id="channels-heading" className="text-sm font-semibold text-ink font-sans">
        Notification channels
      </h3>
      {prefs.isLoading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : prefs.isError ? (
        <ErrorState error={prefs.error} onRetry={() => prefs.refetch()} />
      ) : !p ? (
        <p className="text-xs text-muted">No preferences saved — the defaults apply (all channels on, no quiet hours).</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {(['email', 'whatsapp', 'push'] as const).map((ch) => (
            <Badge key={ch} tone={p[ch] ? 'green' : 'neutral'}>
              {humanize(ch)} {p[ch] ? 'on' : 'off'}
            </Badge>
          ))}
          <span className="text-muted">
            {p.quietFrom && p.quietTo ? `Quiet ${toHHmm(p.quietFrom)}–${toHHmm(p.quietTo)} UTC` : 'No quiet hours'} · {p.language.toUpperCase()}
          </span>
        </div>
      )}
    </section>
  );
}
