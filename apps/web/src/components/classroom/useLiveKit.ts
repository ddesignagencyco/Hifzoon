'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room, RemoteTrack, LocalTrackPublication } from 'livekit-client';
import { isFakeVideoUrl, type RoomToken } from '@/lib/api/modules/classroom';

export type LiveKitStatus = 'off' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type LinkQuality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

/** Remote media per participant, keyed by LiveKit identity (= the API user id). */
export interface RemoteMedia {
  video?: RemoteTrack;
  audio?: RemoteTrack;
}

/**
 * Joins the LiveKit room with the provider token from `POST /classroom/classes/:id/token`,
 * publishes the local preview's tracks (when the role may publish) and exposes everyone
 * else's tracks, each person's connection quality and whether the browser blocked audio.
 *
 * LiveKit resumes short drops itself (`reconnecting`). If the session is lost for good
 * (e.g. the 20-minute token has expired by the time it reconnects), `onDropped` is called so
 * the caller can fetch a fresh token; the new token reconnects automatically.
 */
export function useLiveKit(token: RoomToken | undefined, localStream: MediaStream | null, onDropped?: () => void) {
  const [status, setStatus] = useState<LiveKitStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [remote, setRemote] = useState<Map<string, RemoteMedia>>(new Map());
  const [quality, setQuality] = useState<Map<string, LinkQuality>>(new Map());
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const droppedRef = useRef(onDropped);
  useEffect(() => {
    droppedRef.current = onDropped;
  }, [onDropped]);
  const url = token?.url;
  const videoToken = token?.videoToken;
  const usable = Boolean(url && videoToken && !isFakeVideoUrl(url));

  useEffect(() => {
    if (!usable || !url || !videoToken) return;
    let cancelled = false;
    let joined: Room | null = null;
    queueMicrotask(() => {
      if (!cancelled) setStatus('connecting');
    });

    import('livekit-client')
      .then(async ({ Room: RoomClass, RoomEvent, Track, DisconnectReason }) => {
        if (cancelled) return;
        const r = new RoomClass({ adaptiveStream: true, dynacast: true });
        joined = r;
        const sync = () => {
          const next = new Map<string, RemoteMedia>();
          for (const p of r.remoteParticipants.values()) {
            const media: RemoteMedia = {};
            for (const pub of p.trackPublications.values()) {
              if (!pub.track || !pub.isSubscribed) continue;
              if (pub.kind === Track.Kind.Video) media.video = pub.track as RemoteTrack;
              if (pub.kind === Track.Kind.Audio) media.audio = pub.track as RemoteTrack;
            }
            next.set(p.identity, media);
          }
          setRemote(next);
        };
        for (const ev of [
          RoomEvent.ParticipantConnected,
          RoomEvent.ParticipantDisconnected,
          RoomEvent.TrackSubscribed,
          RoomEvent.TrackUnsubscribed,
          RoomEvent.TrackMuted,
          RoomEvent.TrackUnmuted,
        ]) {
          r.on(ev, sync);
        }
        r.on(RoomEvent.ConnectionQualityChanged, (q: string, participant: { identity: string }) =>
          setQuality((prev) => new Map(prev).set(participant.identity, (q as LinkQuality) ?? 'unknown')),
        );
        r.on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!r.canPlaybackAudio));
        r.on(RoomEvent.Reconnecting, () => !cancelled && setStatus('reconnecting'));
        r.on(RoomEvent.Reconnected, () => !cancelled && setStatus('connected'));
        r.on(RoomEvent.Disconnected, (reason?: number) => {
          if (cancelled) return;
          setStatus('error');
          // Leaving or being replaced by a newer tab is final; anything else gets a fresh token.
          const final = reason === DisconnectReason.CLIENT_INITIATED || reason === DisconnectReason.DUPLICATE_IDENTITY;
          if (!final) droppedRef.current?.();
        });
        await r.connect(url, videoToken);
        if (cancelled) {
          await r.disconnect();
          return;
        }
        setRoom(r);
        setStatus('connected');
        setError(null);
        setAudioBlocked(!r.canPlaybackAudio);
        sync();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Could not connect to the video room');
      });

    return () => {
      cancelled = true;
      setRoom(null);
      setRemote(new Map());
      setQuality(new Map());
      void joined?.disconnect();
    };
  }, [usable, url, videoToken]);

  // Publish the local preview's tracks while it runs; republish when the device changes.
  const published = useRef<LocalTrackPublication[]>([]);
  const canPublish = token?.role !== 'GUARDIAN_VIEWER';
  useEffect(() => {
    if (!room || !localStream || !canPublish) return;
    let cancelled = false;
    const tracks = localStream.getTracks();
    Promise.all(tracks.map((t) => room.localParticipant.publishTrack(t)))
      .then((pubs) => {
        if (cancelled) pubs.forEach((p) => p.track && void room.localParticipant.unpublishTrack(p.track, false));
        else published.current = pubs;
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not share your camera'));
    return () => {
      cancelled = true;
      for (const p of published.current) if (p.track) void room.localParticipant.unpublishTrack(p.track, false);
      published.current = [];
    };
  }, [room, localStream, canPublish]);

  /** Must run inside a tap: mobile browsers only allow sound after a user gesture. */
  const startAudio = useCallback(async () => {
    if (!room) return;
    await room.startAudio();
    setAudioBlocked(!room.canPlaybackAudio);
  }, [room]);

  return {
    status: usable ? status : 'off',
    error,
    remote,
    quality,
    audioBlocked: usable && status === 'connected' && audioBlocked,
    startAudio,
    selfIdentity: room?.localParticipant.identity ?? null,
    available: usable,
  };
}
