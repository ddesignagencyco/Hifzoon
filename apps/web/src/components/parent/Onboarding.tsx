'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardBody, PageHeader } from '@/components/ui/primitives';
import { FamilyForm } from './FamilyForm';
import { GuardianVerification } from './GuardianPanels';
import { AddChildFlow } from './AddChildFlow';
import { browserTimeZone } from '@/lib/api/modules/families';

interface OnboardingProps {
  /** Null until the family account exists. */
  familyId: string | null;
  familyTimeZone?: string;
  membership: { verifiedAt: string | null; isPrimary: boolean } | null;
  onChildAdded?: (studentId: string) => void;
}

const STEPS = [
  { key: 'family', title: 'Create your family account', body: 'Your family groups children, guardians and billing together.' },
  { key: 'verify', title: 'Verify you as the guardian', body: 'Confirms your link to the family (required by our child-safety policy).' },
  { key: 'child', title: 'Add your first child', body: 'No email needed for children — just a name and birth year.' },
  { key: 'consent', title: 'Give parental consent', body: 'Choose what we may do with your child’s learning data. Each choice is separate.' },
] as const;

/** First-run walkthrough for a new guardian: family → verification → child → consent. */
export function Onboarding({ familyId, familyTimeZone, membership, onChildAdded }: OnboardingProps) {
  const verified = Boolean(membership?.verifiedAt);
  const current = !familyId ? 0 : !verified ? 1 : 2;

  return (
    <>
      <PageHeader
        eyebrow="Welcome to Hifzoon"
        title="Let’s set up your family"
        description="Four short steps and your children are ready to start learning."
      />
      <ol className="space-y-3" aria-label="Setup steps">
        {STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current || (index === 3 && current === 2);
          const showBody = index === current;
          return (
            <li key={step.key} aria-current={index === current ? 'step' : undefined}>
              <Card className={cn(!active && !done && 'opacity-70')}>
                <div className="flex items-start gap-3 px-5 pt-5 pb-3">
                  <span
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
                      done ? 'bg-green-700 text-white' : active ? 'bg-gold text-green-950' : 'bg-sand text-muted',
                    )}
                    aria-hidden
                  >
                    {done ? <Check className="w-4 h-4" /> : index + 1}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-ink font-sans">
                      {step.title}
                      {done && <span className="sr-only"> (done)</span>}
                    </h2>
                    <p className="text-xs text-muted mt-0.5">{step.body}</p>
                  </div>
                </div>
                {showBody && (
                  <CardBody>
                    {index === 0 && <FamilyForm submitLabel="Create family and continue" />}
                    {index === 1 && familyId && (
                      <GuardianVerification
                        familyId={familyId}
                        verifiedAt={membership?.verifiedAt ?? null}
                        isPrimary={membership?.isPrimary ?? false}
                      />
                    )}
                    {index === 2 && familyId && (
                      <AddChildFlow familyId={familyId} defaultTimeZone={familyTimeZone ?? browserTimeZone()} onAdded={onChildAdded} />
                    )}
                  </CardBody>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
    </>
  );
}
