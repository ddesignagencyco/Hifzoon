'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Alert, UiButton } from '@/components/ui/primitives';
import { ChildForm } from './ChildForm';
import { ConsentSetup } from './ConsentPanels';
import { AddStudentResult, isUnder13 } from '@/lib/api/modules/families';

type Step = { kind: 'form' } | { kind: 'consent'; child: AddStudentResult } | { kind: 'done'; child: AddStudentResult; consented: boolean };

/**
 * Add a child, then (CR-01) record consent. Under-13s are flagged by the backend
 * with `requiresConsent`; every child needs lesson-record consent before booking,
 * so the consent step is offered to all and is mandatory-in-tone for under-13s.
 */
export function AddChildFlow({
  familyId,
  defaultTimeZone,
  onFinished,
  onCancel,
  onAdded,
}: {
  familyId: string;
  defaultTimeZone: string;
  onFinished?: (studentId: string) => void;
  onCancel?: () => void;
  /** Called as soon as the child exists (before consent). */
  onAdded?: (studentId: string) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'form' });

  if (step.kind === 'form') {
    return (
      <ChildForm
        familyId={familyId}
        defaultTimeZone={defaultTimeZone}
        onAdded={(child) => {
          setStep({ kind: 'consent', child });
          onAdded?.(child.id);
        }}
        onCancel={onCancel}
      />
    );
  }

  if (step.kind === 'consent') {
    const under13 = step.child.requiresConsent || isUnder13(step.child.birthYear);
    return (
      <div className="space-y-3">
        <ol className="flex items-center gap-2 text-[11px] font-semibold text-muted" aria-label="Progress">
          <li className="text-green-700">1. Child details ✓</li>
          <li aria-hidden>›</li>
          <li className="text-ink" aria-current="step">2. Consent</li>
        </ol>
        <ConsentSetup
          studentId={step.child.id}
          displayName={step.child.displayName}
          under13={under13}
          onDone={() => setStep({ kind: 'done', child: step.child, consented: true })}
        />
        <div className="flex justify-start">
          <UiButton variant="ghost" size="sm" onClick={() => setStep({ kind: 'done', child: step.child, consented: false })}>
            I’ll do this later
          </UiButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {step.consented ? (
        <Alert tone="success" title={`${step.child.displayName} is all set`}>
          Consent is recorded. You can now enrol them in a course and book classes.
        </Alert>
      ) : (
        <Alert tone="warning" title={`Consent still needed for ${step.child.displayName}`}>
          Classes can’t be booked until consent for lesson records is given. You can do this from the child’s Consent tab.
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/parent/children/${step.child.id}`}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-green-800 text-white text-sm font-semibold hover:bg-green-700"
          onClick={() => onFinished?.(step.child.id)}
        >
          <CheckCircle2 className="w-4 h-4" aria-hidden /> Open {step.child.displayName}’s page
        </Link>
        <UiButton variant="secondary" onClick={() => setStep({ kind: 'form' })}>Add another child</UiButton>
      </div>
    </div>
  );
}
