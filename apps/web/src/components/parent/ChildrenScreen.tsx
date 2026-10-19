'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Pencil, Plus } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Modal,
  PageHeader,
  QueryState,
  UiButton,
  humanize,
} from '@/components/ui/primitives';
import { useFamilyDetail, useFamilyStudents } from '@/hooks/useFamily';
import { ageFromBirthYear, FamilyStudent } from '@/lib/api/modules/families';
import { FamilySwitcher, Initial, WithActiveFamily } from './shared';
import { Onboarding } from './Onboarding';
import { AddChildFlow } from './AddChildFlow';
import { ChildForm } from './ChildForm';
import { FamilyForm } from './FamilyForm';
import { GuardiansCard } from './GuardianPanels';
import { TeacherChangeRequests } from './TeacherChangeRequests';

/** `/parent/children` — children list, add-child (with CR-01 consent), family settings. */
export function ChildrenScreen() {
  return (
    <WithActiveFamily onNoFamily={<Onboarding familyId={null} membership={null} />}>
      {({ familyId }) => <ChildrenForFamily key={familyId} familyId={familyId} />}
    </WithActiveFamily>
  );
}

function ChildrenForFamily({ familyId }: { familyId: string }) {
  const students = useFamilyStudents(familyId);
  const family = useFamilyDetail(familyId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FamilyStudent | null>(null);
  const familyTz = family.data?.timeZone ?? 'UTC';

  return (
    <>
      <PageHeader
        title="Children"
        description="Add children, update their details and manage your family account."
        actions={
          <>
            <FamilySwitcher />
            {!adding && (
              <UiButton icon={<Plus className="w-4 h-4" />} onClick={() => setAdding(true)}>
                Add a child
              </UiButton>
            )}
          </>
        }
      />

      {adding && (
        <Card className="mb-6">
          <CardHeader title="Add a child" description="Children don’t need an email address. We only store their birth year." />
          <CardBody>
            <AddChildFlow familyId={familyId} defaultTimeZone={familyTz} onCancel={() => setAdding(false)} />
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] items-start">
        <div className="space-y-6">
        <Card>
          <CardHeader title="Your children" description={students.data ? `${students.data.length} in this family` : undefined} />
          <CardBody>
            <QueryState
              query={students}
              empty={
                <EmptyState
                  title="No children yet"
                  description="Add your first child to start booking classes."
                  action={!adding ? <UiButton size="sm" onClick={() => setAdding(true)}>Add a child</UiButton> : undefined}
                />
              }
            >
              {(rows) => (
                <ul className="divide-y divide-line">
                  {rows.map((s) => (
                    <li key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Initial name={s.displayName} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink truncate">{s.displayName}</p>
                          <p className="text-xs text-muted">
                            Age {ageFromBirthYear(s.birthYear)} · {humanize(s.gender)} · {s.language.toUpperCase()} · {s.timeZone}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {s.kidsMode && <Badge tone="gold">Kids mode</Badge>}
                            {s.userId && <Badge tone="blue">Own login</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <UiButton
                          variant="secondary"
                          size="sm"
                          icon={<Pencil className="w-3.5 h-3.5" />}
                          onClick={() => setEditing(s)}
                          aria-label={`Edit ${s.displayName}`}
                        >
                          Edit
                        </UiButton>
                        <Link
                          href={`/parent/children/${s.id}`}
                          className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-green-800 text-white text-xs font-semibold hover:bg-green-700"
                          aria-label={`Open ${s.displayName}’s page`}
                        >
                          Open <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </CardBody>
        </Card>
        <TeacherChangeRequests familyId={familyId} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Family details" description="Name, billing currency and time zone." />
            <CardBody>
              <QueryState query={family}>
                {(f) => <FamilyForm key={f.id} family={f} />}
              </QueryState>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Guardians" description="Everyone who can manage these children." />
            <CardBody>
              <GuardiansCard familyId={familyId} />
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.displayName}` : 'Edit child'}
        size="lg"
      >
        {editing && (
          <ChildForm
            key={editing.id}
            familyId={familyId}
            student={editing}
            defaultTimeZone={familyTz}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}
