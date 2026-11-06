'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Pencil } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  QueryState,
  UiButton,
  formatDate,
} from '@/components/ui/primitives';
import { useFamilyDetail } from '@/hooks/useFamily';
import { ageFromBirthYear, FamilyDetail, FamilySummary } from '@/lib/api/modules/families';
import { FamilySwitcher, InfoRow, Initial, WithActiveFamily } from './shared';
import { Onboarding } from './Onboarding';
import { FamilyForm } from './FamilyForm';
import { GuardiansCard, GuardianVerification } from './GuardianPanels';

/**
 * `/parent/family` — the family account in one place: its details (editable), the signed-in
 * guardian's verification, every guardian with their role, and the children it covers.
 * These used to be split between onboarding, the overview header and the Children page.
 */
export function FamilyScreen() {
  return (
    <WithActiveFamily onNoFamily={<Onboarding familyId={null} membership={null} />}>
      {({ familyId, membership }) => (
        <FamilyAccount key={familyId} familyId={familyId} membership={membership} />
      )}
    </WithActiveFamily>
  );
}

function FamilyAccount({
  familyId,
  membership,
}: {
  familyId: string;
  membership: FamilySummary['members'][number] | null;
}) {
  const family = useFamilyDetail(familyId);
  return (
    <>
      <PageHeader
        eyebrow="Family portal"
        title="Family"
        description="Your family account, the guardians who manage it and the children it covers."
        actions={<FamilySwitcher />}
      />
      <QueryState query={family} loadingLabel="Loading your family…">
        {(f) => (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] items-start">
            <div className="space-y-6 min-w-0">
              <FamilyDetailsCard family={f} />
              <ChildrenCard family={f} />
            </div>
            <div className="space-y-6 min-w-0">
              {membership && (
                <Card>
                  <CardHeader
                    title="Your guardian status"
                    description="Verification links you to this family’s children."
                  />
                  <CardBody>
                    <GuardianVerification
                      familyId={f.id}
                      verifiedAt={membership.verifiedAt}
                      isPrimary={membership.isPrimary}
                    />
                  </CardBody>
                </Card>
              )}
              <Card>
                <CardHeader
                  title="Guardians"
                  description="Everyone who can manage these children, with their role."
                />
                <CardBody>
                  <GuardiansCard familyId={f.id} />
                </CardBody>
              </Card>
            </div>
          </div>
        )}
      </QueryState>
    </>
  );
}

function FamilyDetailsCard({ family: f }: { family: FamilyDetail }) {
  const [editing, setEditing] = useState(false);
  const verified = f.members.filter((m) => m.verifiedAt).length;
  return (
    <Card>
      <CardHeader
        title="Family details"
        description="Name, time zone and billing details."
        action={
          !editing && (
            <UiButton
              variant="secondary"
              size="sm"
              icon={<Pencil className="w-3.5 h-3.5" />}
              onClick={() => setEditing(true)}
            >
              Edit
            </UiButton>
          )
        }
      />
      <CardBody>
        {editing ? (
          <FamilyForm
            family={f}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
            submitLabel="Save family details"
          />
        ) : (
          <dl>
            <InfoRow label="Family name">{f.name}</InfoRow>
            <InfoRow label="Time zone">{f.timeZone.replace(/_/g, ' ')}</InfoRow>
            <InfoRow label="Country">{f.country ?? '—'}</InfoRow>
            <InfoRow label="Billing currency">USD (checkout can show your local currency)</InfoRow>
            <InfoRow label="Billing name">{f.billingName ?? '—'}</InfoRow>
            <InfoRow label="Guardians">
              {f.members.length} ({verified} verified)
            </InfoRow>
            <InfoRow label="Family since">{formatDate(f.createdAt)}</InfoRow>
          </dl>
        )}
      </CardBody>
    </Card>
  );
}

function ChildrenCard({ family: f }: { family: FamilyDetail }) {
  return (
    <Card>
      <CardHeader
        title="Children"
        description={`${f.students.length} in this family`}
        action={
          <Link
            href="/parent/children"
            className="text-xs font-semibold text-green-700 hover:underline"
          >
            Manage children
          </Link>
        }
      />
      <CardBody>
        {f.students.length === 0 ? (
          <p className="text-sm text-muted">No children added yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {f.students.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/parent/children/${s.id}`}
                  className="flex items-center justify-between gap-3 py-3 rounded-lg hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Initial name={s.displayName} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink truncate">
                        {s.displayName}
                      </span>
                      <span className="block text-xs text-muted">
                        Age {ageFromBirthYear(s.birthYear)} · {s.timeZone.replace(/_/g, ' ')}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {s.kidsMode && <Badge tone="gold">Kids mode</Badge>}
                    <ChevronRight className="w-4 h-4 text-muted" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
