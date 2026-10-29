'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { RemoteTrack } from 'livekit-client';
import type { LinkQuality } from './useLiveKit';
import { cn } from '@/lib/utils';
import { Mic, MicOff, PhoneOff, Settings2, SwitchCamera, Video, VideoOff, Volume2 } from 'lucide-react';
import { formatDateTime } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  RoomToken,
  participantRoleLabel,
  roomIdFromUrl,
} from '@/lib/api/modules/classroom';
import { ParticipantTile, IconControl } from './MeetingChrome';

/** The signed-in user's camera and microphone, with device choice (and front/back on phones). */
export interface LocalPreview {
  stream: MediaStream | null;
  camOn: boolean;
  micOn: boolean;
  starting: boolean;
  start: () => Promise<void>;
  stop: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  cameraId: string;
  microphoneId: string;
  setCamera: (deviceId: string) => void;
  setMicrophone: (deviceId: string) => void;
  /** Phones: swap between the front and back camera. */
  flipCamera: () => void;
}

type Facing = 'user' | 'environment';

/** The local camera/microphone preview. Tracks stop on unmount, on stop and on change. */
export function useLocalPreview(lowBandwidth: boolean): LocalPreview {
  const toast = useToast();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [starting, setStarting] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState('');
  const [microphoneId, setMicrophoneId] = useState('');
  const [facing, setFacing] = useState<Facing>('user');
  // Bumped on stop and unmount, so a camera that resolves after the user left is switched off.
  const generation = useRef(0);

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

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

  // Device labels are only readable once permission is granted, so list them after the first start.
  useEffect(() => {
    if (!stream || typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    const md = navigator.mediaDevices;
    const refresh = () => void md.enumerateDevices().then(setDevices).catch(() => undefined);
    refresh();
    md.addEventListener?.('devicechange', refresh);
    return () => md.removeEventListener?.('devicechange', refresh);
  }, [stream]);

  const acquire = async (choice: { cameraId: string; microphoneId: string; facing: Facing }) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('This browser cannot access a camera or microphone.');
      return;
    }
    setStarting(true);
    const started = generation.current;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: lowBandwidth
          ? false
          : choice.cameraId
            ? { deviceId: { exact: choice.cameraId } }
            : { facingMode: choice.facing },
        audio: choice.microphoneId ? { deviceId: { exact: choice.microphoneId } } : true,
      });
      if (generation.current !== started) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      setStream(s);
    } catch (err) {
      const name = (err as DOMException)?.name;
      toast.error(
        name === 'NotAllowedError'
          ? 'Camera and microphone permission was refused. You can allow it from the address bar.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'That camera or microphone was not found.'
            : name === 'NotReadableError'
              ? 'The camera or microphone is being used by another app.'
              : 'Could not start the camera or microphone.',
      );
    } finally {
      setStarting(false);
    }
  };

  const start = () => acquire({ cameraId, microphoneId, facing });

  const stop = useCallback(() => {
    generation.current += 1;
    setStream(null);
  }, []);

  const setCamera = (id: string) => {
    setCameraId(id);
    if (stream) void acquire({ cameraId: id, microphoneId, facing });
  };
  const setMicrophone = (id: string) => {
    setMicrophoneId(id);
    if (stream) void acquire({ cameraId, microphoneId: id, facing });
  };
  const flipCamera = () => {
    const next: Facing = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    setCameraId('');
    if (stream) void acquire({ cameraId: '', microphoneId, facing: next });
  };

  return {
    stream,
    camOn,
    micOn,
    starting,
    start,
    stop,
    toggleMic: () => setMicOn((v) => !v),
    toggleCam: () => setCamOn((v) => !v),
    cameras: devices.filter((d) => d.kind === 'videoinput'),
    microphones: devices.filter((d) => d.kind === 'audioinput'),
    cameraId,
    microphoneId,
    setCamera,
    setMicrophone,
    flipCamera,
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

/** Meeting-style controls: mic, camera, device settings and Leave — icon-only like Meet or Zoom. */
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
  const hasVideo = Boolean(stream && stream.getVideoTracks().length > 0);
  const micActive = Boolean(stream) && micOn;
  const camActive = hasVideo && camOn && !lowBandwidth;
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Your microphone and camera">
      {canPublish && (
        <>
          <IconControl
            label={!stream ? 'Turn on microphone' : micOn ? 'Mute microphone' : 'Unmute microphone'}
            tone={micActive ? 'neutral' : 'off'}
            aria-pressed={micActive}
            loading={preview.starting}
            onClick={!stream ? preview.start : preview.toggleMic}
            icon={micActive ? <Mic className="h-5 w-5" aria-hidden /> : <MicOff className="h-5 w-5" aria-hidden />}
          />
          <IconControl
            label={!stream ? 'Turn on camera' : camOn ? 'Turn off camera' : 'Turn on camera'}
            tone={camActive ? 'neutral' : 'off'}
            aria-pressed={camActive}
            disabled={Boolean(stream) && (lowBandwidth || !hasVideo)}
            loading={preview.starting}
            onClick={!stream ? preview.start : preview.toggleCam}
            icon={camActive ? <Video className="h-5 w-5" aria-hidden /> : <VideoOff className="h-5 w-5" aria-hidden />}
          />
          <DeviceMenu preview={preview} />
        </>
      )}
      <IconControl label="Leave class" tone="danger" onClick={onLeave} icon={<PhoneOff className="h-5 w-5" aria-hidden />} />
    </div>
  );
}

/** Camera and microphone choice, plus a front/back flip for phones. */
function DeviceMenu({ preview }: { preview: LocalPreview }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const pick = 'w-full rounded-lg border border-white/15 bg-green-950 px-2 py-1.5 text-xs text-white';
  return (
    <div className="relative" ref={ref}>
      <IconControl
        label="Camera and microphone settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        icon={<Settings2 className="h-5 w-5" aria-hidden />}
      />
      {open && (
        <div
          role="dialog"
          aria-label="Camera and microphone settings"
          className="absolute bottom-14 right-0 z-30 w-72 space-y-3 rounded-2xl border border-white/10 bg-green-900 p-3 text-white shadow-xl"
        >
          {!preview.stream ? (
            <p className="text-xs text-white/75">Turn on your camera or microphone first to choose a device.</p>
          ) : (
            <>
              <label className="block space-y-1 text-xs">
                <span className="text-white/70">Camera</span>
                <select className={pick} value={preview.cameraId} onChange={(e) => preview.setCamera(e.target.value)}>
                  <option value="">Default camera</option>
                  {preview.cameras.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs">
                <span className="text-white/70">Microphone</span>
                <select className={pick} value={preview.microphoneId} onChange={(e) => preview.setMicrophone(e.target.value)}>
                  <option value="">Default microphone</option>
                  {preview.microphones.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microphone ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              {preview.cameras.length > 1 && (
                <button
                  type="button"
                  onClick={preview.flipCamera}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20"
                >
                  <SwitchCamera className="h-4 w-4" aria-hidden /> Switch front / back camera
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Mobile browsers block sound until a tap; this is that tap. */
export function AudioUnlock({ onUnlock }: { onUnlock: () => void }) {
  return (
    <button
      type="button"
      onClick={onUnlock}
      className="inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-semibold text-green-950 shadow hover:bg-gold-100 motion-safe:animate-pulse"
    >
      <Volume2 className="h-4 w-4" aria-hidden /> Tap to hear the class
    </button>
  );
}

/** Connection strength bars for a tile (LiveKit connection quality). */
export function QualityBars({ quality }: { quality?: LinkQuality }) {
  if (!quality || quality === 'unknown') return null;
  const level = quality === 'excellent' ? 3 : quality === 'good' ? 2 : quality === 'poor' ? 1 : 0;
  const label = quality === 'lost' ? 'Connection lost' : `${quality[0].toUpperCase()}${quality.slice(1)} connection`;
  return (
    <span className="absolute right-2 top-2 inline-flex items-end gap-0.5 rounded-md bg-black/45 px-1.5 py-1" title={label} aria-label={label} role="img">
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={cn('w-1 rounded-sm', bar <= level ? (level === 1 ? 'bg-amber-300' : 'bg-emerald-300') : 'bg-white/30')}
          style={{ height: `${bar * 4}px` }}
        />
      ))}
    </span>
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

/** Plays one remote participant's video; the track is attached for the element's lifetime. */
export function RemoteVideo({ track, name }: { track: RemoteTrack; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return <video ref={ref} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" aria-label={`${name}'s camera`} />;
}

/** Plays one remote participant's audio (no visible element). */
export function RemoteAudio({ track }: { track: RemoteTrack }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return <audio ref={ref} autoPlay />;
}

/** Another person's mic and camera state on their tile, as they reported it (unknown until they do). */
export function MediaIcons({ micOn, camOn, name }: { micOn?: boolean | null; camOn?: boolean | null; name: string }) {
  if (micOn == null && camOn == null) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {camOn != null &&
        (camOn ? (
          <Video className="h-3.5 w-3.5 text-emerald-300" aria-label={`${name}'s camera is on`} />
        ) : (
          <VideoOff className="h-3.5 w-3.5 text-red-300" aria-label={`${name}'s camera is off`} />
        ))}
      {micOn != null &&
        (micOn ? (
          <Mic className="h-3.5 w-3.5 text-emerald-300" aria-label={`${name}'s microphone is on`} />
        ) : (
          <MicOff className="h-3.5 w-3.5 text-red-300" aria-label={`${name} is muted`} />
        ))}
    </span>
  );
}
