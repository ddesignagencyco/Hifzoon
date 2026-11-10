'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { InterviewSnapshot, interviewSocketUrl } from '@/lib/api/modules/interviews';
import { interviewKeys } from './useInterviews';

/** Event names from packages/shared/src/types/interview-events.ts (InterviewEvents). */
export const INTERVIEW_SOCKET_EVENTS = {
  JOIN: 'interview:join',
  LEAVE: 'interview:leave',
  STATE_SYNC: 'interview:state',
  ERROR: 'interview:error',
  MEDIA_STATE: 'interview:media-state',
  PRESENCE_JOIN: 'interview:presence-join',
  PRESENCE_LEAVE: 'interview:presence-leave',
} as const;

export type InterviewSocketStatus = 'idle' | 'connecting' | 'connected' | 'unavailable' | 'error';

interface SocketLike {
  connected: boolean;
  disconnect: () => void;
  timeout: (ms: number) => { emitWithAck: (event: string, payload: unknown) => Promise<unknown> };
}

const ACK_TIMEOUT_MS = 5000;

/**
 * Realtime link to the `/interviews` Socket.IO namespace.
 *
 * Carries presence and mic/camera state only — the video is LiveKit's job and there is no
 * Mushaf in an interview. Polling `useInterviewState` stays as the fallback, so a blocked
 * WebSocket degrades the room to "a few seconds behind" rather than breaking it.
 */
export function useInterviewSocket(interviewId: string, roomToken: string | null | undefined) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<InterviewSocketStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<SocketLike | null>(null);

  useEffect(() => {
    if (!roomToken || !interviewId) return;
    let cancelled = false;
    let socket: SocketLike | null = null;
    const key = interviewKeys.state(interviewId);
    const patch = (fields: Partial<InterviewSnapshot>) =>
      queryClient.setQueryData<InterviewSnapshot>(key, (prev) => (prev ? { ...prev, ...fields } : prev));
    const refresh = () => queryClient.invalidateQueries({ queryKey: key });

    queueMicrotask(() => {
      if (!cancelled) setStatus('connecting');
    });

    import('socket.io-client')
      .then(({ io }) => {
        if (cancelled) return;
        const s = io(interviewSocketUrl(), {
          query: process.env.NEXT_PUBLIC_API_ACCESS_KEY ? { apiKey: process.env.NEXT_PUBLIC_API_ACCESS_KEY } : undefined,
          auth: { token: roomToken },
          transports: ['polling', 'websocket'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 15_000,
          randomizationFactor: 0.5,
          timeout: 15_000,
        });
        socket = s as unknown as SocketLike;
        socketRef.current = socket;

        s.on('connect', () => {
          setStatus('connected');
          setError(null);
          refresh();
        });
        // The server refuses a socket by emitting an error and then disconnecting; that
        // error has to stay visible rather than being replaced by "reconnecting".
        s.on('disconnect', (reason: string) => {
          if (reason !== 'io server disconnect') setStatus('connecting');
        });
        s.on('connect_error', (err: Error) => {
          setStatus('error');
          setError(err.message);
        });
        s.on(INTERVIEW_SOCKET_EVENTS.ERROR, (payload: { error?: string }) => {
          setStatus('error');
          setError(payload?.error ?? 'The interview connection was refused');
        });
        s.on(INTERVIEW_SOCKET_EVENTS.STATE_SYNC, (snapshot: InterviewSnapshot) => {
          if (snapshot?.interviewId) patch(snapshot);
        });
        for (const event of [
          INTERVIEW_SOCKET_EVENTS.PRESENCE_JOIN,
          INTERVIEW_SOCKET_EVENTS.PRESENCE_LEAVE,
          INTERVIEW_SOCKET_EVENTS.MEDIA_STATE,
        ]) {
          s.on(event, refresh);
        }
        s.on(INTERVIEW_SOCKET_EVENTS.PRESENCE_JOIN, () =>
          queryClient.invalidateQueries({ queryKey: interviewKeys.attendance(interviewId) }),
        );
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });

    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [interviewId, roomToken, queryClient]);

  /**
   * Sends an event and resolves with the gateway's acknowledgement. Rejects when the
   * socket is not connected, times out, or the gateway answers `{ error }`.
   */
  const emit = useCallback(async <T = unknown>(event: string, payload: unknown): Promise<T> => {
    const s = socketRef.current;
    if (!s?.connected) throw new Error('Not connected');
    const ack = (await s.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload)) as T & { error?: string };
    if (ack && typeof ack === 'object' && 'error' in ack && ack.error) throw new Error(ack.error);
    return ack;
  }, []);

  const live = Boolean(roomToken) && status === 'connected';
  return { status: roomToken ? status : 'idle', error, live, emit };
}
