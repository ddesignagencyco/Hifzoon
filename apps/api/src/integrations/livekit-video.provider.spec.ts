import { EgressStatus } from 'livekit-server-sdk';

import type { AppConfigService } from '../config/app-config.service';
import { LiveKitVideoProvider, type LiveKitClients } from './livekit-video.provider';

const KEY = 'devkey';
const SECRET = 'hifzoon-dev-livekit-secret-0123456789';

function config(overrides: Record<string, unknown> = {}): AppConfigService {
  return {
    value: {
      LIVEKIT_URL: 'http://livekit:7880',
      LIVEKIT_PUBLIC_URL: 'ws://localhost:7880',
      LIVEKIT_API_KEY: KEY,
      LIVEKIT_API_SECRET: SECRET,
      ...overrides,
    },
    storage: {
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      region: 'us-east-1',
      bucket: 'hifzoon',
      endpoint: 'http://minio:9000',
      forcePathStyle: true,
    },
  } as unknown as AppConfigService;
}

function build(overrides: Record<string, unknown> = {}) {
  const clients = {
    rooms: { createRoom: jest.fn(async (o: { name: string }) => ({ name: o.name })) },
    egress: {
      startRoomCompositeEgress: jest.fn(async () => ({ egressId: 'EG_1' })),
      stopEgress: jest.fn(async () => ({})),
    },
    receiver: { receive: jest.fn() },
  };
  const provider = new LiveKitVideoProvider(
    config(overrides),
    clients as unknown as LiveKitClients,
  );
  return { provider, clients };
}

const decode = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

describe('LiveKitVideoProvider', () => {
  it('uses the room name as the room id, since that is what joins and webhooks report', async () => {
    const { provider, clients } = build();

    const room = await provider.createRoom({
      classId: 'c1',
      name: 'hifzoon-c1',
      maxParticipants: 8,
      emptyTimeoutSeconds: 900,
    });

    expect(room.roomId).toBe('hifzoon-c1');
    expect(clients.rooms.createRoom).toHaveBeenCalledWith({
      name: 'hifzoon-c1',
      maxParticipants: 8,
      emptyTimeout: 900,
    });
  });

  it('issues a token scoped to one room, returning the browser URL', async () => {
    const { provider } = build();

    const result = await provider.issueToken({
      roomId: 'hifzoon-c1',
      userId: 'u1',
      displayName: 'Ustadh Bilal',
      role: 'teacher',
      canPublish: true,
      ttlSeconds: 1200,
    });
    const claims = decode(result.token);

    expect(result.url).toBe('ws://localhost:7880');
    expect(claims.sub).toBe('u1');
    expect(claims.video).toMatchObject({
      room: 'hifzoon-c1',
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('gives a watch-only guardian no way to publish, including over the data channel (FR-CLS-13)', async () => {
    const { provider } = build();

    const result = await provider.issueToken({
      roomId: 'hifzoon-c1',
      userId: 'g1',
      displayName: 'Parent',
      role: 'guardian',
      canPublish: false,
      ttlSeconds: 1200,
    });
    const grant = decode(result.token).video;

    expect(grant.canPublish).toBe(false);
    expect(grant.canPublishData).toBe(false);
    expect(grant.canSubscribe).toBe(true);
  });

  it('falls back to the server URL for browsers when no public URL is set', async () => {
    const { provider } = build({ LIVEKIT_PUBLIC_URL: undefined });
    const result = await provider.issueToken({
      roomId: 'r',
      userId: 'u',
      displayName: 'n',
      role: 'student',
      canPublish: true,
      ttlSeconds: 60,
    });
    expect(result.url).toBe('http://livekit:7880');
  });

  it('records to our own bucket under the key we chose', async () => {
    const { provider, clients } = build();

    const handle = await provider.startRecording({
      roomId: 'hifzoon-c1',
      classId: 'c1',
      storageKey: 'recordings/c1/class.mp4',
      layout: 'MADANI_15' as never,
    });

    expect(handle.egressId).toBe('EG_1');
    const [room, output] = clients.egress.startRoomCompositeEgress.mock.calls[0] as unknown as [
      string,
      any,
    ];
    expect(room).toBe('hifzoon-c1');
    expect(output.filepath).toBe('recordings/c1/class.mp4');
    expect(output.output.case).toBe('s3');
    expect(output.output.value).toMatchObject({
      bucket: 'hifzoon',
      endpoint: 'http://minio:9000',
      forcePathStyle: true,
    });
  });

  it('stops a recording by egress id', async () => {
    const { provider, clients } = build();
    await provider.stopRecording('EG_1');
    expect(clients.egress.stopEgress).toHaveBeenCalledWith('EG_1');
  });

  it('refuses to construct without its URL and keys', () => {
    expect(() => new LiveKitVideoProvider(config({ LIVEKIT_URL: undefined }))).toThrow(
      /LIVEKIT_URL/,
    );
  });
});

describe('LiveKitVideoProvider.parseWebhook', () => {
  const body = Buffer.from('{}');

  it('maps a finished recording with its key and duration', async () => {
    const { provider, clients } = build();
    clients.receiver.receive.mockResolvedValue({
      event: 'egress_ended',
      id: 'EV_1',
      createdAt: BigInt(1_760_000_000),
      room: { name: 'hifzoon-c1' },
      egressInfo: {
        egressId: 'EG_1',
        status: EgressStatus.EGRESS_COMPLETE,
        fileResults: [
          { filename: 'recordings/c1/class.mp4', duration: BigInt(1800) * BigInt(1e9) },
        ],
      },
    });

    expect(await provider.parseWebhook(body, 'signed')).toMatchObject({
      eventId: 'EV_1',
      type: 'egress_ended',
      roomId: 'hifzoon-c1',
      egressId: 'EG_1',
      recordingKey: 'recordings/c1/class.mp4',
      durationSeconds: 1800,
    });
  });

  it('reports a failed or aborted egress as failed, not ended', async () => {
    const { provider, clients } = build();
    for (const status of [EgressStatus.EGRESS_FAILED, EgressStatus.EGRESS_ABORTED]) {
      clients.receiver.receive.mockResolvedValueOnce({
        event: 'egress_ended',
        id: 'EV_2',
        createdAt: BigInt(1_760_000_000),
        room: { name: 'r' },
        egressInfo: { egressId: 'EG_2', status, fileResults: [] },
      });
      expect((await provider.parseWebhook(body, 'signed')).type).toBe('egress_failed');
    }
  });

  it('maps presence events and acknowledges ones it does not model', async () => {
    const { provider, clients } = build();

    clients.receiver.receive.mockResolvedValueOnce({
      event: 'participant_joined',
      id: 'EV_3',
      createdAt: BigInt(1),
      room: { name: 'r' },
    });
    expect((await provider.parseWebhook(body, 'signed')).type).toBe('participant_joined');

    clients.receiver.receive.mockResolvedValueOnce({
      event: 'track_published',
      id: 'EV_4',
      createdAt: BigInt(1),
      room: { name: 'r' },
    });
    expect((await provider.parseWebhook(body, 'signed')).type).toBe('ignored');
  });

  it('rejects an invalid signature and a missing header', async () => {
    const { provider, clients } = build();
    clients.receiver.receive.mockRejectedValue(new Error('hash mismatch'));

    await expect(provider.parseWebhook(body, 'forged')).rejects.toThrow(
      /Invalid LiveKit webhook signature/,
    );
    await expect(provider.parseWebhook(body, undefined)).rejects.toThrow(/Missing LiveKit/);
  });
});
