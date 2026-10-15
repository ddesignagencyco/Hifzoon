'use client';

import React, { useState } from 'react';
import { Wifi } from 'lucide-react';
import { Alert, Badge, BadgeTone, Checkbox, ErrorState, LoadingState, UiButton } from '@/components/ui/primitives';
import { useBandwidthAdvice } from '@/hooks/useClassroom';
import { BandwidthQuery, BandwidthTier } from '@/lib/api/modules/classroom';

interface NetworkInformationLike {
  rtt?: number;
  downlink?: number;
}

/** Reads the browser's Network Information API, when it exists (Chromium only). */
function readConnection(): BandwidthQuery | null {
  if (typeof navigator === 'undefined') return null;
  const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!conn || typeof conn.rtt !== 'number' || typeof conn.downlink !== 'number') return null;
  return {
    rttMs: Math.min(10000, Math.max(0, Math.round(conn.rtt))),
    // `downlink` is in Mbit/s.
    downlinkKbps: Math.min(100000, Math.max(0, Math.round(conn.downlink * 1000))),
  };
}

const TIER_TONE: Record<BandwidthTier, BadgeTone> = {
  GOOD: 'green',
  DEGRADED: 'amber',
  AUDIO_ONLY: 'red',
  RECOVERING: 'gold',
};

/**
 * Connection check + low-bandwidth mode (FR-CLS-11). Video degrades first; audio and
 * the Mushaf sync never do.
 */
export function BandwidthPanel({
  lowBandwidth,
  onLowBandwidthChange,
}: {
  lowBandwidth: boolean;
  onLowBandwidthChange: (value: boolean) => void;
}) {
  const [query, setQuery] = useState<BandwidthQuery | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const advice = useBandwidthAdvice(query);

  const check = () => {
    const q = readConnection();
    if (!q) {
      setUnsupported(true);
      return;
    }
    setUnsupported(false);
    setQuery(q);
  };

  return (
    <div className="space-y-3">
      <Checkbox
        id="low-bandwidth-mode"
        checked={lowBandwidth}
        onChange={onLowBandwidthChange}
        label="Low-bandwidth mode"
        description="Turns your camera off. Audio and the Mushaf stay in sync."
      />
      <UiButton variant="secondary" size="sm" onClick={check} icon={<Wifi className="w-3.5 h-3.5" aria-hidden />}>
        Check my connection
      </UiButton>
      {unsupported && (
        <p className="text-xs text-muted">
          This browser does not report connection quality. If video stutters, switch on low-bandwidth mode.
        </p>
      )}
      {query && advice.isLoading && <LoadingState label="Asking for advice…" className="py-4" />}
      {query && advice.isError && <ErrorState error={advice.error} onRetry={() => advice.refetch()} className="py-4" />}
      {query && advice.data && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
            <Badge tone={TIER_TONE[advice.data.tier] ?? 'neutral'}>{advice.data.tier.replace('_', ' ')}</Badge>
            <span>
              {query.rttMs} ms · {(query.downlinkKbps / 1000).toFixed(1)} Mbit/s
            </span>
          </div>
          <p className="text-xs text-ink-2">{advice.data.reason}</p>
          {!advice.data.publishVideo && !lowBandwidth && (
            <Alert tone="warning">
              Your connection is too weak for video.{' '}
              <button type="button" className="underline font-semibold cursor-pointer" onClick={() => onLowBandwidthChange(true)}>
                Switch on low-bandwidth mode
              </button>
            </Alert>
          )}
          {advice.data.publishVideo && advice.data.requestResolution !== '0' && (
            <p className="text-[11px] text-muted">Suggested video quality: {advice.data.requestResolution}</p>
          )}
        </div>
      )}
    </div>
  );
}
