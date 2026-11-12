'use client';

import { LANGUAGE_OPTIONS } from '@/lib/api/modules/families';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Pencil, Plus } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
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
import { TeacherChangeRequests } from './TeacherChangeRequests';

/** `/parent/children` — children list and add-child (with CR-01 consent); family settings are on `/parent/family`. */
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
  const router = useRouter();
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
          <CardHeader
            title="Add a child"
            description="Children don’t need an email address. We only store their birth year."
          />
          <CardBody>
            <AddChildFlow
              familyId={familyId}
              defaultTimeZone={familyTz}
              onCancel={() => setAdding(false)}
            />
          </CardBody>
        </Card>
      )}

      <div className="space-y-6">
        <div className="space-y-6">
          <section>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-ink font-sans">Your children</h2>
              {students.data && <p className="text-xs text-muted mt-0.5">{students.data.length} in this family</p>}
            </div>
              <QueryState
                query={students}
                empty={
                  <EmptyState
                    className="rounded-xl border border-line bg-white"
                    title="No children yet"
                    description="Add your first child to start booking classes."
                    action={
                      !adding ? (
                        <UiButton size="sm" onClick={() => setAdding(true)}>
                          Add a child
                        </UiButton>
                      ) : undefined
                    }
                  />
                }
              >
                {(rows) => (
                  <DataTable<FamilyStudent>
                    rows={rows}
                    rowKey={(r) => r.id}
                    onRowClick={(r) => router.push(`/parent/children/${r.id}`)}
                    columns={[
                      {
                        key: 'name',
                        header: 'Child',
                        render: (s) => (
                          <span className="flex items-center gap-3 min-w-0">
                            <Initial name={s.displayName} />
                            <span className="font-semibold text-ink truncate">{s.displayName}</span>
                          </span>
                        ),
                      },
                      { key: 'age', header: 'Age', render: (s) => ageFromBirthYear(s.birthYear) },
                      { key: 'gender', header: 'Gender', render: (s) => humanize(s.gender) },
                      {
                        key: 'language',
                        header: 'Language',
                        render: (s) =>
                          LANGUAGE_OPTIONS.find((l) => l.value === s.language)?.label ?? s.language.toUpperCase(),
                      },
                      { key: 'zone', header: 'Time zone', render: (s) => s.timeZone.replace(/_/g, ' ') },
                      {
                        key: 'access',
                        header: 'Sign-in',
                        render: (s) => (
                          <span className="flex flex-wrap gap-1.5">
                            {s.kidsMode && <Badge tone="gold">Kids mode</Badge>}
                            {s.userId && <Badge tone="blue">Own login</Badge>}
                            {!s.kidsMode && !s.userId && <span className="text-xs text-muted">Parent’s account</span>}
                          </span>
                        ),
                      },
                      {
                        key: 'actions',
                        header: '',
                        render: (s) => (
                          // The row opens the child; these buttons must not also open it.
                          <span className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
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
                          </span>
                        ),
                      },
                    ]}
                  />
                )}
              </QueryState>
          </section>
          <TeacherChangeRequests familyId={familyId} />
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
