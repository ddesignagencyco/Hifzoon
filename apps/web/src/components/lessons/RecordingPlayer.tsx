'use client';

import React, { useRef } from 'react';
import { PlayCircle } from 'lucide-react';
import { formatDate, humanize } from '@/components/ui/primitives';
import { useClassRecording } from '@/hooks/useClassroom';
import { ApiClientError } from '@/lib/api/http';

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The class recording on a lesson card (FR-PAR-02): a player and the marked points
 * (ayahs, mistakes) to jump to. Shown only when the class was recorded; families lose
 * access once recording consent is withdrawn.
 */
export function RecordingPlayer({ classId }: { classId: string }) {
  const recording = useClassRecording(classId);
  const video = useRef<HTMLVideoElement>(null);

  if (recording.isLoading) return <p className="text-xs text-muted">Loading the recording…</p>;
  if (recording.isError) {
    const consent = recording.error instanceof ApiClientError && recording.error.status === 403;
    return (
      <p className="text-xs text-muted">
        {consent ? 'Recording consent was withdrawn, so this recording can no longer be watched.' : 'The recording could not be loaded.'}
      </p>
    );
  }
  const data = recording.data;
  if (!data) return null;
  if (data.status !== 'READY' || !data.url) {
    return (
      <p className="text-xs text-muted">
        {data.status === 'RECORDING' || data.status === 'PENDING'
          ? 'The recording is being prepared. Check back in a few minutes.'
          : `Recording ${humanize(data.status).toLowerCase()}.`}
      </p>
    );
  }

  const jump = (ms: number) => {
    if (!video.current) return;
    video.current.currentTime = ms / 1000;
    void video.current.play().catch(() => undefined);
  };

  return (
    <div className="space-y-2">
      <video ref={video} src={data.url} controls preload="metadata" className="w-full rounded-xl bg-black" />
      <p className="text-[11px] text-muted">Kept until {formatDate(data.deleteAfter)}.</p>
      {data.markers.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto" aria-label="Jump to a point in the class">
          {data.markers.map((m, i) => (
            <li key={`${m.offsetMs}-${i}`}>
              <button
                type="button"
                onClick={() => jump(m.offsetMs)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <PlayCircle className="h-3.5 w-3.5 text-green-700" aria-hidden />
                <span className="tabular-nums text-muted">{clock(m.offsetMs)}</span>
                <span className="text-ink">
                  {humanize(m.kind)}
                  {m.surah && m.ayah ? ` · ${m.surah}:${m.ayah}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
