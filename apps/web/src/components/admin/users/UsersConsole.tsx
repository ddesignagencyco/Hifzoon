'use client';

import React, { useState } from 'react';
import { Search, ShieldOff } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  QueryState,
  Select,
  StatusBadge,
  Tabs,
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
  const [term, setTerm] = useState('');
  const [touched, setTouched] = useState(false);
  const [target, setTarget] = useState<UserTarget | null>(null);
  const termError = touched ? validateSearchTerm(draft) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (validateSearchTerm(draft)) return;
    setTerm(draft.trim());
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <form onSubmit={submit} className="flex flex-col sm:flex-row sm:items-end gap-3" role="search">
          <Field label="Search" htmlFor="admin-search" error={termError} className="flex-1">
            <TextInput
              id="admin-search"
              type="search"
              value={draft}
              maxLength={120}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Name, email or phone"
              aria-invalid={Boolean(termError)}
            />
          </Field>
          <UiButton type="submit" icon={<Search className="w-4 h-4" />}>
            Search
          </UiButton>
        </form>
        <Tabs
          className="mt-4"
          value={entity}
          onChange={setEntity}
          tabs={SEARCH_ENTITIES.map((e) => ({ value: e, label: humanize(e) }))}
        />
      </Card>

      {term ? (
        <Results entity={entity} term={term} onOpenUser={setTarget} />
      ) : (
        <Card>
          <EmptyState title="Search to begin" description="Results are grouped by the kind of record you pick above." />
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
  const query = useAdminSearch(term, entity, 20);
  return (
    <Card>
      <CardBody className="pt-5">
        <QueryState
          query={query}
          isEmpty={(d) => d.items.length === 0}
          empty={<EmptyState title={`No ${entity} matched “${term}”`} description="Try another tab — the same person may be a family member or a teacher." />}
        >
          {(data) => (
            <>
              <p className="text-xs text-muted mb-3" aria-live="polite">
                Showing {data.items.length} of {data.total} {entity}
              </p>
              <ul className="divide-y divide-line">
                {entity === 'families' &&
                  (data.items as FamilySearchHit[]).map((f) => <FamilyRow key={f.id} family={f} onOpenUser={onOpenUser} />)}
                {entity === 'students' &&
                  (data.items as StudentSearchHit[]).map((s) => <StudentRow key={s.id} student={s} onOpenUser={onOpenUser} />)}
                {entity === 'teachers' &&
                  (data.items as TeacherSearchHit[]).map((t) => <TeacherRow key={t.id} teacher={t} onOpenUser={onOpenUser} />)}
                {entity === 'classes' && (data.items as ClassSearchHit[]).map((c) => <ClassRow key={c.id} cls={c} />)}
              </ul>
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

function FamilyRow({ family, onOpenUser }: { family: FamilySearchHit; onOpenUser: (t: UserTarget) => void }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">
          {family.name} <IdText id={family.id} label="family reference" />
        </p>
        <span className="text-[11px] text-muted">
          {[family.country, family.timeZone].filter(Boolean).join(' · ')} · since {formatDate(family.createdAt)}
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {family.members.map((m) => (
          <li key={m.user.id} className="flex flex-wrap items-center gap-2">
            <UserButton
              onClick={() =>
                onOpenUser({
                  userId: m.user.id,
                  name: m.user.name,
                  email: m.user.email,
                  phone: m.user.phone,
                  status: m.user.status,
                  context: `${humanize(m.relationship)} · ${family.name}`,
                })
              }
            >
              {m.user.name}
            </UserButton>
            <span className="text-xs text-muted">{m.user.email ?? 'no email'}</span>
            <Badge>{humanize(m.relationship)}</Badge>
            <StatusBadge status={m.user.status} />
          </li>
        ))}
      </ul>
      {family.students.length > 0 && (
        <p className="text-xs text-muted mt-2">
          Students: {family.students.map((s) => `${s.displayName} (${s.birthYear})`).join(', ')}
        </p>
      )}
    </li>
  );
}

function StudentRow({ student, onOpenUser }: { student: StudentSearchHit; onOpenUser: (t: UserTarget) => void }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">
          {student.displayName} <span className="text-xs font-normal text-muted">born {student.birthYear}</span>{' '}
          <IdText id={student.id} label="student reference" />
        </p>
        <span className="text-[11px] text-muted">
          {student.family.name} · {student.timeZone}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
        {student.enrolments.length === 0 && <span className="text-muted">No enrolments</span>}
        {student.enrolments.map((e) => (
          <span key={e.id} className="inline-flex items-center gap-1.5">
            <StatusBadge status={e.status} />
            <span className="text-ink-2">
              {e.course.name}
              {e.teacher ? ` with ${e.teacher.user.name}` : ''}
            </span>
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {student.userId && (
          <UserButton
            onClick={() =>
              onOpenUser({ userId: student.userId as string, name: student.displayName, email: null, context: 'Student login' })
            }
          >
            Student account
          </UserButton>
        )}
        {student.family.members.map((m) => (
          <UserButton
            key={m.user.id}
            onClick={() =>
              onOpenUser({ userId: m.user.id, name: m.user.name, email: m.user.email, context: `Guardian · ${student.family.name}` })
            }
          >
            Guardian: {m.user.name}
          </UserButton>
        ))}
      </div>
    </li>
  );
}

function TeacherRow({ teacher, onOpenUser }: { teacher: TeacherSearchHit; onOpenUser: (t: UserTarget) => void }) {
  return (
    <li className="py-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <UserButton
          onClick={() =>
            onOpenUser({
              userId: teacher.user.id,
              name: teacher.user.name,
              email: teacher.user.email,
              phone: teacher.user.phone,
              status: teacher.user.status,
              context: 'Teacher',
            })
          }
        >
          {teacher.user.name}
        </UserButton>
        <p className="text-xs text-muted">
          {teacher.user.email} <IdText id={teacher.id} label="teacher profile reference" />
        </p>
        <p className="text-[11px] text-muted mt-1">
          {teacher._count.enrolments} enrolments · {teacher._count.classes} classes · {teacher.languages.join(', ')}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge status={teacher.hiringStatus} />
        <Badge tone={teacher.readyToMatch ? 'green' : 'amber'}>{teacher.readyToMatch ? 'Matchable' : 'Not matchable'}</Badge>
        <StatusBadge status={teacher.user.status} />
      </div>
    </li>
  );
}

function ClassRow({ cls }: { cls: ClassSearchHit }) {
  return (
    <li className="py-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="font-semibold text-ink">{cls.course.name}</p>
        <p className="text-xs text-muted">
          {formatDateTime(cls.startsAt)} · {cls.teacher.user.name} · {cls._count.students} student(s)
        </p>
        <IdText id={cls.id} label="class reference" />
      </div>
      <div className="flex gap-1.5">
        <Badge>{humanize(cls.type)}</Badge>
        <StatusBadge status={cls.status} />
      </div>
    </li>
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
