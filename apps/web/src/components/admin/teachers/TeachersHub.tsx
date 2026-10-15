'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Tabs,
  TextArea,
  TextInput,
  UiButton,
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
import { CopyButton, DetailList, IdText } from '../shared/AdminUi';
import { PickedTeacher, TeacherPicker, useLoadErrorToast } from '../shared/Pickers';
import { cn } from '@/lib/utils';

type HubTab = 'pipeline' | 'profiles' | 'provision';

/** `/admin/teachers` — hiring pipeline, per-teacher tools and (super admin) provisioning. */
export function TeachersHub() {
  const { isSuperAdmin } = useAdminRoles();
  const [tab, setTab] = useState<HubTab>('pipeline');
  const tabs: Array<{ value: HubTab; label: string }> = [
    { value: 'pipeline', label: 'Hiring pipeline' },
    { value: 'profiles', label: 'Teacher readiness & profile' },
    ...(isSuperAdmin ? [{ value: 'provision' as HubTab, label: 'Provision account' }] : []),
  ];
  return (
    <>
      <PageHeader
        eyebrow="Academy admin"
        title="Teachers"
        description="Move applicants through hiring, record safeguarding training and publish profile changes."
      />
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'pipeline' && <HiringPipeline basePath="/admin/teachers/applications" />}
      {tab === 'profiles' && <ProfileTab />}
      {tab === 'provision' && isSuperAdmin && <ProvisionTeacherForm />}
    </>
  );
}

function ProfileTab() {
  const [teacher, setTeacher] = useState<PickedTeacher | null>(null);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr] items-start">
      <Card>
        <CardHeader title="Choose a teacher" description="Teachers with enrolments are listed; paste a profile id for anyone else." />
        <CardBody>
          <TeacherPicker id="tools-teacher" value={teacher?.id ?? ''} onChange={setTeacher} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={teacher ? teacher.name : 'Teacher tools'} description={teacher ? <IdText id={teacher.id} /> : undefined} />
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
  const [created, setCreated] = useState<ProvisionedTeacher | null>(null);

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
        setCreated(teacher);
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
                  ['Profile id', <IdText key="p" id={created.id} />],
                  ['Application', created.applicationId ? <IdText key="a" id={created.applicationId} /> : '—'],
                  ['Matchable', created.readyToMatch ? 'Yes' : 'No'],
                ]}
              />
              <CopyButton value={created.id} label="Copy profile id" />
            </div>
          ) : (
            <EmptyState title="Nothing provisioned yet" />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
