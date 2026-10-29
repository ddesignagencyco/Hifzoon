'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { classroomSocketUrl, ClassroomSnapshot } from '@/lib/api/modules/classroom';
import { classroomKeys } from './useClassroom';
import { mistakeKeys } from './useClassroomMistakes';

/** Event names from packages/shared/src/types/classroom-events.ts (ClassroomEvents). */
export const CLASSROOM_SOCKET_EVENTS = {
  STATE_SYNC: 'classroom:state',
  ERROR: 'classroom:error',
  MUSHAF_PAGE: 'mushaf:page',
  MUSHAF_HIGHLIGHT: 'mushaf:highlight',
  MUSHAF_TAJWEED_TOGGLE: 'mushaf:tajweed-toggle',
  MISTAKE_MARKED: 'mistake:marked',
  MEDIA_STATE: 'media:state',
  PRESENCE_JOIN: 'presence:join',
  PRESENCE_LEAVE: 'presence:leave',
} as const;

export type ClassroomSocketStatus = 'idle' | 'connecting' | 'connected' | 'unavailable' | 'error';

/** A mistake mirrored to the room by the teacher (`mistake:marked`). */
export interface LiveMistake {
  studentId: string;
  surah: number;
  ayah: number;
  wordIndex: number;
  type: string;
  tajweedRule?: string;
}

interface SocketLike {
  connected: boolean;
  disconnect: () => void;
  timeout: (ms: number) => { emitWithAck: (event: string, payload: unknown) => Promise<unknown> };
}

const ACK_TIMEOUT_MS = 5000;

/**
 * Realtime link to the `/classroom` Socket.IO namespace.
 *
 * Teacher controls sent over the socket are persisted by the gateway and broadcast to the
 * whole room (sender included), so every screen applies them the moment they arrive
 * instead of waiting for the next state poll. Polling stays as the fallback.
 */
export function useClassroomSocket(classId: string, roomToken: string | null | undefined) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ClassroomSocketStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [liveMistakes, setLiveMistakes] = useState<LiveMistake[]>([]);
  const socketRef = useRef<SocketLike | null>(null);

  useEffect(() => {
    if (!roomToken || !classId) return;
    let cancelled = false;
    let socket: SocketLike | null = null;
    const key = classroomKeys.state(classId);
    const patch = (fields: Partial<ClassroomSnapshot>) =>
      queryClient.setQueryData<ClassroomSnapshot>(key, (prev) => (prev ? { ...prev, ...fields } : prev));
    const refresh = () => queryClient.invalidateQueries({ queryKey: key });

    queueMicrotask(() => {
      if (!cancelled) setStatus('connecting');
    });

    import('socket.io-client')
      .then(({ io }) => {
        if (cancelled) return;
        const s = io(classroomSocketUrl(), {
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
        // The server refuses a socket by emitting an error and then disconnecting; keep that error visible.
        s.on('disconnect', (reason: string) => {
          if (reason !== 'io server disconnect') setStatus('connecting');
        });
        s.on('connect_error', (err: Error) => {
          setStatus('error');
          setError(err.message);
        });
        s.on(CLASSROOM_SOCKET_EVENTS.ERROR, (payload: { error?: string }) => {
          setStatus('error');
          setError(payload?.error ?? 'The classroom connection was refused');
        });
        s.on(CLASSROOM_SOCKET_EVENTS.MUSHAF_PAGE, (p: { page?: number; layout?: ClassroomSnapshot['layout'] }) => {
          if (typeof p?.page === 'number') patch({ page: p.page, ...(p.layout ? { layout: p.layout } : {}) });
        });
        s.on(CLASSROOM_SOCKET_EVENTS.MUSHAF_HIGHLIGHT, (p: { surah?: number; ayah?: number; wordIndex?: number }) => {
          if (typeof p?.surah === 'number' && typeof p.ayah === 'number' && typeof p.wordIndex === 'number') {
            patch({ highlight: { surah: p.surah, ayah: p.ayah, wordIndex: p.wordIndex } });
          }
        });
        s.on(CLASSROOM_SOCKET_EVENTS.MUSHAF_TAJWEED_TOGGLE, (p: { tajweedColours?: boolean }) => {
          if (typeof p?.tajweedColours === 'boolean') patch({ tajweedColours: p.tajweedColours });
        });
        s.on(CLASSROOM_SOCKET_EVENTS.MISTAKE_MARKED, (p: LiveMistake) => {
          if (!p || typeof p.surah !== 'number') return;
          setLiveMistakes((list) => [...list, p]);
          queryClient.invalidateQueries({ queryKey: mistakeKeys.forClass(classId) });
        });
        for (const event of [
          CLASSROOM_SOCKET_EVENTS.STATE_SYNC,
          CLASSROOM_SOCKET_EVENTS.PRESENCE_JOIN,
          CLASSROOM_SOCKET_EVENTS.PRESENCE_LEAVE,
          CLASSROOM_SOCKET_EVENTS.MEDIA_STATE,
        ]) {
          s.on(event, refresh);
        }
        s.on(CLASSROOM_SOCKET_EVENTS.PRESENCE_JOIN, () =>
          queryClient.invalidateQueries({ queryKey: classroomKeys.attendance(classId) }),
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
  }, [classId, roomToken, queryClient]);

  /**
   * Sends an event and resolves with the gateway's acknowledgement. Rejects when the socket
   * is not connected, times out, or the gateway answers `{ error }`, so callers can fall back to REST.
   */
  const emit = useCallback(async <T = unknown>(event: string, payload: unknown): Promise<T> => {
    const s = socketRef.current;
    if (!s?.connected) throw new Error('Not connected');
    const ack = (await s.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload)) as T & { error?: string };
    if (ack && typeof ack === 'object' && 'error' in ack && ack.error) throw new Error(ack.error);
    return ack;
  }, []);

  const live = Boolean(roomToken) && status === 'connected';
  return { status: roomToken ? status : 'idle', error, live, emit, liveMistakes };
}
