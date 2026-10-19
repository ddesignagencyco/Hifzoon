'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Tabs,
} from '@/components/ui/primitives';
import { useFamilyDetail, useFamilyStudents } from '@/hooks/useFamily';
import { ageFromBirthYear } from '@/lib/api/modules/families';
import { Initial, WithActiveFamily } from './shared';
import { Onboarding } from './Onboarding';
import { ChildProgress, ChildReportCard } from './ChildProgress';
import { ChildLessonCards, ChildMistakes } from './ChildLessons';
import { ChildCourses } from './ChildCourses';
import { HifzPageMap } from '@/components/hifz/HifzPageMap';
import { ConsentManager } from './ConsentPanels';
import { ChildForm } from './ChildForm';

const TABS = [
  { value: 'progress', label: 'Progress' },
  { value: 'report', label: 'Report card' },
  { value: 'hifz', label: 'Hifz' },
  { value: 'lessons', label: 'Lesson cards' },
  { value: 'mistakes', label: 'Mistakes' },
  { value: 'courses', label: 'Courses' },
  { value: 'consent', label: 'Consent' },
  { value: 'settings', label: 'Settings' },
] as const;

type TabValue = (typeof TABS)[number]['value'];

function isTab(value: string | null): value is TabValue {
  return TABS.some((t) => t.value === value);
}

/** `/parent/children/[studentId]` — everything about one child, in tabs. */
export function ChildDetail({ studentId }: { studentId: string }) {
  return (
    <WithActiveFamily onNoFamily={<Onboarding familyId={null} membership={null} />}>
      {({ familyId }) => <ChildDetailForFamily key={familyId} familyId={familyId} studentId={studentId} />}
    </WithActiveFamily>
  );
}

function ChildDetailForFamily({ familyId, studentId }: { familyId: string; studentId: string }) {
  const params = useSearchParams();
  const requested = params.get('tab');
  const [tab, setTab] = useState<TabValue>(isTab(requested) ? requested : 'progress');
  const students = useFamilyStudents(familyId);
  const family = useFamilyDetail(familyId);

  if (students.isLoading) return <LoadingState label="Loading…" />;
  if (students.isError) return <ErrorState error={students.error} onRetry={() => students.refetch()} />;
  const student = students.data?.find((s) => s.id === studentId);
  if (!student) {
    return (
      <EmptyState
        title="Child not found"
        description="This child isn’t part of your current family."
        action={
          <Link href="/parent/children" className="text-sm font-semibold text-green-700 hover:underline">
            Back to children
          </Link>
        }
      />
    );
  }

  const changeTab = (value: TabValue) => {
    setTab(value);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', value);
      url.searchParams.delete('card');
      window.history.replaceState(null, '', url.toString());
    } catch {
      // Non-critical: deep link just won't update.
    }
  };

  return (
    <>
      <Link href="/parent/children" className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink mb-3">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> All children
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Initial name={student.displayName} />
            {student.displayName}
          </span>
        }
        description={`Age ${ageFromBirthYear(student.birthYear)} · ${student.timeZone}`}
        actions={student.kidsMode ? <Badge tone="gold">Kids mode</Badge> : undefined}
      />
      <div className="overflow-x-auto -mx-1 px-1 mb-5">
        <Tabs tabs={[...TABS]} value={tab} onChange={changeTab} className="flex-nowrap whitespace-nowrap" />
      </div>
      <div role="tabpanel" aria-label={TABS.find((t) => t.value === tab)?.label}>
        {tab === 'progress' && <ChildProgress studentId={studentId} />}
        {tab === 'report' && <ChildReportCard studentId={studentId} />}
        {tab === 'hifz' && <HifzPageMap studentId={studentId} />}
        {tab === 'lessons' && (
          <Card>
            <CardHeader title="Lesson cards" description="Shared by the teacher after each class." />
            <CardBody>
              <ChildLessonCards studentId={studentId} initialCardId={params.get('card')} />
            </CardBody>
          </Card>
        )}
        {tab === 'mistakes' && (
          <Card>
            <CardHeader title="Mistake history" description="Newest first. Resolved means the teacher marked it as fixed." />
            <CardBody>
              <ChildMistakes studentId={studentId} />
            </CardBody>
          </Card>
        )}
        {tab === 'courses' && (
          <Card>
            <CardHeader title="Courses" />
            <CardBody>
              <ChildCourses studentId={studentId} familyId={familyId} displayName={student.displayName} />
            </CardBody>
          </Card>
        )}
        {tab === 'consent' && (
          <Card>
            <CardHeader title="Consent" description="Each purpose is separate. Changes take effect immediately and are recorded." />
            <CardBody>
              <ConsentManager studentId={studentId} displayName={student.displayName} />
            </CardBody>
          </Card>
        )}
        {tab === 'settings' && (
          <Card>
            <CardHeader title="Child details" description="Kids mode, language and time zone." />
            <CardBody>
              <ChildForm
                key={`${student.id}-${student.displayName}-${student.timeZone}-${student.kidsMode}`}
                familyId={familyId}
                student={student}
                defaultTimeZone={family.data?.timeZone ?? student.timeZone}
              />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
