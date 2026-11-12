'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Field, TextArea, UiButton, formatDate } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useCreateRevisionRequest, useRevisionRequests } from '@/hooks/useRevisionRequests';
import {
  REVISION_MESSAGE_MAX,
  REVISION_REASONS,
  RevisionReason,
  RevisionRequest,
  validateRevisionText,
} from '@/lib/api/modules/revision-requests';

/** The family's conversation with the teacher that a question was posted into. */
export function familyThreadHref(threadId: string | null | undefined): string {
  return threadId ? `/parent/messages/${encodeURIComponent(threadId)}` : '/parent/messages';
}

/**
 * On a shared lesson card in the family portal: ask the teacher about the card. The question
 * goes into the family's conversation with the teacher in Messages, where the teacher replies;
 * there is no separate request queue. Inline rather than a second dialog, because the card
 * itself is already a dialog and stacked dialogs fight over Escape and focus.
 */
export function AskTeacherAboutCard({ lessonCardId }: { lessonCardId: string }) {
  const asked = useRevisionRequests({ scope: 'family', lessonCardId });
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState<RevisionRequest | null>(null);
  const earlier = (asked.data ?? []).filter((r) => r.id !== sent?.id);

  return (
    <section aria-labelledby={`ask-${lessonCardId}`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`ask-${lessonCardId}`} className="text-sm font-semibold text-ink font-sans">
          Questions for the teacher
        </h3>
        {!asking && (
          <UiButton
            size="sm"
            variant="secondary"
            icon={<MessageSquare className="w-3.5 h-3.5" aria-hidden />}
            onClick={() => {
              setSent(null);
              setAsking(true);
            }}
          >
            Ask the teacher about this card
          </UiButton>
        )}
      </div>
      {asking && (
        <AskTeacherForm
          lessonCardId={lessonCardId}
          onDone={(created) => {
            setAsking(false);
            if (created) setSent(created);
          }}
        />
      )}
      {sent && !asking && (
        <p
          role="status"
          className="rounded-lg bg-green-50 border border-green-600/20 px-3 py-2 text-xs text-ink"
        >
          Sent to {sent.lessonCard.teacher.name} in Messages.{' '}
          <Link
            href={familyThreadHref(sent.threadId)}
            className="font-semibold text-green-700 hover:underline"
          >
            Open conversation
          </Link>
        </p>
      )}
      {!asking && !sent && earlier.length === 0 && (
        <p className="text-xs text-muted">
          Ask for a portion to be revisited, a mistake explained, or an extra class. Your message
          goes to the teacher in Messages.
        </p>
      )}
      {earlier.length > 0 && (
        <ul className="space-y-1">
          {earlier.map((r) => (
            <li key={r.id} className="text-xs text-muted">
              Asked on {formatDate(r.createdAt)} —{' '}
              <Link
                href={familyThreadHref(r.threadId)}
                className="font-semibold text-green-700 hover:underline"
              >
                open conversation
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AskTeacherForm({
  lessonCardId,
  onDone,
}: {
  lessonCardId: string;
  onDone: (created?: RevisionRequest) => void;
}) {
  const toast = useToast();
  const create = useCreateRevisionRequest(lessonCardId);
  const [reason, setReason] = useState<RevisionReason>('REVISIT_PORTION');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reasonLabelId = `ask-reason-${lessonCardId}`;
  const messageId = `ask-message-${lessonCardId}`;

  return (
    <form
      noValidate
      className="rounded-xl border border-line bg-cream/60 p-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const problem = validateRevisionText(message, REVISION_MESSAGE_MAX);
        setError(problem);
        if (problem) return;
        create.mutate(
          { reason, message },
          {
            onSuccess: (created) => {
              toast.success('Sent to the teacher in Messages');
              onDone(created);
            },
            onError: (err) => toast.error(err),
          },
        );
      }}
    >
      <div>
        <p id={reasonLabelId} className="text-xs font-semibold text-ink-2 mb-1.5">
          What is it about?
        </p>
        <div role="radiogroup" aria-labelledby={reasonLabelId} className="flex flex-wrap gap-1.5">
          {REVISION_REASONS.map((r) => {
            const selected = r.value === reason;
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setReason(r.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                  selected
                    ? 'border-green-800 bg-green-800 text-white'
                    : 'border-line bg-white text-ink-2 hover:bg-sand',
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
      <Field
        label="Message"
        htmlFor={messageId}
        error={error}
        hint={`${message.trim().length}/${REVISION_MESSAGE_MAX}`}
      >
        <TextArea
          id={messageId}
          rows={4}
          maxLength={REVISION_MESSAGE_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={Boolean(error)}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <UiButton type="button" variant="ghost" size="sm" onClick={() => onDone()}>
          Cancel
        </UiButton>
        <UiButton type="submit" size="sm" loading={create.isPending}>
          Send to teacher
        </UiButton>
      </div>
    </form>
  );
}
