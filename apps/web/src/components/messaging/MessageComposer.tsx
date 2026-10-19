'use client';

import React, { useId, useState } from 'react';
import { Send } from 'lucide-react';
import { Alert, TextArea, UiButton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import {
  detectContactDetails,
  MESSAGE_MAX_LENGTH,
  validateMessageBody,
} from '@/lib/api/modules/messaging';

/**
 * Message input. Enter sends, Shift+Enter adds a line. Validates to the backend DTO
 * (1–4000 chars after trimming) and holds back messages carrying contact details.
 * The text is cleared only after `onSend` resolves, so a failed send keeps the draft.
 */
export function MessageComposer({
  onSend,
  pending = false,
  disabled = false,
  placeholder = 'Write a message…',
}: {
  onSend: (body: string) => Promise<unknown>;
  pending?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const [body, setBody] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmedLength = body.trim().length;
  const validation = validateMessageBody(body);
  const contact = trimmedLength > 0 ? detectContactDetails(body) : null;
  const canSend = !validation && !contact && !pending && !disabled;
  const showLengthError = touched && trimmedLength > MESSAGE_MAX_LENGTH;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (!canSend) return;
    try {
      await onSend(body.trim());
      setBody('');
      setTouched(false);
    } catch {
      // The caller reports the error; keep the draft so nothing typed is lost.
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form onSubmit={submit} className="border-t border-line p-3 sm:p-4 space-y-2" aria-label="Send a message">
      {contact && (
        <Alert tone="warning" title="Please remove contact details">
          Your message looks like it contains {contact}. To keep children safe, all contact between
          families and teachers stays on Hifzoon.
        </Alert>
      )}
      <label htmlFor={id} className="sr-only">
        Message
      </label>
      <div className="flex items-end gap-2">
        <TextArea
          id={id}
          rows={2}
          value={body}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => setTouched(true)}
          onKeyDown={onKeyDown}
          aria-describedby={`${id}-hint`}
          aria-invalid={showLengthError || Boolean(contact) || undefined}
          className={cn('min-h-[44px] max-h-48 resize-none', showLengthError && 'border-red')}
        />
        <UiButton
          type="submit"
          loading={pending}
          disabled={!canSend}
          aria-label="Send message"
          icon={!pending ? <Send className="w-4 h-4" aria-hidden /> : undefined}
          className="shrink-0 h-11 w-11 px-0 sm:w-auto sm:px-5"
        >
          <span className="hidden sm:inline">Send</span>
        </UiButton>
      </div>
      <div id={`${id}-hint`} className="flex items-center justify-between gap-2 text-[11px] text-muted">
        <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
        <span
          className={cn('ml-auto tabular-nums', trimmedLength > MESSAGE_MAX_LENGTH && 'text-red font-semibold')}
          aria-live="polite"
        >
          {trimmedLength}/{MESSAGE_MAX_LENGTH}
        </span>
      </div>
      {showLengthError && (
        <p className="sr-only">
          {validation}
        </p>
      )}
    </form>
  );
}
