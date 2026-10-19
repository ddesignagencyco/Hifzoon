import { Logger } from '@nestjs/common';
import { ErrorCode } from '@hifzoon/shared';
import {
  AccessToken,
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  S3Upload,
  WebhookReceiver,
  type WebhookEvent,
} from 'livekit-server-sdk';

import { AppError } from '../common/errors/app-error';
import type { AppConfigService } from '../config/app-config.service';
import type {
  VideoProvider,
  VideoRecordingHandle,
  VideoRecordingInput,
  VideoRoom,
  VideoRoomInput,
  VideoTokenInput,
  VideoWebhookEvent,
} from './providers';

/** The slice of the LiveKit SDK this adapter uses, so tests can replace it. */
export interface LiveKitClients {
  rooms: Pick<RoomServiceClient, 'createRoom'>;
  egress: Pick<EgressClient, 'startRoomCompositeEgress' | 'stopEgress'>;
  receiver: Pick<WebhookReceiver, 'receive'>;
}

/**
 * LiveKit adapter (TRD section 8, FR-CLS-01, FR-CLS-12).
 *
 * LiveKit is open source (Apache-2.0) and self-hostable, which is why it was chosen: the
 * same adapter works against a server we run ourselves or against LiveKit Cloud, and only
 * the URL and key change.
 *
 * Details that matter:
 *
 * - **The room id is LiveKit's room *name*.** A participant joins by name, the webhook reports
 *   the name, and the recording row is found by it, so the name is the one stable identifier.
 * - **Two URLs.** `LIVEKIT_URL` is where the API reaches LiveKit (inside the Docker network it
 *   is `http://livekit:7880`); `LIVEKIT_PUBLIC_URL` is what a browser connects to. The signed
 *   token does not depend on either, so only the returned `url` differs.
 * - **A watch-only guardian can never publish.** `canPublish` comes from the caller, and data
 *   publishing follows it, so a viewer cannot use the data channel to speak either (FR-CLS-13).
 * - **Recording goes straight to our object store** through LiveKit Egress, using the same
 *   bucket the rest of the app reads from. The key is chosen by us, never by the provider.
 */
export class LiveKitVideoProvider implements VideoProvider {
  readonly name = 'livekit';

  private readonly logger = new Logger(LiveKitVideoProvider.name);
  private readonly clients: LiveKitClients;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly publicUrl: string;

  constructor(
    private readonly config: AppConfigService,
    clients?: LiveKitClients,
  ) {
    const {
      LIVEKIT_URL: url,
      LIVEKIT_PUBLIC_URL: publicUrl,
      LIVEKIT_API_KEY: key,
      LIVEKIT_API_SECRET: secret,
    } = config.value;

    if (!url || !key || !secret) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        'VIDEO_PROVIDER=livekit requires LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET',
      );
    }

    this.apiKey = key;
    this.apiSecret = secret;
    this.publicUrl = publicUrl || url;
    this.clients = clients ?? {
      rooms: new RoomServiceClient(url, key, secret),
      egress: new EgressClient(url, key, secret),
      receiver: new WebhookReceiver(key, secret),
    };
  }

  async createRoom(input: VideoRoomInput): Promise<VideoRoom> {
    const room = await this.clients.rooms.createRoom({
      name: input.name,
      maxParticipants: input.maxParticipants,
      emptyTimeout: input.emptyTimeoutSeconds,
    });
    return { roomId: room.name, createdAt: new Date() };
  }

  async issueToken(
    input: VideoTokenInput,
  ): Promise<{ token: string; url: string; expiresAt: Date }> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: input.userId,
      name: input.displayName,
      ttl: input.ttlSeconds,
      metadata: JSON.stringify({ role: input.role }),
    });
    token.addGrant({
      roomJoin: true,
      room: input.roomId,
      canSubscribe: true,
      canPublish: input.canPublish,
      // Following `canPublish` closes the data channel to a watch-only viewer as well.
      canPublishData: input.canPublish,
    });

    return {
      token: await token.toJwt(),
      url: this.publicUrl,
      expiresAt: new Date(Date.now() + input.ttlSeconds * 1000),
    };
  }

  async startRecording(input: VideoRecordingInput): Promise<VideoRecordingHandle> {
    const s = this.config.storage;
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: input.storageKey,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: s.accessKey,
          secret: s.secretKey,
          region: s.region,
          bucket: s.bucket,
          endpoint: s.endpoint,
          forcePathStyle: s.forcePathStyle,
        }),
      },
    });

    const info = await this.clients.egress.startRoomCompositeEgress(input.roomId, output, {
      layout: 'speaker',
    });
    return { egressId: info.egressId, startedAt: new Date() };
  }

  async stopRecording(egressId: string): Promise<void> {
    await this.clients.egress.stopEgress(egressId);
  }

  /**
   * Verifies the webhook's signed header against the raw body and normalises it.
   *
   * LiveKit signs a JWT over the body's hash, so a body altered in transit fails here. The
   * SDK verifies asynchronously, which is why the interface allows a promise.
   */
  async parseWebhook(rawBody: Buffer, signature: string | undefined): Promise<VideoWebhookEvent> {
    if (!signature) throw AppError.badRequest('Missing LiveKit webhook authorization');

    let event: WebhookEvent;
    try {
      event = await this.clients.receiver.receive(rawBody.toString('utf8'), signature);
    } catch (error) {
      this.logger.warn(`Rejected a LiveKit webhook: ${(error as Error).message}`);
      throw AppError.badRequest('Invalid LiveKit webhook signature');
    }
    return this.normalise(event);
  }

  private normalise(event: WebhookEvent): VideoWebhookEvent {
    const base = {
      eventId: event.id,
      roomId: event.room?.name ?? event.egressInfo?.roomName ?? '',
      occurredAt: new Date(Number(event.createdAt) * 1000),
      raw: JSON.parse(JSON.stringify(event, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))),
    };

    switch (event.event) {
      case 'egress_started':
        return { ...base, type: 'egress_started', egressId: event.egressInfo?.egressId };
      case 'egress_ended': {
        const info = event.egressInfo;
        const failed =
          info?.status === EgressStatus.EGRESS_FAILED ||
          info?.status === EgressStatus.EGRESS_ABORTED;
        const result = info?.fileResults?.[0];
        return {
          ...base,
          type: failed ? 'egress_failed' : 'egress_ended',
          egressId: info?.egressId,
          recordingKey: result?.filename || undefined,
          // LiveKit reports the duration in nanoseconds.
          durationSeconds: result?.duration ? Math.round(Number(result.duration) / 1e9) : undefined,
        };
      }
      case 'participant_joined':
        return { ...base, type: 'participant_joined' };
      case 'participant_left':
        return { ...base, type: 'participant_left' };
      default:
        // Signed and valid but not modelled (room_started, track_published, ...): acknowledged
        // so LiveKit stops retrying, with no effect on recordings.
        return { ...base, type: 'ignored' };
    }
  }
}
