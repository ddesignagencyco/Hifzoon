import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ClassroomEvents, ParticipantRole } from '@hifzoon/shared';
import type { Namespace, Socket } from 'socket.io';

import { RedisService } from '../../redis/redis.service';
import { ClassroomService } from './classroom.service';

/** Claims added to `socket.data` once a room token has been verified. */
export interface ClassroomSocketData {
  userId: string;
  classId: string;
  role: ParticipantRole;
  studentId: string | null;
  displayName: string;
}

interface AuthedSocket extends Socket {
  data: Partial<ClassroomSocketData> & { authenticated?: boolean };
}

/**
 * The authenticated context of a socket, or null. Every handler starts with this so
 * the rest of the body can rely on the fields existing instead of asserting them
 * twenty times.
 */
function contextOf(client: AuthedSocket): ClassroomSocketData | null {
  const { authenticated, userId, classId, role, studentId, displayName } = client.data ?? {};
  if (!authenticated || !userId || !classId || !role || !displayName) return null;
  return { userId, classId, role, studentId: studentId ?? null, displayName };
}

/**
 * Live classroom socket (CLS-BE-04, CLS-BE-05, TRD section 7).
 *
 * Design decisions worth stating, because each one is a bug someone would otherwise
 * write later:
 *
 *   - **The room token is the only credential.** The socket never accepts the access
 *     JWT, because a token scoped to one class is what we want in a long-lived socket:
 *     revoking it affects one class, not the account.
 *   - **Only the teacher may drive.** Page turns, highlights, pen strokes, layout and
 *     Tajweed toggles are all rejected from a student. A misbehaving client cannot fake
 *     its way past this because the check is on the server, against the *verified*
 *     role from the token — never against anything the client sends with the event.
 *   - **State lives on the server.** Clients echo what they were told; they never
 *     broadcast to each other. A joining or rejoining participant receives one snapshot
 *     instead of a replay of events it was not present for (NFR-REL-01).
 *   - **Mistakes are a REST concern.** `mistake:marked` only fans out to the UI; the
 *     teacher persists through the REST endpoint so the write is validated,
 *     authorised and audited like any other.
 *
 * Note on the Redis adapter: this gateway is namespaced, so `@WebSocketServer()` gives
 * it a `Namespace`, which has no `.adapter()` method. The adapter is therefore attached
 * by `CapturingIoAdapter` on the parent server — see `capturing-io.adapter.ts`.
 */
@WebSocketGateway({
  namespace: '/classroom',
  cors: { origin: '*', credentials: true },
  // Long polling first: a teacher on hotel wifi connects far more reliably with a
  // transport that degrades gracefully than one that assumes WebSockets.
  transports: ['polling', 'websocket'],
})
export class ClassroomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ClassroomGateway.name);

  @WebSocketServer()
  private server?: Namespace;

  constructor(
    private readonly classroom: ClassroomService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Verifies the room token and joins the Socket.IO room for the class.
   *
   * Nothing is emitted to anyone until this succeeds, so an unauthorised socket is
   * disconnected without ever becoming a participant.
   */
  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.query?.token as string | undefined);

      if (!token) {
        this.reject(client, 'A room token is required');
        return;
      }

      const claims = this.classroom.verifyRoomToken(token);
      if (!claims) {
        this.reject(client, 'Room token is not valid');
        return;
      }

      const user = await this.classroom.resolveDisplayName(
        claims.sub,
        claims.role === ParticipantRole.STUDENT ? claims.studentId : null,
      );
      if (!user) {
        this.reject(client, 'Account no longer exists');
        return;
      }

      client.data = {
        userId: claims.sub,
        classId: claims.cid,
        role: claims.role,
        studentId: claims.studentId,
        displayName: user.name,
        authenticated: true,
      };

      await client.join(roomFor(claims.cid));

      // FR-CLS-14 — presence is what attendance is built from, so it is recorded at
      // join, not at the first video frame.
      await this.classroom.recordJoin({
        classId: claims.cid,
        userId: claims.sub,
        displayName: user.name,
        role: claims.role,
        studentId: claims.studentId,
      });

      // NFR-REL-01 — a rejoining participant gets one snapshot, not a replay.
      const snapshot = await this.classroom.snapshot(claims.cid, {
        userId: claims.sub,
        roles: [],
      });
      client.emit(ClassroomEvents.STATE_SYNC, { ...snapshot, resumed: true });

      this.server?.in(roomFor(claims.cid)).emit(ClassroomEvents.PRESENCE_JOIN, {
        userId: claims.sub,
        displayName: user.name,
        role: claims.role,
        joinedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.reject(client, (error as Error).message);
    }
  }

  async handleDisconnect(client: AuthedSocket): Promise<void> {
    const ctx = contextOf(client);
    if (!ctx) return;

    await this.classroom.recordLeave(ctx.classId, ctx.userId).catch((error: Error) => {
      // A failed leave is recoverable: the nightly close-attendance sweep will bank
      // the minutes, so losing this event must not fail the disconnect.
      this.logger.warn(`recordLeave failed for ${ctx.userId} in ${ctx.classId}: ${error.message}`);
    });

    this.server?.in(roomFor(ctx.classId)).emit(ClassroomEvents.PRESENCE_LEAVE, {
      userId: ctx.userId,
      leftAt: new Date().toISOString(),
    });
  }

  // ── Teacher control events ────────────────────────────────────────────────

  @SubscribeMessage(ClassroomEvents.MUSHAF_PAGE)
  async onPage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { page: number },
  ): Promise<{ page: number } | { error: string }> {
    if (!this.requireTeacher(client)) return { error: 'Only the teacher can change the page' };

    try {
      const ctx = contextOf(client)!;
      const result = await this.classroom.setPage(ctx.classId, body.page, {
        userId: ctx.userId,
        roles: [],
      });

      this.broadcast(client, ClassroomEvents.MUSHAF_PAGE, {
        ...result,
        emittedBy: ctx.userId,
        emittedAt: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  @SubscribeMessage(ClassroomEvents.MUSHAF_HIGHLIGHT)
  async onHighlight(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { surah: number; ayah: number; wordIndex: number },
  ): Promise<{ surah: number; ayah: number; wordIndex: number } | { error: string }> {
    if (!this.requireTeacher(client)) return { error: 'Only the teacher can move the highlight' };

    try {
      const ctx = contextOf(client)!;
      const result = await this.classroom.setHighlight(ctx.classId, body, {
        userId: ctx.userId,
        roles: [],
      });

      this.broadcast(client, ClassroomEvents.MUSHAF_HIGHLIGHT, {
        ...result,
        emittedBy: ctx.userId,
        emittedAt: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  /** FR-CLS-07 — pen and highlighter strokes are ephemeral and never persisted. */
  @SubscribeMessage(ClassroomEvents.BOARD_STROKE)
  async onBoardStroke(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: {
      page: number;
      points: Array<{ x: number; y: number; t: number }>;
      colour: string;
      width: number;
      tool: 'pen' | 'highlighter';
    },
  ): Promise<{ ok: true } | { error: string }> {
    if (!this.requireTeacher(client)) return { error: 'Only the teacher can draw' };

    // Bounding the payload matters: an unbounded stroke array is a memory-exhaustion
    // vector on a socket every participant is subscribed to.
    if (!Array.isArray(body.points) || body.points.length > 2_000) {
      return { error: 'A stroke may carry at most 2000 points' };
    }

    const ctx = contextOf(client)!;
    this.broadcast(client, ClassroomEvents.BOARD_STROKE, { ...body, emittedBy: ctx.userId });
    return { ok: true };
  }

  @SubscribeMessage(ClassroomEvents.BOARD_CLEAR)
  async onBoardClear(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { page: number },
  ): Promise<{ ok: true } | { error: string }> {
    if (!this.requireTeacher(client)) return { error: 'Only the teacher can clear the board' };

    const ctx = contextOf(client)!;
    this.broadcast(client, ClassroomEvents.BOARD_CLEAR, { page: body.page, emittedBy: ctx.userId });
    return { ok: true };
  }

  /** FR-CLS-05 — toggling the Tajweed colour layer is a class-wide control. */
  @SubscribeMessage(ClassroomEvents.MUSHAF_TAJWEED_TOGGLE)
  async onTajweedToggle(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { enabled: boolean },
  ): Promise<{ tajweedColours: boolean } | { error: string }> {
    if (!this.requireTeacher(client))
      return { error: 'Only the teacher can toggle Tajweed colours' };

    const ctx = contextOf(client)!;
    const result = await this.classroom.setTajweedColours(ctx.classId, Boolean(body.enabled), {
      userId: ctx.userId,
      roles: [],
    });

    this.broadcast(client, ClassroomEvents.MUSHAF_TAJWEED_TOGGLE, {
      ...result,
      emittedBy: ctx.userId,
      emittedAt: new Date().toISOString(),
    });
    return result;
  }

  /**
   * FR-REC-01 / FR-REC-02 — mirrors a mistake to the room for instant UI feedback.
   * The teacher still persists it over REST, which is where validation and ownership
   * are enforced.
   */
  @SubscribeMessage(ClassroomEvents.MISTAKE_MARKED)
  async onMistakeMarked(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: {
      studentId: string;
      surah: number;
      ayah: number;
      wordIndex: number;
      type: string;
      tajweedRule?: string;
    },
  ): Promise<{ ok: true } | { error: string }> {
    if (!this.requireTeacher(client)) return { error: 'Only the teacher can mark a mistake' };

    const ctx = contextOf(client)!;
    this.broadcast(client, ClassroomEvents.MISTAKE_MARKED, {
      classId: ctx.classId,
      ...body,
      emittedBy: ctx.userId,
      emittedAt: new Date().toISOString(),
    });
    return { ok: true };
  }

  /** M55 — a participant reports their own mic and camera state; the room is told. */
  @SubscribeMessage(ClassroomEvents.MEDIA_STATE)
  async onMediaState(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { micOn?: boolean; camOn?: boolean },
  ): Promise<{ micOn: boolean; camOn: boolean } | { error: string }> {
    const ctx = contextOf(client);
    if (!ctx) return { error: 'Not in a class' };

    const state = await this.classroom.setMediaState(ctx.classId, ctx.userId, ctx.role, {
      micOn: Boolean(body?.micOn),
      camOn: Boolean(body?.camOn),
    });
    this.broadcast(client, ClassroomEvents.MEDIA_STATE, {
      userId: ctx.userId,
      ...state,
      emittedAt: new Date().toISOString(),
    });
    return state;
  }

  /** Voluntary leave, so attendance is banked without waiting for a socket timeout. */
  @SubscribeMessage(ClassroomEvents.LEAVE)
  async onLeave(@ConnectedSocket() client: AuthedSocket): Promise<{ ok: true }> {
    const ctx = contextOf(client);
    if (ctx) await this.classroom.recordLeave(ctx.classId, ctx.userId);
    client.disconnect(true);
    return { ok: true };
  }

  /** Restores state for someone who reconnects without a full page reload. */
  @SubscribeMessage(ClassroomEvents.JOIN)
  async onJoin(@ConnectedSocket() client: AuthedSocket): Promise<unknown> {
    const ctx = contextOf(client);
    if (!ctx) return { error: 'Not authenticated' };

    const snapshot = await this.classroom.snapshot(ctx.classId, {
      userId: ctx.userId,
      roles: [],
    });
    await this.classroom.recordJoin({
      classId: ctx.classId,
      userId: ctx.userId,
      displayName: ctx.displayName,
      role: ctx.role,
      studentId: ctx.studentId,
    });

    this.broadcast(client, ClassroomEvents.PRESENCE_JOIN, {
      userId: ctx.userId,
      displayName: ctx.displayName,
      role: ctx.role,
      joinedAt: new Date().toISOString(),
    });

    return snapshot;
  }

  private requireTeacher(client: AuthedSocket): boolean {
    const ctx = contextOf(client);
    if (!ctx) return false;
    if (ctx.role !== ParticipantRole.TEACHER) {
      this.logger.warn(`Rejected a control event from ${ctx.userId} (role ${ctx.role})`);
      return false;
    }
    return true;
  }

  /** Broadcasts to the room *including* the sender, so the sender renders what it asked for. */
  private broadcast(client: AuthedSocket, event: string, payload: unknown): void {
    const ctx = contextOf(client);
    if (!ctx) return;
    this.server?.to(roomFor(ctx.classId)).emit(event, payload);
  }

  private reject(client: AuthedSocket, reason: string): void {
    this.logger.warn(`Rejecting socket ${client.id}: ${reason}`);
    client.emit(ClassroomEvents.ERROR, { error: reason });
    client.disconnect(true);
  }
}

function roomFor(classId: string): string {
  return `class:${classId}`;
}
