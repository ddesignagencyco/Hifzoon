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
import { InterviewEvents, InterviewParticipantRole } from '@hifzoon/shared';
import type { Namespace, Socket } from 'socket.io';

import { InterviewsService } from './interviews.service';

/** Claims added to `socket.data` once a room token has been verified. */
export interface InterviewSocketData {
  identity: string;
  interviewId: string;
  role: InterviewParticipantRole;
  userId: string | null;
  displayName: string;
}

interface AuthedSocket extends Socket {
  data: Partial<InterviewSocketData> & { authenticated?: boolean };
}

function contextOf(client: AuthedSocket): InterviewSocketData | null {
  const { authenticated, identity, interviewId, role, userId, displayName } = client.data ?? {};
  if (!authenticated || !identity || !interviewId || !role || !displayName) return null;
  return { identity, interviewId, role, userId: userId ?? null, displayName };
}

/**
 * Hiring interview socket.
 *
 * Carries presence and mic/camera state only — the video itself goes over LiveKit, and
 * there is no Mushaf, whiteboard or mistake log in an interview. Two things it borrows
 * from the classroom gateway on purpose:
 *
 *   - **The room token is the only credential.** The access JWT is never accepted, and
 *     the applicant does not have one anyway. A token scoped to one interview is what we
 *     want in a long-lived socket.
 *   - **The server re-checks on connect.** `resolveSocketIdentity` reloads the interview
 *     and the staff account, so a token that outlived a cancellation, the join window or
 *     the account's staff role is refused rather than trusted.
 */
@WebSocketGateway({
  namespace: '/interviews',
  cors: { origin: '*', credentials: true },
  // Long polling first: an applicant interviewing over a weak connection abroad is the
  // normal case, and polling degrades far more gracefully than a WebSocket upgrade.
  transports: ['polling', 'websocket'],
})
export class InterviewsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(InterviewsGateway.name);

  @WebSocketServer()
  private server?: Namespace;

  constructor(private readonly interviews: InterviewsService) {}

  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.query?.token as string | undefined);

      if (!token) {
        this.reject(client, 'A room token is required');
        return;
      }

      const claims = this.interviews.verifyRoomToken(token);
      if (!claims) {
        this.reject(client, 'Room token is not valid');
        return;
      }

      const identity = await this.interviews.resolveSocketIdentity(claims);
      if (!identity) {
        this.reject(client, 'This interview is no longer open');
        return;
      }

      client.data = {
        identity: claims.sub,
        interviewId: claims.iid,
        role: claims.role,
        userId: claims.uid,
        displayName: identity.displayName,
        authenticated: true,
      };

      await client.join(roomFor(claims.iid));

      await this.interviews.recordJoin({
        interviewId: claims.iid,
        identity: claims.sub,
        userId: claims.uid,
        displayName: identity.displayName,
        role: claims.role,
      });

      // One snapshot on (re)connect rather than a replay of events nobody was there for.
      const snapshot = await this.interviews.snapshot(claims.iid, { role: claims.role });
      client.emit(InterviewEvents.STATE_SYNC, { ...snapshot, resumed: true });

      this.server?.in(roomFor(claims.iid)).emit(InterviewEvents.PRESENCE_JOIN, {
        identity: claims.sub,
        displayName: identity.displayName,
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

    await this.interviews.recordLeave(ctx.interviewId, ctx.identity).catch((error: Error) => {
      // Recoverable: the close-finished sweep banks the minutes, so a failed leave must
      // not fail the disconnect.
      this.logger.warn(
        `recordLeave failed for ${ctx.identity} in interview ${ctx.interviewId}: ${error.message}`,
      );
    });

    this.server?.in(roomFor(ctx.interviewId)).emit(InterviewEvents.PRESENCE_LEAVE, {
      identity: ctx.identity,
      leftAt: new Date().toISOString(),
    });
  }

  /** A participant reports their own microphone and camera state. */
  @SubscribeMessage(InterviewEvents.MEDIA_STATE)
  async onMediaState(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { micOn?: boolean; camOn?: boolean },
  ): Promise<{ micOn: boolean; camOn: boolean } | { error: string }> {
    const ctx = contextOf(client);
    if (!ctx) return { error: 'Not in an interview' };

    const state = this.interviews.setMediaState(ctx.interviewId, ctx.identity, {
      micOn: Boolean(body?.micOn),
      camOn: Boolean(body?.camOn),
    });
    this.broadcast(client, InterviewEvents.MEDIA_STATE, {
      identity: ctx.identity,
      ...state,
      emittedAt: new Date().toISOString(),
    });
    return state;
  }

  /** Restores state for someone who reconnects without a full page reload. */
  @SubscribeMessage(InterviewEvents.JOIN)
  async onJoin(@ConnectedSocket() client: AuthedSocket): Promise<unknown> {
    const ctx = contextOf(client);
    if (!ctx) return { error: 'Not authenticated' };

    await this.interviews.recordJoin({
      interviewId: ctx.interviewId,
      identity: ctx.identity,
      userId: ctx.userId,
      displayName: ctx.displayName,
      role: ctx.role,
    });
    this.broadcast(client, InterviewEvents.PRESENCE_JOIN, {
      identity: ctx.identity,
      displayName: ctx.displayName,
      role: ctx.role,
      joinedAt: new Date().toISOString(),
    });

    return this.interviews.snapshot(ctx.interviewId, { role: ctx.role });
  }

  /** Voluntary leave, so the minutes are banked without waiting for a socket timeout. */
  @SubscribeMessage(InterviewEvents.LEAVE)
  async onLeave(@ConnectedSocket() client: AuthedSocket): Promise<{ ok: true }> {
    const ctx = contextOf(client);
    if (ctx) await this.interviews.recordLeave(ctx.interviewId, ctx.identity);
    client.disconnect(true);
    return { ok: true };
  }

  /** A change made over REST (the fallback when the socket is down) reaches the room too. */
  publish(interviewId: string, event: string, payload: Record<string, unknown>): void {
    this.server
      ?.to(roomFor(interviewId))
      .emit(event, { ...payload, emittedAt: new Date().toISOString() });
  }

  /** Broadcasts to the room *including* the sender, so it renders what it asked for. */
  private broadcast(client: AuthedSocket, event: string, payload: unknown): void {
    const ctx = contextOf(client);
    if (!ctx) return;
    this.server?.to(roomFor(ctx.interviewId)).emit(event, payload);
  }

  private reject(client: AuthedSocket, reason: string): void {
    this.logger.warn(`Rejecting interview socket ${client.id}: ${reason}`);
    client.emit(InterviewEvents.ERROR, { error: reason });
    client.disconnect(true);
  }
}

function roomFor(interviewId: string): string {
  return `interview:${interviewId}`;
}
