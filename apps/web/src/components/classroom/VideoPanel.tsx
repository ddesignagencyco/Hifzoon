'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { Alert, UiButton, formatDateTime } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  RoomToken,
  isFakeVideoUrl,
  participantRoleLabel,
  roomIdFromUrl,
} from '@/lib/api/modules/classroom';

/**
 * Video area. It is honest about what works: the API returns the provider room URL
 * and a signed room token, but not a provider media token, and the development
 * provider is a fake (`fake://`). So this panel shows the connection details and a
 * *local* camera preview only — remote participants' video is never pretended.
 */
export function VideoPanel({ token, lowBandwidth }: { token: RoomToken; lowBandwidth: boolean }) {
  const canPublish = token.role !== 'GUARDIAN_VIEWER';
  const fake = isFakeVideoUrl(token.url);
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [starting, setStarting] = useState(false);

  // Attach the stream to the <video> element and stop every track on unmount / change.
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);

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

  const startPreview = async () => {
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

  const stopPreview = () => setStream(null);

  return (
    <div className="space-y-3">
      <dl className="text-xs space-y-1">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Room</dt>
          <dd className="text-ink font-mono truncate max-w-[60%]" title={token.url}>
            {roomIdFromUrl(token.url)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Joined as</dt>
          <dd className="text-ink">{participantRoleLabel(token.role)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Access expires</dt>
          <dd className="text-ink">{formatDateTime(token.expiresAt)}</dd>
        </div>
      </dl>

      {fake ? (
        <Alert tone="warning" title="Development video provider">
          No media server is connected in this environment, so other participants&rsquo; video and audio are not shown.
          Any camera preview below stays on your device.
        </Alert>
      ) : (
        <Alert tone="neutral" title="Video provider">
          The room is open at the provider, but this web client has no media SDK connected yet, so remote video is not
          shown here.
        </Alert>
      )}

      {!canPublish ? (
        <Alert tone="neutral" title="Watching only">
          As a guardian you join to watch. Your camera and microphone are never shared with the class.
        </Alert>
      ) : (
        <>
          <div className="relative aspect-video rounded-xl bg-green-950 overflow-hidden">
            {stream ? (
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" aria-label="Your camera preview" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70 text-xs px-4 text-center">
                <VideoOff className="w-6 h-6" aria-hidden />
                Camera preview is off
              </div>
            )}
            {stream && (lowBandwidth || !camOn) && (
              <div className="absolute inset-0 flex items-center justify-center bg-green-950/90 text-white/80 text-xs px-4 text-center">
                {lowBandwidth ? 'Video paused — low-bandwidth mode' : 'Camera off'}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!stream ? (
              <UiButton size="sm" variant="secondary" onClick={startPreview} loading={starting} icon={<Video className="w-3.5 h-3.5" aria-hidden />}>
                Start camera &amp; mic
              </UiButton>
            ) : (
              <>
                <UiButton
                  size="sm"
                  variant={micOn ? 'secondary' : 'danger'}
                  onClick={() => setMicOn((v) => !v)}
                  aria-pressed={!micOn}
                  icon={micOn ? <Mic className="w-3.5 h-3.5" aria-hidden /> : <MicOff className="w-3.5 h-3.5" aria-hidden />}
                >
                  {micOn ? 'Mute' : 'Unmute'}
                </UiButton>
                <UiButton
                  size="sm"
                  variant={camOn ? 'secondary' : 'danger'}
                  onClick={() => setCamOn((v) => !v)}
                  aria-pressed={!camOn}
                  disabled={lowBandwidth || stream.getVideoTracks().length === 0}
                  icon={camOn ? <Camera className="w-3.5 h-3.5" aria-hidden /> : <CameraOff className="w-3.5 h-3.5" aria-hidden />}
                >
                  {camOn ? 'Camera off' : 'Camera on'}
                </UiButton>
                <UiButton size="sm" variant="ghost" onClick={stopPreview}>
                  Stop
                </UiButton>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
