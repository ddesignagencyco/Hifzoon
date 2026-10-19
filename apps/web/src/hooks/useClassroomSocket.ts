'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { classroomSocketUrl } from '@/lib/api/modules/classroom';
import { classroomKeys } from './useClassroom';

/** Event names from packages/shared/src/types/classroom-events.ts (ClassroomEvents). */
export const CLASSROOM_SOCKET_EVENTS = {
  STATE_SYNC: 'classroom:state',
  ERROR: 'classroom:error',
  MUSHAF_PAGE: 'mushaf:page',
  MUSHAF_HIGHLIGHT: 'mushaf:highlight',
  MUSHAF_TAJWEED_TOGGLE: 'mushaf:tajweed-toggle',
  MISTAKE_MARKED: 'mistake:marked',
  PRESENCE_JOIN: 'presence:join',
  PRESENCE_LEAVE: 'presence:leave',
} as const;

export type ClassroomSocketStatus = 'idle' | 'connecting' | 'connected' | 'unavailable' | 'error';

/**
 * Optional realtime link to the `/classroom` Socket.IO namespace.
 *
 * The socket is what records presence (attendance is built from the gateway's join /
 * leave), and its events trigger an immediate state refetch. REST polling of the state
 * snapshot keeps running regardless, because the REST teacher controls do not
 * broadcast to the socket room — polling is the source of truth, the socket only makes
 * it faster. If `socket.io-client` cannot be loaded, the classroom still works.
 */
export function useClassroomSocket(classId: string, roomToken: string | null | undefined) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ClassroomSocketStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomToken || !classId) return;
    let cancelled = false;
    let socket: { disconnect: () => void } | null = null;

    // State updates happen inside async callbacks, never synchronously in the effect.
    queueMicrotask(() => {
      if (!cancelled) setStatus('connecting');
    });

    import('socket.io-client')
      .then(({ io }) => {
        if (cancelled) return;
        const s = io(classroomSocketUrl(), {
          auth: { token: roomToken },
          transports: ['polling', 'websocket'],
          reconnectionAttempts: 10,
        });
        socket = s;
        const refresh = () => {
          queryClient.invalidateQueries({ queryKey: classroomKeys.state(classId) });
        };
        s.on('connect', () => {
          setStatus('connected');
          setError(null);
          refresh();
        });
        s.on('disconnect', () => setStatus('connecting'));
        s.on('connect_error', (err: Error) => {
          setStatus('error');
          setError(err.message);
        });
        s.on(CLASSROOM_SOCKET_EVENTS.ERROR, (payload: { error?: string }) => {
          setStatus('error');
          setError(payload?.error ?? 'The classroom connection was refused');
        });
        for (const event of [
          CLASSROOM_SOCKET_EVENTS.STATE_SYNC,
          CLASSROOM_SOCKET_EVENTS.MUSHAF_PAGE,
          CLASSROOM_SOCKET_EVENTS.MUSHAF_HIGHLIGHT,
          CLASSROOM_SOCKET_EVENTS.MUSHAF_TAJWEED_TOGGLE,
          CLASSROOM_SOCKET_EVENTS.PRESENCE_JOIN,
          CLASSROOM_SOCKET_EVENTS.PRESENCE_LEAVE,
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
    };
  }, [classId, roomToken, queryClient]);

  return { status: roomToken ? status : 'idle', error };
}
