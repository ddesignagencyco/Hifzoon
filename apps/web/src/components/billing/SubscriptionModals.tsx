'use client';

import React, { useState } from 'react';
import { Alert, Field, Modal, TextInput, UiButton, formatDate } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useCancelSubscription, usePauseSubscription } from '@/hooks/useBilling';
import {
  FamilySubscription,
  PAUSE_MAX_DAYS,
  PAUSE_MIN_DAYS,
  validatePauseDays,
} from '@/lib/api/modules/billing-family';

/** Confirms a cancellation, defaulting to "at the end of the current period" (FR-BIL-06). */
export function CancelSubscriptionModal({
  subscription,
  onClose,
}: {
  subscription: FamilySubscription;
  onClose: () => void;
}) {
  const cancel = useCancelSubscription();
  const toast = useToast();
  const [atPeriodEnd, setAtPeriodEnd] = useState(true);
  const periodEnd = subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : null;

  const confirm = () =>
    cancel.mutate(
      { subscriptionId: subscription.id, atPeriodEnd },
      {
        onSuccess: () => {
          toast.success(
            atPeriodEnd
              ? `${subscription.plan.name} will end${periodEnd ? ` on ${periodEnd}` : ' at the end of this period'}`
              : `${subscription.plan.name} has been cancelled`,
          );
          onClose();
        },
        onError: (error) => toast.error(error),
      },
    );

  const close = cancel.isPending ? () => undefined : onClose;

  return (
    <Modal
      open
      onClose={close}
      size="sm"
      title="Cancel subscription?"
      description={subscription.plan.name}
      footer={
        <>
          <UiButton variant="secondary" onClick={onClose} disabled={cancel.isPending}>
            Keep subscription
          </UiButton>
          <UiButton variant="danger" onClick={confirm} loading={cancel.isPending}>
            {atPeriodEnd ? 'Cancel at period end' : 'Cancel now'}
          </UiButton>
        </>
      }
    >
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-ink-2 mb-2">When should it end?</legend>
        <label className="flex items-start gap-3 rounded-xl border border-line p-3 cursor-pointer has-[:checked]:border-gold has-[:checked]:bg-gold-100/40">
          <input
            type="radio"
            name="cancel-when"
            className="mt-0.5 accent-green-800"
            checked={atPeriodEnd}
            onChange={() => setAtPeriodEnd(true)}
          />
          <span>
            <span className="block text-sm font-medium text-ink">At the end of the current period (recommended)</span>
            <span className="block text-xs text-muted">
              Classes continue{periodEnd ? ` until ${periodEnd}` : ' until the paid period ends'}. You will not be
              billed again.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-line p-3 cursor-pointer has-[:checked]:border-red has-[:checked]:bg-red/5">
          <input
            type="radio"
            name="cancel-when"
            className="mt-0.5 accent-green-800"
            checked={!atPeriodEnd}
            onChange={() => setAtPeriodEnd(false)}
          />
          <span>
            <span className="block text-sm font-medium text-ink">Immediately</span>
            <span className="block text-xs text-muted">
              The subscription stops today and cannot be resumed. No automatic refund is issued for the rest of the current period.
            </span>
          </span>
        </label>
      </fieldset>
      <Alert tone="warning" className="mt-4">
        To restart later you will need to choose a plan and subscribe again.
      </Alert>
    </Modal>
  );
}

/** Pause for 1–30 days (FR-BIL-07). */
export function PauseSubscriptionModal({
  subscription,
  onClose,
}: {
  subscription: FamilySubscription;
  onClose: () => void;
}) {
  const pause = usePauseSubscription();
  const toast = useToast();
  const [daysText, setDaysText] = useState('14');
  const [touched, setTouched] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const days = Number(daysText);
  const error = validatePauseDays(days);
  const resumeOn = error ? null : formatDate(new Date(openedAt + days * 864e5));

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (error) return toast.error(error);
    pause.mutate(
      { subscriptionId: subscription.id, days },
      {
        onSuccess: (updated) => {
          toast.success(`Paused until ${formatDate(updated.pausedUntil)}`);
          onClose();
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <Modal
      open
      onClose={pause.isPending ? () => undefined : onClose}
      size="sm"
      title="Pause subscription"
      description={subscription.plan.name}
      footer={
        <>
          <UiButton variant="secondary" onClick={onClose} disabled={pause.isPending}>
            Back
          </UiButton>
          <UiButton type="submit" form="pause-form" loading={pause.isPending}>
            Pause subscription
          </UiButton>
        </>
      }
    >
      <form id="pause-form" onSubmit={confirm} className="space-y-4" noValidate>
        <Field
          label="Pause for (days)"
          htmlFor="pause-days"
          required
          error={touched ? error : null}
          hint={`Between ${PAUSE_MIN_DAYS} and ${PAUSE_MAX_DAYS} days.`}
        >
          <TextInput
            id="pause-days"
            type="number"
            inputMode="numeric"
            min={PAUSE_MIN_DAYS}
            max={PAUSE_MAX_DAYS}
            step={1}
            value={daysText}
            onChange={(e) => setDaysText(e.target.value)}
            onBlur={() => setTouched(true)}
          />
        </Field>
        <Alert tone="neutral">
          Billing for this plan is paused with the payment provider.
          {resumeOn ? ` It stays paused until ${resumeOn}; you can resume early at any time from this page.` : ''}
        </Alert>
      </form>
    </Modal>
  );
}
