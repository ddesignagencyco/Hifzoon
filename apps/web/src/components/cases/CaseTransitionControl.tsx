'use client';

import React, { useState } from 'react';
import { UiButton, humanize } from '@/components/ui/primitives';
import { allowedTransitions, CaseStatus } from '@/lib/api/modules/cases';

/**
 * Offers only the next states the workflow allows from `status`. Closing is shown but
 * disabled (with the reason) until the case has at least one note, and asks for a
 * second click to confirm because a closed case cannot be reopened.
 */
export function CaseTransitionControl({
  status,
  noteCount,
  pending,
  onTransition,
}: {
  status: CaseStatus;
  noteCount: number;
  pending?: boolean;
  onTransition: (next: Exclude<CaseStatus, 'OPEN'>) => void;
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const options = allowedTransitions(status, noteCount);

  if (options.length === 0) {
    return <p className="text-xs text-muted">This case is closed. Closed cases are final and cannot be reopened.</p>;
  }

  const closeOption = options.find((o) => o.status === 'CLOSED');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Move case to">
        {options.map((option) => {
          const isClose = option.status === 'CLOSED';
          return (
            <UiButton
              key={option.status}
              size="sm"
              variant={isClose ? (confirmClose ? 'danger' : 'secondary') : 'primary'}
              disabled={option.disabled || pending}
              loading={pending && !option.disabled && (!isClose || confirmClose)}
              aria-describedby={option.disabled ? `transition-reason-${option.status}` : undefined}
              onClick={() => {
                if (isClose && !confirmClose) {
                  setConfirmClose(true);
                  return;
                }
                setConfirmClose(false);
                onTransition(option.status);
              }}
            >
              {isClose && confirmClose ? 'Confirm close' : `Move to ${humanize(option.status).toLowerCase()}`}
            </UiButton>
          );
        })}
        {confirmClose && (
          <UiButton size="sm" variant="ghost" onClick={() => setConfirmClose(false)} disabled={pending}>
            Cancel
          </UiButton>
        )}
      </div>
      {closeOption?.disabled && (
        <p id={`transition-reason-${closeOption.status}`} className="text-[11px] text-amber">
          {closeOption.reason}
        </p>
      )}
      {confirmClose && (
        <p className="text-[11px] text-red" role="alert">
          Closing is final. Make sure the notes record what was done.
        </p>
      )}
    </div>
  );
}
