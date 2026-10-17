import { ParticipantRole } from '@hifzoon/shared';

import { ClassroomService, elapsedMinutes } from './classroom.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RedisService } from '../../redis/redis.service';
import type { PolicyService } from '../../common/services/policy.service';
import type { VideoProvider } from '../../integrations/providers';
import type { StorageService } from '../../storage/storage.service';
import type { CryptoService } from '../../common/services/crypto.service';

const MINUTE = 60_000;

/** Ownership checks are exercised by the controller/gateway; here they are stubbed. */
const SUBJECT = { userId: 'user-1', roles: [] as string[] };

function buildHarness(
  options: { participants?: Array<Record<string, unknown>>; consents?: boolean[] } = {},
) {
  const state = {
    participants: options.participants ?? [],
    consents: options.consents ?? [],
    created: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    sessionUpdate: null as Record<string, unknown> | null,
    redisWrites: [] as Array<{ key: string; value: unknown }>,
  };

  const prisma = {
    classParticipant: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const matches = state.participants.filter((p) =>
          Object.entries(where).every(([key, value]) => {
            if (value === null) return p[key] === null;
            return p[key] === value;
          }),
        );
        return matches[0] ?? null;
      }),
      findMany: jest.fn(async () => state.participants),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.created.push(data);
        return { id: 'participant-1', minutesPresent: 0 };
      }),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          state.updates.push({ id: where.id, ...data });
          return { id: where.id };
        },
      ),
    },
    classStudent: {
      findMany: jest.fn(
        async () =>
          options.consents?.map((consented, index) => ({
            studentId: `student-${index}`,
            student: { displayName: `Student ${index}`, consents: consented ? [{ id: 'c1' }] : [] },
          })) ?? [],
      ),
    },
    classSession: {
      findUnique: jest.fn(async () => ({ roomId: 'room-1', mushafLayout: 'MADANI_15' })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.sessionUpdate = data;
        return data;
      }),
    },
    recording: { upsert: jest.fn(async () => ({})) },
    student: { count: jest.fn(async () => 1) },
  } as unknown as PrismaService;

  const redis = {
    key: (...parts: Array<string | number>) => ['hifzoon', ...parts].join(':'),
    getJson: jest.fn(async () => null),
    setJson: jest.fn(async (key: string, value: unknown) => {
      state.redisWrites.push({ key, value });
    }),
  } as unknown as RedisService;

  const policies = {
    studentSelf: jest.fn(async () => true),
    assertClassRead: jest.fn(async () => undefined),
    assertClassControl: jest.fn(async () => undefined),
  } as unknown as PolicyService;
  const video = {
    startRecording: jest.fn(async () => ({ egressId: 'egress-1', startedAt: new Date() })),
    issueToken: jest.fn(async () => ({ token: 'v', url: 'u', expiresAt: new Date() })),
    createRoom: jest.fn(async () => ({ roomId: 'room-1', createdAt: new Date() })),
  } as unknown as VideoProvider;
  const storage = {
    buildKey: (...parts: string[]) => parts.join('/'),
  } as unknown as StorageService;

  const crypto = {
    hashToken: (value: string) => 'hmac:' + value,
    safeEqual: (a: string, b: string) => a === b,
  } as unknown as CryptoService;

  const service = new ClassroomService(prisma, crypto, redis, policies, storage, video);
  return { service, state, prisma, redis, crypto };
}

describe('Class attendance (FR-CLS-14)', () => {
  describe('elapsedMinutes', () => {
    it('rounds to whole minutes', () => {
      expect(
        elapsedMinutes(new Date('2026-01-01T10:00:00Z'), new Date('2026-01-01T10:30:30Z')),
      ).toBe(31);
      expect(
        elapsedMinutes(new Date('2026-01-01T10:00:00Z'), new Date('2026-01-01T10:29:29Z')),
      ).toBe(29);
    });

    it('never returns a negative duration for a clock skew', () => {
      expect(
        elapsedMinutes(new Date('2026-01-01T10:30:00Z'), new Date('2026-01-01T10:00:00Z')),
      ).toBe(0);
    });
  });

  describe('recordJoin', () => {
    it('FR-CLS-14 creates a participant row on the first join', async () => {
      const { service, state } = buildHarness();
      const result = await service.recordJoin({
        classId: 'class-1',
        userId: 'user-1',
        displayName: 'Maryam',
        role: ParticipantRole.STUDENT,
        studentId: 'student-1',
      });

      expect(state.created).toHaveLength(1);
      expect(result.rejoined).toBe(false);
      expect(result.minutesPresent).toBe(0);
    });

    it('FR-CLS-11 accumulates minutes across a reconnect instead of losing them', async () => {
      const { service, state } = buildHarness({
        participants: [
          {
            id: 'p1',
            classId: 'class-1',
            userId: 'user-1',
            role: ParticipantRole.STUDENT,
            joinedAt: new Date(Date.now() - 50 * MINUTE),
            leftAt: new Date(Date.now() - 20 * MINUTE),
            minutesPresent: 0,
          },
        ],
      });

      const result = await service.recordJoin({
        classId: 'class-1',
        userId: 'user-1',
        displayName: 'Maryam',
        role: ParticipantRole.STUDENT,
        studentId: 'student-1',
      });

      // The 30 minutes of the first segment are banked, not discarded.
      expect(result.rejoined).toBe(true);
      expect(result.minutesPresent).toBe(30);
      expect(state.updates[0]).toMatchObject({ joinedAt: expect.any(Date), leftAt: null });
    });

    it('is idempotent when a duplicate tab joins without leaving', async () => {
      const { service, state } = buildHarness({
        participants: [
          {
            id: 'p1',
            classId: 'class-1',
            userId: 'user-1',
            role: ParticipantRole.STUDENT,
            joinedAt: new Date(Date.now() - 5 * MINUTE),
            leftAt: null,
            minutesPresent: 0,
          },
        ],
      });

      const result = await service.recordJoin({
        classId: 'class-1',
        userId: 'user-1',
        displayName: 'Maryam',
        role: ParticipantRole.STUDENT,
        studentId: 'student-1',
      });

      expect(result.rejoined).toBe(false);
      expect(state.created).toHaveLength(0);
    });
  });

  describe('recordLeave', () => {
    it('FR-CLS-14 banks the minutes since the last join', async () => {
      const { service, state } = buildHarness({
        participants: [
          {
            id: 'p1',
            classId: 'class-1',
            userId: 'user-1',
            role: ParticipantRole.STUDENT,
            joinedAt: new Date(Date.now() - 25 * MINUTE),
            leftAt: null,
            minutesPresent: 10,
          },
        ],
      });

      const result = await service.recordLeave('class-1', 'user-1');
      expect(result.minutesPresent).toBe(35);
      expect(state.updates[0]).toMatchObject({ minutesPresent: 35, leftAt: expect.any(Date) });
    });

    it('does nothing when there is no open session to close', async () => {
      const { service, state } = buildHarness();
      const result = await service.recordLeave('class-1', 'user-1');

      expect(result.minutesPresent).toBe(0);
      expect(state.updates).toHaveLength(0);
    });
  });

  describe('closeAttendance', () => {
    it('banks minutes for anyone still connected when the class ends', async () => {
      const { service, state } = buildHarness({
        participants: [
          {
            id: 'p1',
            classId: 'class-1',
            userId: 'user-1',
            role: ParticipantRole.STUDENT,
            joinedAt: new Date(Date.now() - 40 * MINUTE),
            leftAt: null,
            minutesPresent: 0,
          },
        ],
      });

      const result = await service.closeAttendance('class-1', SUBJECT);
      expect(result.closed).toBe(1);
      expect(state.updates[0]).toMatchObject({ minutesPresent: 40 });
    });
  });
});

describe('Recording consent gate (FR-CLS-12)', () => {
  it('FR-CLS-12 allows recording only when every enrolled student has consented', async () => {
    const { service } = buildHarness({ consents: [true, true] });
    const consent = await service.recordingConsent('class-1', SUBJECT);

    expect(consent.allowed).toBe(true);
    expect(consent.missing).toEqual([]);
  });

  it('FR-CLS-12 blocks recording and names who is missing consent', async () => {
    const { service } = buildHarness({ consents: [true, false, true] });
    const consent = await service.recordingConsent('class-1', SUBJECT);

    expect(consent.allowed).toBe(false);
    expect(consent.missing).toEqual(['Student 1']);
    expect(consent.students).toHaveLength(3);
  });

  it('FR-CLS-12 refuses to start a recording without full consent', async () => {
    const { service } = buildHarness({ consents: [true, false] });

    await expect(service.startRecording('class-1', SUBJECT)).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED',
    });
  });

  it('FR-CLS-12 records the 90 day deletion date at creation (CR-02)', async () => {
    const { service, prisma } = buildHarness({ consents: [true] });

    const before = Date.now();
    const result = await service.startRecording('class-1', SUBJECT);
    const after = Date.now();

    const deleteAfter = new Date(result.deleteAfter).getTime();
    const ninetyDays = 90 * 86_400_000;
    expect(deleteAfter).toBeGreaterThanOrEqual(before + ninetyDays - 1000);
    expect(deleteAfter).toBeLessThanOrEqual(after + ninetyDays + 1000);

    const upserted = (prisma.recording.upsert as jest.Mock).mock.calls[0][0];
    expect(upserted.create.status).toBe('RECORDING');
  });
});

describe('Weak network handling (FR-CLS-11)', () => {
  const { service } = buildHarness();

  it('keeps everything on a healthy connection', () => {
    const advice = service.bandwidthAdvice(80, 2500, 1);
    expect(advice).toMatchObject({ tier: 'GOOD', publishVideo: true, publishAudio: true });
  });

  it('drops resolution but keeps audio and video on a poor connection', () => {
    const advice = service.bandwidthAdvice(500, 500, 6);
    expect(advice).toMatchObject({ tier: 'DEGRADED', publishVideo: true, publishAudio: true });
    expect(advice.requestResolution).toBe('180p');
  });

  it('drops video but never audio or the Mushaf when bandwidth collapses', () => {
    const advice = service.bandwidthAdvice(1200, 80, 20);
    expect(advice.publishVideo).toBe(false);
    // FR-CLS-11: the teaching must survive even when the picture does not.
    expect(advice.publishAudio).toBe(true);
    expect(advice.reason).toContain('FR-CLS-11');
  });

  it('treats high packet loss as a trigger even with good throughput', () => {
    const advice = service.bandwidthAdvice(100, 4000, 15);
    expect(advice.publishVideo).toBe(false);
  });
});

describe('Mushaf page bounds (FR-HFZ-01, FR-CLS-03)', () => {
  const { service } = buildHarness();

  it('accepts page 1 and page 604', async () => {
    await expect(service.setPage('class-1', 1, SUBJECT)).resolves.toMatchObject({ page: 1 });
    await expect(service.setPage('class-1', 604, SUBJECT)).resolves.toMatchObject({ page: 604 });
  });

  it('rejects page 0 and page 605', async () => {
    await expect(service.setPage('class-1', 0, SUBJECT)).rejects.toThrow(/between 1 and 604/);
    await expect(service.setPage('class-1', 605, SUBJECT)).rejects.toThrow(/between 1 and 604/);
  });

  it('rejects a non-integer page', async () => {
    await expect(service.setPage('class-1', 12.5, SUBJECT)).rejects.toThrow(/between 1 and 604/);
  });

  it('validates the highlight position', async () => {
    await expect(
      service.setHighlight('class-1', { surah: 0, ayah: 1, wordIndex: 0 }, SUBJECT),
    ).rejects.toThrow(/between 1 and 114/);
    await expect(
      service.setHighlight('class-1', { surah: 115, ayah: 1, wordIndex: 0 }, SUBJECT),
    ).rejects.toThrow(/between 1 and 114/);
    await expect(
      service.setHighlight('class-1', { surah: 1, ayah: 0, wordIndex: 0 }, SUBJECT),
    ).rejects.toThrow(/1 or greater/);
    await expect(
      service.setHighlight('class-1', { surah: 1, ayah: 1, wordIndex: -1 }, SUBJECT),
    ).rejects.toThrow(/cannot be negative/);
  });
});

describe('Room token signature (FR-CLS-01)', () => {
  it('rejects a forged token whose signature does not match', () => {
    const { service } = buildHarness();
    const claims = {
      sub: 'user-1',
      cid: 'class-1',
      role: ParticipantRole.TEACHER,
      studentId: null,
    };

    const forged = Buffer.from(JSON.stringify(claims)).toString('base64url') + '.deadbeef';
    expect(service.verifyRoomToken(forged)).toBeNull();
  });

  it('rejects a malformed token', () => {
    const { service } = buildHarness();
    expect(service.verifyRoomToken('garbage')).toBeNull();
    expect(service.verifyRoomToken('')).toBeNull();
  });

  it('accepts a correctly signed token', () => {
    const { service, crypto } = buildHarness();
    const claims = {
      sub: 'user-1',
      cid: 'class-1',
      role: ParticipantRole.STUDENT,
      studentId: 'student-1',
    };

    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = crypto.hashToken(body).slice(0, 32);

    expect(service.verifyRoomToken(body + '.' + signature)).toEqual(claims);
  });
});
