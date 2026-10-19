'use client';

import React, { useState } from 'react';
import { Circle, ShieldCheck } from 'lucide-react';
import { Alert, Badge, ErrorState, LoadingState, Modal, UiButton, formatDate } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useRecordingConsent, useStartRecording } from '@/hooks/useClassroom';
import { ApiClientError } from '@/lib/api/http';
import type { RecordingStarted } from '@/lib/api/modules/classroom';

function missingFromError(error: unknown): string[] {
  if (error instanceof ApiClientError && error.details && typeof error.details === 'object') {
    const missing = (error.details as { missing?: unknown }).missing;
    if (Array.isArray(missing)) return missing.map(String);
  }
  return [];
}

/**
 * Recording with the FR-CLS-12 consent check: every enrolled student needs
 * CLASS_RECORDING consent. The consent list is shown before the start button is enabled.
 */
export function RecordingControl({
  classId,
  joined,
  onStarted,
}: {
  classId: string;
  joined: boolean;
  /** Lets the meeting top bar show the REC pill once recording has really started. */
  onStarted?: (recording: RecordingStarted) => void;
}) {
  const consent = useRecordingConsent(classId);
  const start = useStartRecording(classId);
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [started, setStarted] = useState<RecordingStarted | null>(null);

  if (consent.isLoading) return <LoadingState label="Checking recording consent…" />;
  if (consent.isError || !consent.data) return <ErrorState error={consent.error} onRetry={() => consent.refetch()} title="Could not check recording consent" />;
  const data = consent.data;

  const doStart = () =>
    start.mutate(undefined, {
      onSuccess: (r) => {
        setStarted(r);
        onStarted?.(r);
        setConfirming(false);
        toast.success('Recording started');
      },
      onError: (e) => {
        setConfirming(false);
        const missing = missingFromError(e);
        toast.error(missing.length ? `Consent missing for: ${missing.join(', ')}` : e);
      },
    });

  return (
    <div className="space-y-3">
      {started ? (
        <Alert tone="success" title="Recording in progress">
          This recording is deleted automatically on {formatDate(started.deleteAfter)} (90-day retention).
        </Alert>
      ) : data.allowed ? (
        <p className="text-xs text-ink-2 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-green-600" aria-hidden />
          Every enrolled student has recording consent.
        </p>
      ) : (
        <Alert tone="warning" title="Recording is not allowed for this class">
          {data.students.length === 0
            ? 'No students are enrolled in this class.'
            : `Consent is missing for: ${data.missing.join(', ')}. Ask the family to grant CLASS_RECORDING consent.`}
        </Alert>
      )}

      {data.students.length > 0 && (
        <ul className="space-y-1" aria-label="Recording consent by student">
          {data.students.map((s) => (
            <li key={s.studentId} className="flex items-center justify-between text-xs">
              <span className="text-ink">{s.displayName}</span>
              {s.consented ? <Badge tone="green">Consented</Badge> : <Badge tone="red">No consent</Badge>}
            </li>
          ))}
        </ul>
      )}

      {!started && (
        <UiButton
          variant="danger"
          size="sm"
          className="w-full"
          icon={<Circle className="w-3 h-3 fill-current" aria-hidden />}
          disabled={!data.allowed || !joined}
          onClick={() => setConfirming(true)}
          title={!joined ? 'Join the room first — recording needs an open video room' : undefined}
        >
          Start recording
        </UiButton>
      )}
      {!started && !joined && data.allowed && (
        <p className="text-[11px] text-muted">Join the room first: recording needs an open video room.</p>
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Start recording?"
        description="All participants should be told the class is being recorded."
        size="sm"
        footer={
          <>
            <UiButton variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </UiButton>
            <UiButton variant="danger" onClick={doStart} loading={start.isPending}>
              Start recording
            </UiButton>
          </>
        }
      >
        <p className="text-sm text-ink-2">Recordings are kept for 90 days and then deleted automatically.</p>
      </Modal>
    </div>
  );
}
