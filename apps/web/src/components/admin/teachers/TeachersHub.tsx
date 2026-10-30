'use client';

import React, { useState } from 'react';
import { FilterBar, FilterSelect } from '@/components/ui/FilterSelect';
import { useTeachers } from '@/hooks/useTeachers';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Select,
  Tabs,
  TextArea,
  TextInput,
  UiButton,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useProvisionTeacher } from '@/hooks/useAdminConsole';
import { useAdminCourses } from '@/hooks/useAdminScheduling';
import {
  ProvisionErrors,
  ProvisionTeacherInput,
  ProvisionedTeacher,
  splitList,
  validateProvisionTeacher,
} from '@/lib/api/modules/admin-console';
import { HiringPipeline } from './HiringPipeline';
import { TeacherProfileTools } from './TeacherProfileTools';
import { ProfileChangesQueue } from './ProfileChangesQueue';
import { TeacherTiersCatalogue } from './TeacherTiersCatalogue';
import { CopyButton, DetailList, IdText } from '../shared/AdminUi';
import { PickedTeacher, TeacherPicker, useLoadErrorToast } from '../shared/Pickers';
import { cn } from '@/lib/utils';

type HubTab = 'all' | 'pipeline' | 'changes' | 'profiles' | 'tiers' | 'provision';

/** `/admin/teachers` — hiring pipeline, per-teacher tools and (super admin) provisioning. */
export function TeachersHub() {
  const { isSuperAdmin, isStaffAdmin } = useAdminRoles();
  const [tab, setTab] = useState<HubTab>('all');
  const [picked, setPicked] = useState<PickedTeacher | null>(null);
  const tabs: Array<{ value: HubTab; label: string }> = [
    { value: 'all', label: 'All teachers' },
    { value: 'pipeline', label: 'Hiring pipeline' },
    ...(isStaffAdmin ? [{ value: 'changes' as HubTab, label: 'Profile changes' }] : []),
    { value: 'profiles', label: 'Teacher readiness & profile' },
    ...(isStaffAdmin ? [{ value: 'tiers' as HubTab, label: 'Teacher tiers' }] : []),
    ...(isSuperAdmin ? [{ value: 'provision' as HubTab, label: 'Provision account' }] : []),
  ];
  return (
    <>
      <PageHeader
        eyebrow="Academy admin"
        title="Teachers"
        description="Move applicants through hiring, review profile changes and credentials, and manage qualification tiers."
      />
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'all' && (
        <AllTeachers
          onOpen={(t) => {
            setPicked(t);
            setTab('profiles');
          }}
        />
      )}
      {tab === 'pipeline' && <HiringPipeline basePath="/admin/teachers/applications" />}
      {tab === 'changes' && isStaffAdmin && <ProfileChangesQueue />}
      {tab === 'profiles' && <ProfileTab key={picked?.id ?? 'none'} initial={picked} />}
      {tab === 'tiers' && isStaffAdmin && <TeacherTiersCatalogue />}
      {tab === 'provision' && isSuperAdmin && <ProvisionTeacherForm />}
    </>
  );
}

/** Every teacher on the public directory, sortable and filterable; a row opens their tools. */
function AllTeachers({ onOpen }: { onOpen: (teacher: PickedTeacher) => void }) {
  const directory = useTeachers();
  const [gender, setGender] = useState<'all' | 'MALE' | 'FEMALE'>('all');
  const [tier, setTier] = useState('all');
  const tiers = [...new Set(directory.allTeachers.map((t) => t.tier?.name).filter(Boolean) as string[])].sort();
  const rows = directory.allTeachers.filter(
    (t) => (gender === 'all' || t.gender === gender) && (tier === 'all' || (tier === 'none' ? !t.tier : t.tier?.name === tier)),
  );
  return (
    <Card>
      <CardHeader
        title="All teachers"
        description="Approved teachers families can book. Click a row for readiness, profile and tier."
        action={
          <FilterBar>
            <FilterSelect
              id="t-gender"
              label="Gender"
              value={gender}
              onChange={setGender}
              options={[
                { value: 'all', label: 'All' },
                { value: 'FEMALE', label: 'Female' },
                { value: 'MALE', label: 'Male' },
              ]}
            />
            <FilterSelect
              id="t-tier"
              label="Tier"
              value={tier}
              onChange={setTier}
              options={[
                { value: 'all', label: 'All tiers' },
                ...tiers.map((t) => ({ value: t, label: t })),
                { value: 'none', label: 'No tier yet' },
              ]}
            />
          </FilterBar>
        }
      />
      <CardBody>
        {directory.isLoading ? (
          <LoadingState label="Loading teachers…" />
        ) : directory.isError ? (
          <ErrorState error={directory.error} onRetry={() => directory.refetch()} />
        ) : (
          <DataTable
            rows={rows}
            rowKey={(t) => t.id}
            onRowClick={(t) => onOpen({ id: t.id, name: t.name })}
            searchable
            searchPlaceholder="Search name, language or subject"
            empty={<EmptyState title="No teachers match these filters" />}
            columns={[
              {
                key: 'name',
                header: 'Teacher',
                render: (t) => (
                  <span className="flex items-center gap-2.5">
                    {t.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- teacher-supplied host
                      <img src={t.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sand text-xs font-semibold text-ink">
                        {t.name.replace(/^(Ustadh|Ustadha)\s+/i, '').charAt(0)}
                      </span>
                    )}
                    <span className="font-medium text-ink">{t.name}</span>
                  </span>
                ),
              },
              { key: 'tier', header: 'Tier', render: (t) => t.tier?.name ?? <span className="text-muted">—</span> },
              { key: 'gender', header: 'Gender', render: (t) => (t.gender ? humanize(t.gender) : '—') },
              { key: 'languages', header: 'Languages', render: (t) => t.languages.join(', ') || '—' },
              { key: 'subjects', header: 'Teaches', render: (t) => t.specializations.join(', ') || '—' },
              {
                key: 'rating',
                header: 'Rating',
                className: 'text-right tabular-nums',
                sortValue: (t) => t.rating ?? -1,
                render: (t) => (t.rating ? `★ ${Number(t.rating).toFixed(1)}` : <span className="text-muted">New</span>),
              },
            ]}
          />
        )}
      </CardBody>
    </Card>
  );
}

function ProfileTab({ initial = null }: { initial?: PickedTeacher | null }) {
  const [teacher, setTeacher] = useState<PickedTeacher | null>(initial);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr] items-start">
      <Card>
        <CardHeader title="Choose a teacher" description="Type a teacher's name." />
        <CardBody>
          <TeacherPicker id="tools-teacher" value={teacher?.id ?? ''} onChange={setTeacher} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={teacher ? teacher.name : 'Teacher tools'} description={teacher ? <IdText id={teacher.id} label="teacher profile reference" /> : undefined} />
        <CardBody>
          {teacher ? (
            <TeacherProfileTools key={teacher.id} profileId={teacher.id} />
          ) : (
            <EmptyState title="No teacher selected" />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

const AGE_GROUPS = ['4-6', '6-9', '10-13', '14+'];

/** `POST /admin/console/teachers` — SUPER_ADMIN. The account starts uncleared. */
function ProvisionTeacherForm() {
  const toast = useToast();
  const router = useRouter();
  const provision = useProvisionTeacher();
  const courses = useAdminCourses();
  useLoadErrorToast(courses.isError, 'Could not load courses.');
  const [form, setForm] = useState({
    email: '',
    name: '',
    phone: '',
    password: '',
    languages: 'en',
    subjects: [] as string[],
    ageGroups: [] as string[],
    gender: '' as '' | 'MALE' | 'FEMALE',
    bio: '',
  });
  const [errors, setErrors] = useState<ProvisionErrors>({});
  const [created, setCreated] = useState<(ProvisionedTeacher & { name: string; email: string }) | null>(null);

  const toggle = (key: 'subjects' | 'ageGroups', value: string, on: boolean) =>
    setForm((f) => ({ ...f, [key]: on ? [...f[key], value] : f[key].filter((v) => v !== value) }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: ProvisionTeacherInput = {
      email: form.email.trim(),
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      password: form.password,
      languages: splitList(form.languages),
      subjects: form.subjects,
      ageGroups: form.ageGroups,
      gender: form.gender || undefined,
      bio: form.bio.trim() || undefined,
    };
    const found = validateProvisionTeacher(body);
    setErrors(found);
    if (Object.keys(found).length > 0) return toast.error(Object.values(found).find(Boolean) ?? 'Please fix the highlighted fields');
    provision.mutate(body, {
      onSuccess: (teacher) => {
        setCreated({ ...teacher, name: body.name, email: body.email });
        setForm((f) => ({ ...f, password: '' }));
        if (teacher.applicationId) {
          toast.success('Teacher account provisioned — continue in the hiring pipeline');
          router.push(`/admin/teachers/applications/${teacher.applicationId}?profileId=${teacher.id}`);
        } else {
          toast.success('Existing teacher profile updated');
        }
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,340px)] items-start">
      <Card>
        <CardHeader
          title="Provision a teacher account"
          description="Creates the login, an uncleared profile and a linked application. The teacher becomes matchable only after every hiring step and safeguarding training."
        />
        <CardBody>
          <form onSubmit={submit} noValidate className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Full name" htmlFor="pv-name" required error={errors.name}>
                <TextInput id="pv-name" value={form.name} maxLength={160} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Email" htmlFor="pv-email" required error={errors.email}>
                <TextInput id="pv-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Phone" htmlFor="pv-phone" error={errors.phone}>
                <TextInput id="pv-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="Temporary password" htmlFor="pv-password" required hint="At least 12 characters. Re-inviting an existing teacher never changes their password." error={errors.password}>
                <TextInput
                  id="pv-password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </Field>
              <Field label="Languages" htmlFor="pv-langs" required hint="Comma-separated codes, e.g. en, ur, ar" error={errors.languages}>
                <TextInput id="pv-langs" value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} />
              </Field>
              <Field label="Gender" htmlFor="pv-gender">
                <Select id="pv-gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as '' | 'MALE' | 'FEMALE' })}>
                  <option value="">Not specified</option>
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                </Select>
              </Field>
            </div>
            <fieldset>
              <legend className={cn('text-xs font-semibold mb-2', errors.subjects ? 'text-red' : 'text-ink-2')}>
                Subjects (course codes)<span className="text-red ml-0.5" aria-hidden>*</span>
              </legend>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(courses.data ?? []).map((c) => (
                  <Checkbox
                    key={c.id}
                    id={`pv-subject-${c.code}`}
                    label={c.name}
                    description={c.code}
                    checked={form.subjects.includes(c.code)}
                    onChange={(on) => toggle('subjects', c.code, on)}
                  />
                ))}
              </div>
              {errors.subjects && <p className="sr-only">{errors.subjects}</p>}
            </fieldset>
            <fieldset>
              <legend className={cn('text-xs font-semibold mb-2', errors.ageGroups ? 'text-red' : 'text-ink-2')}>
                Age groups<span className="text-red ml-0.5" aria-hidden>*</span>
              </legend>
              <div className="flex flex-wrap gap-4">
                {AGE_GROUPS.map((g) => (
                  <Checkbox key={g} id={`pv-age-${g}`} label={g} checked={form.ageGroups.includes(g)} onChange={(on) => toggle('ageGroups', g, on)} />
                ))}
              </div>
              {errors.ageGroups && <p className="sr-only">{errors.ageGroups}</p>}
            </fieldset>
            <Field label="Bio" htmlFor="pv-bio" error={errors.bio}>
              <TextArea id="pv-bio" value={form.bio} maxLength={4000} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </Field>
            <div className="flex justify-end">
              <UiButton type="submit" loading={provision.isPending}>
                Provision teacher
              </UiButton>
            </div>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Result" />
        <CardBody>
          {created ? (
            <div className="space-y-3">
              <Alert tone={created.applicationId ? 'success' : 'neutral'}>
                {created.applicationId
                  ? 'New account created (not matchable yet).'
                  : 'That email already belonged to a teacher, so only their profile details were updated.'}
              </Alert>
              <DetailList
                items={[
                  ['Teacher', created.name],
                  ['Email', created.email],
                  ['Application', created.applicationId ? 'Opened in the hiring pipeline' : '—'],
                  ['Matchable', created.readyToMatch ? 'Yes' : 'No'],
                ]}
              />
              <CopyButton value={created.id} label="Copy profile reference" />
            </div>
          ) : (
            <EmptyState title="Nothing provisioned yet" />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
