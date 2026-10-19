'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, LogOut, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { formatDateTime } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  RoomToken,
  isFakeVideoUrl,
  participantRoleLabel,
  roomIdFromUrl,
} from '@/lib/api/modules/classroom';
import { ControlButton, InfoChip, ParticipantTile } from './MeetingChrome';

/*
 * Video for the signed-in user. It is honest about what works: the API returns the
 * provider room URL and a signed room token, but not a provider media token, and the
 * development provider is a fake (`fake://`). So only a *local* camera preview is shown —
 * remote participants' video is never pretended (their tiles show initials).
 */

export interface LocalPreview {
  stream: MediaStream | null;
  camOn: boolean;
  micOn: boolean;
  starting: boolean;
  start: () => Promise<void>;
  stop: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
}

/** The local camera/microphone preview. Tracks stop on unmount, on stop and on change. */
export function useLocalPreview(lowBandwidth: boolean): LocalPreview {
  const toast = useToast();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  // Low-bandwidth mode drops video first (FR-CLS-11); audio stays.
  useEffect(() => {
    stream?.getVideoTracks().forEach((t) => {
      t.enabled = camOn && !lowBandwidth;
    });
  }, [stream, camOn, lowBandwidth]);

  useEffect(() => {
    stream?.getAudioTracks().forEach((t) => {
      t.enabled = micOn;
    });
  }, [stream, micOn]);

  const start = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('This browser cannot access a camera or microphone.');
      return;
    }
    setStarting(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: !lowBandwidth, audio: true });
      setStream(s);
    } catch (err) {
      const name = (err as DOMException)?.name;
      toast.error(
        name === 'NotAllowedError'
          ? 'Camera and microphone permission was refused. You can allow it from the address bar.'
          : name === 'NotFoundError'
            ? 'No camera or microphone was found.'
            : 'Could not start the camera or microphone.',
      );
    } finally {
      setStarting(false);
    }
  };

  const stop = useCallback(() => setStream(null), []);

  return {
    stream,
    camOn,
    micOn,
    starting,
    start,
    stop,
    toggleMic: () => setMicOn((v) => !v),
    toggleCam: () => setCamOn((v) => !v),
  };
}

/** The signed-in user's own tile: their real camera preview, or their initials. */
export function SelfVideoTile({
  token,
  name,
  preview,
  lowBandwidth,
}: {
  token: RoomToken;
  name: string;
  preview: LocalPreview;
  lowBandwidth: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { stream, camOn, micOn } = preview;

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const canPublish = token.role !== 'GUARDIAN_VIEWER';
  return (
    <ParticipantTile
      name={name}
      role={token.role}
      you
      video={
        stream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover -scale-x-100"
            aria-label="Your camera preview"
          />
        ) : undefined
      }
      overlay={
        stream && (lowBandwidth || !camOn) ? (
          <div className="absolute inset-0 flex items-center justify-center bg-green-950/90 px-3 text-center text-xs text-white/85">
            {lowBandwidth ? 'Video paused — low-bandwidth mode' : 'Camera off'}
          </div>
        ) : !stream && canPublish ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] text-white/85">
            <VideoOff className="h-3 w-3" aria-hidden />
            Preview off
          </span>
        ) : undefined
      }
      mic={
        stream ? (
          micOn ? (
            <Mic className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-label="Your microphone is on" />
          ) : (
            <MicOff className="h-3.5 w-3.5 shrink-0 text-red-300" aria-label="You are muted" />
          )
        ) : undefined
      }
    />
  );
}

/** Development / not-yet-wired video provider note, as a small disclosure chip. */
export function VideoProviderChip({ token }: { token: RoomToken }) {
  const fake = isFakeVideoUrl(token.url);
  return (
    <InfoChip label={fake ? 'Development video provider' : 'Video provider'}>
      {fake ? (
        <p>
          No media server is connected in this environment, so other participants&rsquo; video and audio are not shown. Any
          camera preview stays on your device.
        </p>
      ) : (
        <p>
          The room is open at the provider, but this web client has no media SDK connected yet, so remote video is not shown
          here.
        </p>
      )}
    </InfoChip>
  );
}

/** Meeting-style controls for the signed-in user: Mute, Camera, Stop preview, Leave. */
export function MediaControls({
  token,
  preview,
  lowBandwidth,
  onLeave,
}: {
  token: RoomToken;
  preview: LocalPreview;
  lowBandwidth: boolean;
  onLeave: () => void;
}) {
  const canPublish = token.role !== 'GUARDIAN_VIEWER';
  const { stream, micOn, camOn } = preview;
  return (
    <>
      {!canPublish ? (
        <span className="text-xs text-white/75">
          Watching only — your camera and microphone are never shared with the class.
        </span>
      ) : !stream ? (
        <ControlButton tone="neutral" onClick={preview.start} loading={preview.starting} icon={<Video className="h-4 w-4" aria-hidden />}>
          Start camera &amp; mic
        </ControlButton>
      ) : (
        <>
          <ControlButton
            tone={micOn ? 'neutral' : 'off'}
            onClick={preview.toggleMic}
            aria-pressed={!micOn}
            icon={micOn ? <Mic className="h-4 w-4" aria-hidden /> : <MicOff className="h-4 w-4" aria-hidden />}
          >
            {micOn ? 'Mute' : 'Unmute'}
          </ControlButton>
          <ControlButton
            tone={camOn ? 'neutral' : 'off'}
            onClick={preview.toggleCam}
            aria-pressed={!camOn}
            disabled={lowBandwidth || stream.getVideoTracks().length === 0}
            icon={camOn ? <Camera className="h-4 w-4" aria-hidden /> : <CameraOff className="h-4 w-4" aria-hidden />}
          >
            {camOn ? 'Camera off' : 'Camera on'}
          </ControlButton>
          <ControlButton tone="neutral" onClick={preview.stop} icon={<VideoOff className="h-4 w-4" aria-hidden />}>
            Stop preview
          </ControlButton>
        </>
      )}
      <ControlButton tone="danger" onClick={onLeave} icon={<LogOut className="h-4 w-4" aria-hidden />}>
        Leave
      </ControlButton>
    </>
  );
}

/** Room id, role and token expiry — shown in the Connection panel. */
export function RoomDetails({ token }: { token: RoomToken }) {
  return (
    <dl className="space-y-1.5 text-xs">
      <div className="flex justify-between gap-2">
        <dt className="text-white/60">Video room</dt>
        <dd className="text-white" title={roomIdFromUrl(token.url)}>
          Connected
        </dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="text-white/60">Joined as</dt>
        <dd className="text-white">{participantRoleLabel(token.role)}</dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="text-white/60">Access expires</dt>
        <dd className="text-white">{formatDateTime(token.expiresAt)}</dd>
      </div>
    </dl>
  );
}
