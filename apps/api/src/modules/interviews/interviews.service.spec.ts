import { INTERVIEW_EARLY_OPEN_MINUTES, InterviewParticipantRole, Role } from '@hifzoon/shared';

import {
  InterviewsService,
  applicantIdentity,
  elapsedMinutes,
  normaliseScores,
} from './interviews.service';
import type { AuthenticatedUser } from '../../common/decorators';
import type { AppConfigService } from '../../config/app-config.service';
import type { CryptoService } from '../../common/services/crypto.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { VideoProvider } from '../../integrations/providers';

const MINUTE = 60_000;

const QARI: AuthenticatedUser = {
  id: 'user-qari',
  name: 'Qari Sahib',
  roles: [Role.ADMIN],
} as AuthenticatedUser;

const SUPERVISOR: AuthenticatedUser = {
  id: 'user-supervisor',
  name: 'Supervisor',
  roles: [Role.SUPERVISOR],
} as AuthenticatedUser;

const GUARDIAN: AuthenticatedUser = {
  id: 'user-guardian',
  name: 'A Parent',
  roles: [Role.GUARDIAN],
} as AuthenticatedUser;

interface HarnessOptions {
  interview?: Record<string, unknown>;
  application?: Record<string, unknown>;
  clash?: Record<string, unknown> | null;
  openForApplication?: Record<string, unknown> | null;
  participant?: Record<string, unknown> | null;
  interviewerRoles?: Role[];
}

function buildHarness(options: HarnessOptions = {}) {
  const now = Date.now();
  const interview = {
    id: 'interview-1',
    applicationId: 'app-1',
    stage: 'DEMO_CLASS',
    interviewerId: QARI.id,
    startsAt: new Date(now - 5 * MINUTE),
    endsAt: new Date(now + 25 * MINUTE),
    timeZone: 'Asia/Karachi',
    status: 'LIVE',
    roomId: 'room-1',
    notes: 'Strong Hifz',
    outcome: 'PENDING',
    outcomeNotes: null,
    recitationScore: null,
    tajweedScore: null,
    memorisationScore: null,
    teachingScore: null,
    communicationScore: null,
    decidedAt: null,
    decidedBy: null,
    cancelledAt: null,
    cancelReason: null,
    startedAt: new Date(now - 5 * MINUTE),
    endedAt: null,
    applicantTokenExpiresAt: new Date(now + 24 * 3_600_000),
    interviewer: { name: QARI.name },
    application: { applicantName: 'Hafiz Bilal', email: 'bilal@example.com', status: 'DEMO_CLASS' },
    ...options.interview,
  };

  const state = {
    created: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    participantCreates: [] as Array<Record<string, unknown>>,
    participantUpdates: [] as Array<Record<string, unknown>>,
    emails: [] as Array<Record<string, unknown>>,
    roomsEnded: [] as string[],
    roomsCreated: [] as Array<Record<string, unknown>>,
    tokensIssued: [] as Array<Record<string, unknown>>,
  };

  const prisma = {
    teacherApplication: {
      findUnique: jest.fn(async () => ({
        id: 'app-1',
        applicantName: 'Hafiz Bilal',
        email: 'bilal@example.com',
        status: 'DEMO_CLASS',
        ...options.application,
      })),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        name: where.id === QARI.id ? QARI.name : 'Someone',
        status: 'ACTIVE',
        roles: (options.interviewerRoles ?? [Role.ADMIN]).map((role) => ({ role })),
      })),
    },
    interviewSession: {
      findUnique: jest.fn(async () => interview),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        // The booking path asks twice: once for an interviewer clash (keyed by
        // interviewerId) and once for another open interview on the application.
        'interviewerId' in where ? (options.clash ?? null) : (options.openForApplication ?? null),
      ),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.created.push(data);
        return {
          id: 'interview-new',
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          timeZone: data.timeZone,
          status: 'SCHEDULED',
          stage: data.stage,
        };
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.updates.push(data);
        return { id: interview.id, ...data };
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    interviewParticipant: {
      findUnique: jest.fn(async () => options.participant ?? null),
      findFirst: jest.fn(async () => options.participant ?? null),
      findMany: jest.fn(async () => (options.participant ? [options.participant] : [])),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.participantCreates.push(data);
        return { id: 'participant-1' };
      }),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          state.participantUpdates.push({ id: where.id, ...data });
          return { id: where.id };
        },
      ),
    },
  } as unknown as PrismaService;

  const crypto = {
    issueOpaqueToken: jest.fn(() => 'plain-token'),
    hashToken: jest.fn((value: string) => `hash(${value})`),
    safeEqual: jest.fn((a: string, b: string) => a === b),
  } as unknown as CryptoService;

  const config = {
    value: { APP_WEB_URL: 'https://hifzoon.test' },
  } as unknown as AppConfigService;

  const notifications = {
    emailAddress: jest.fn(async (input: Record<string, unknown>) => {
      state.emails.push(input);
      return true;
    }),
  } as unknown as NotificationsService;

  const video = {
    createRoom: jest.fn(async (input: Record<string, unknown>) => {
      state.roomsCreated.push(input);
      return { roomId: 'room-new', createdAt: new Date() };
    }),
    issueToken: jest.fn(async (input: Record<string, unknown>) => {
      state.tokensIssued.push(input);
      return { token: 'video-token', url: 'wss://livekit.test', expiresAt: new Date() };
    }),
    endRoom: jest.fn(async (roomId: string) => {
      state.roomsEnded.push(roomId);
    }),
  } as unknown as VideoProvider;

  const service = new InterviewsService(prisma, crypto, config, notifications, video);
  return { service, prisma, crypto, notifications, video, state, interview, now };
}

describe('elapsedMinutes', () => {
  it('floors to whole minutes and never goes negative', () => {
    const start = new Date('2026-11-02T10:00:00Z');
    expect(elapsedMinutes(start, new Date('2026-11-02T10:04:59Z'))).toBe(4);
    expect(elapsedMinutes(start, new Date('2026-11-02T09:00:00Z'))).toBe(0);
  });
});

describe('normaliseScores', () => {
  it('keeps only rubric fields and lets null clear one', () => {
    const result = normaliseScores({
      tajweedScore: 4,
      recitationScore: null,
      // @ts-expect-error — proving an unknown key cannot reach Prisma.
      bribeScore: 5,
    });
    expect(result).toEqual({ recitationScore: null, tajweedScore: 4 });
  });

  it('leaves an unmentioned score untouched rather than wiping it', () => {
    expect(normaliseScores({ tajweedScore: 3 })).toEqual({ tajweedScore: 3 });
  });

  it('refuses a score off the 1-5 scale', () => {
    expect(() => normaliseScores({ tajweedScore: 0 })).toThrow(/between 1 and 5/);
    expect(() => normaliseScores({ tajweedScore: 6 })).toThrow(/between 1 and 5/);
    expect(() => normaliseScores({ tajweedScore: 3.5 })).toThrow(/between 1 and 5/);
  });
});

describe('InterviewsService.schedule', () => {
  it('books an interview and emails the applicant a one-time link', async () => {
    const { service, state } = buildHarness();
    const startsAt = new Date(Date.now() + 2 * 3_600_000);

    const result = await service.schedule(QARI, {
      applicationId: 'app-1',
      startsAt,
      durationMinutes: 45,
      timeZone: 'Asia/Karachi',
    });

    expect(result.durationMinutes).toBe(45);
    expect(result.applicantJoinUrl).toBe('https://hifzoon.test/interview/plain-token');
    // Only the HMAC is stored. The stub's "hash" is `hash(<token>)`, so the real check is
    // that no written *value* is the plaintext itself.
    expect(state.created[0].applicantTokenHash).toBe('hash(plain-token)');
    expect(Object.values(state.created[0])).not.toContain('plain-token');
    expect(state.emails).toHaveLength(1);
    expect((state.emails[0].data as Record<string, unknown>).joinUrl).toContain('plain-token');
  });

  it('defaults the interviewer to the caller and the length to 30 minutes', async () => {
    const { service, state } = buildHarness();
    const startsAt = new Date(Date.now() + 3_600_000);

    const result = await service.schedule(QARI, { applicationId: 'app-1', startsAt });

    expect(result.durationMinutes).toBe(30);
    expect(state.created[0].interviewerId).toBe(QARI.id);
    expect((state.created[0].endsAt as Date).getTime() - startsAt.getTime()).toBe(30 * MINUTE);
  });

  it('can book without emailing, so the link can be handed over another way', async () => {
    const { service, state } = buildHarness();
    await service.schedule(QARI, {
      applicationId: 'app-1',
      startsAt: new Date(Date.now() + 3_600_000),
      notifyApplicant: false,
    });
    expect(state.emails).toHaveLength(0);
  });

  it('refuses a closed application', async () => {
    const { service } = buildHarness({ application: { status: 'REJECTED' } });
    await expect(
      service.schedule(QARI, {
        applicationId: 'app-1',
        startsAt: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toThrow(/already REJECTED/);
  });

  it('refuses a second open interview for the same applicant', async () => {
    const { service } = buildHarness({
      openForApplication: { id: 'interview-existing', startsAt: new Date() },
    });
    await expect(
      service.schedule(QARI, {
        applicationId: 'app-1',
        startsAt: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toThrow(/already has an interview booked/);
  });

  it('refuses a double-booked interviewer', async () => {
    const { service } = buildHarness({
      clash: {
        id: 'interview-other',
        startsAt: new Date(Date.now() + 3_600_000),
        endsAt: new Date(Date.now() + 2 * 3_600_000),
      },
    });
    await expect(
      service.schedule(QARI, {
        applicationId: 'app-1',
        startsAt: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toThrow(/already has an interview then/);
  });

  it('refuses a booking in the past', async () => {
    const { service } = buildHarness();
    await expect(
      service.schedule(QARI, {
        applicationId: 'app-1',
        startsAt: new Date(Date.now() - 3_600_000),
      }),
    ).rejects.toThrow(/cannot be booked in the past/);
  });

  it('refuses a length outside 10-120 minutes', async () => {
    const { service } = buildHarness();
    const startsAt = new Date(Date.now() + 3_600_000);
    await expect(
      service.schedule(QARI, { applicationId: 'app-1', startsAt, durationMinutes: 5 }),
    ).rejects.toThrow(/between 10 and 120 minutes/);
    await expect(
      service.schedule(QARI, { applicationId: 'app-1', startsAt, durationMinutes: 240 }),
    ).rejects.toThrow(/between 10 and 120 minutes/);
  });

  it('refuses to assign an interview to someone who is not staff', async () => {
    const { service } = buildHarness({ interviewerRoles: [Role.TEACHER] });
    await expect(
      service.schedule(QARI, {
        applicationId: 'app-1',
        startsAt: new Date(Date.now() + 3_600_000),
        interviewerId: 'user-teacher',
      }),
    ).rejects.toThrow(/supervisor or admin/);
  });

  it('refuses a non-staff caller outright', async () => {
    const { service } = buildHarness();
    await expect(
      service.schedule(GUARDIAN, {
        applicationId: 'app-1',
        startsAt: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toThrow(/academy staff/);
  });
});

describe('InterviewsService.cancel', () => {
  it('expires the applicant link immediately and ends the room', async () => {
    const { service, state } = buildHarness({ interview: { status: 'SCHEDULED' } });

    await service.cancel(QARI, 'interview-1', 'Qari shb is unwell');

    const update = state.updates[0];
    expect(update.status).toBe('CANCELLED');
    // Not the old expiry: a cancelled interview's link has to stop working now.
    expect((update.applicantTokenExpiresAt as Date).getTime()).toBeLessThanOrEqual(Date.now());
    expect(state.roomsEnded).toEqual(['room-1']);
    expect(state.emails[0].template).toBe('interview.cancelled');
  });

  it('refuses a supervisor who is not the interviewer, and lets the interviewer or an admin through', async () => {
    const { service } = buildHarness({ interview: { status: 'SCHEDULED' } });
    await expect(service.cancel(SUPERVISOR, 'interview-1')).rejects.toThrow(/assigned interviewer/);
    const owned = buildHarness({
      interview: { status: 'SCHEDULED', interviewerId: SUPERVISOR.id },
    });
    await expect(owned.service.cancel(SUPERVISOR, 'interview-1')).resolves.toBeDefined();
  });

  it('refuses to cancel an interview that is already closed', async () => {
    const { service } = buildHarness({ interview: { status: 'COMPLETED' } });
    await expect(service.cancel(QARI, 'interview-1')).rejects.toThrow(/already COMPLETED/);
  });
});

describe('InterviewsService.list awaitingOutcome', () => {
  it('asks only for ended, uncancelled interviews still without a verdict', async () => {
    const { service, prisma } = buildHarness();
    await service.list(QARI, { awaitingOutcome: true });

    const where = (prisma.interviewSession.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.outcome).toBe('PENDING');
    expect((where.endsAt.lt as Date).getTime()).toBeLessThanOrEqual(Date.now());
    expect(where.status.in).toEqual(['SCHEDULED', 'LIVE', 'COMPLETED']);
  });

  it('leaves the list unfiltered without the flag', async () => {
    const { service, prisma } = buildHarness();
    await service.list(QARI, {});
    const where = (prisma.interviewSession.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.outcome).toBeUndefined();
    expect(where.endsAt).toBeUndefined();
  });
});

describe('InterviewsService.reschedule', () => {
  it('refuses a supervisor who is not the interviewer', async () => {
    const { service } = buildHarness({ interview: { status: 'SCHEDULED' } });
    await expect(service.reschedule(SUPERVISOR, 'interview-1', {})).rejects.toThrow(
      /assigned interviewer/,
    );
  });

  it('lets only an admin hand the interview to someone else', async () => {
    const asInterviewer = buildHarness({
      interview: { status: 'SCHEDULED', interviewerId: SUPERVISOR.id },
    });
    await expect(
      asInterviewer.service.reschedule(SUPERVISOR, 'interview-1', { interviewerId: 'user-other' }),
    ).rejects.toThrow(/Only an admin can change who conducts/);

    const asAdmin = buildHarness({ interview: { status: 'SCHEDULED' } });
    await expect(
      asAdmin.service.reschedule(QARI, 'interview-1', { interviewerId: 'user-other' }),
    ).resolves.toBeDefined();
  });

  it('keeps the applicant’s existing link alive and extends its expiry', async () => {
    const { service, state } = buildHarness({ interview: { status: 'SCHEDULED' } });
    const startsAt = new Date(Date.now() + 5 * 3_600_000);

    await service.reschedule(QARI, 'interview-1', { startsAt, durationMinutes: 60 });

    const update = state.updates[0];
    // The token hash is untouched, so the link already in the applicant's inbox works.
    expect(update).not.toHaveProperty('applicantTokenHash');
    expect((update.applicantTokenExpiresAt as Date).getTime()).toBeGreaterThan(startsAt.getTime());
    expect(state.emails[0].template).toBe('interview.rescheduled');
    // The plaintext is gone, so the email points at the lobby help page instead.
    expect((state.emails[0].data as Record<string, unknown>).joinUrl).not.toContain('plain-token');
  });

  it('does not email when only the length changed', async () => {
    const { service, state } = buildHarness({ interview: { status: 'SCHEDULED' } });
    await service.reschedule(QARI, 'interview-1', {});
    expect(state.emails).toHaveLength(0);
  });
});

describe('InterviewsService room tokens', () => {
  it('gives the assigned interviewer the INTERVIEWER role and a publishing token', async () => {
    const { service, state } = buildHarness();
    const claims = await service.issueStaffToken(QARI, 'interview-1');

    expect(claims.role).toBe(InterviewParticipantRole.INTERVIEWER);
    expect(claims.uid).toBe(QARI.id);
    expect(state.tokensIssued[0]).toMatchObject({ role: 'interviewer', canPublish: true });
  });

  it('seats any other staff member as an OBSERVER who can still speak', async () => {
    const { service, state } = buildHarness();
    const claims = await service.issueStaffToken(SUPERVISOR, 'interview-1');

    expect(claims.role).toBe(InterviewParticipantRole.OBSERVER);
    expect(state.tokensIssued[0]).toMatchObject({ canPublish: true });
  });

  it('issues the applicant a token under a synthetic identity, since they have no account', async () => {
    const { service, state } = buildHarness();
    const claims = await service.issueApplicantToken('plain-token');

    expect(claims.sub).toBe(applicantIdentity('interview-1'));
    expect(claims.uid).toBeNull();
    expect(claims.displayName).toBe('Hafiz Bilal');
    expect(state.tokensIssued[0]).toMatchObject({ role: 'applicant', canPublish: true });
  });

  it('refuses to join before the room opens', async () => {
    const start = Date.now() + 2 * 3_600_000;
    const { service } = buildHarness({
      interview: {
        status: 'SCHEDULED',
        startsAt: new Date(start),
        endsAt: new Date(start + 30 * MINUTE),
      },
    });
    await expect(service.issueStaffToken(QARI, 'interview-1')).rejects.toThrow(
      new RegExp(`opens ${INTERVIEW_EARLY_OPEN_MINUTES} minutes before`),
    );
  });

  it('refuses to join after the window has closed', async () => {
    const end = Date.now() - 2 * 3_600_000;
    const { service } = buildHarness({
      interview: {
        status: 'SCHEDULED',
        startsAt: new Date(end - 30 * MINUTE),
        endsAt: new Date(end),
      },
    });
    await expect(service.issueStaffToken(QARI, 'interview-1')).rejects.toThrow(/already finished/);
  });

  it('refuses to join a cancelled interview', async () => {
    const { service } = buildHarness({ interview: { status: 'CANCELLED' } });
    await expect(service.issueStaffToken(QARI, 'interview-1')).rejects.toThrow(/CANCELLED/);
  });

  it('treats an expired applicant link as expired, and an unknown one as not found', async () => {
    const expired = buildHarness({
      interview: { applicantTokenExpiresAt: new Date(Date.now() - MINUTE) },
    });
    await expect(expired.service.lobby('plain-token')).rejects.toThrow(/expired/);

    const unknown = buildHarness();
    (unknown.prisma.interviewSession.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(unknown.service.lobby('whatever')).rejects.toThrow(/not found/);
  });

  it('round-trips its own signed room token and rejects a tampered one', () => {
    const { service } = buildHarness();
    const token = service['signRoomToken']({
      sub: 'user-qari',
      iid: 'interview-1',
      role: InterviewParticipantRole.INTERVIEWER,
      uid: 'user-qari',
    });

    expect(service.verifyRoomToken(token)).toMatchObject({ iid: 'interview-1' });
    expect(service.verifyRoomToken(`${token}x`)).toBeNull();
    expect(service.verifyRoomToken('nonsense')).toBeNull();
  });
});

describe('InterviewsService.snapshot', () => {
  it('hides the interviewer’s notes from the applicant, who is in the same room', async () => {
    const { service } = buildHarness();

    const staffView = await service.snapshot('interview-1', {
      role: InterviewParticipantRole.INTERVIEWER,
    });
    const applicantView = await service.snapshot('interview-1', {
      role: InterviewParticipantRole.APPLICANT,
    });

    expect(staffView.notes).toBe('Strong Hifz');
    expect(applicantView.notes).toBeNull();
  });

  it('reports each participant’s reported mic and camera state', async () => {
    const { service } = buildHarness({
      participant: {
        identity: 'user-qari',
        displayName: 'Qari Sahib',
        role: 'INTERVIEWER',
        joinedAt: new Date(),
        leftAt: null,
        minutesPresent: 3,
      },
    });
    service.setMediaState('interview-1', 'user-qari', { micOn: true, camOn: false });

    const snapshot = await service.snapshot('interview-1', {
      role: InterviewParticipantRole.INTERVIEWER,
    });
    expect(snapshot.participants[0]).toMatchObject({ micOn: true, camOn: false });
  });
});

describe('InterviewsService attendance', () => {
  it('banks the minutes of a previous connection when someone rejoins', async () => {
    const joinedAt = new Date(Date.now() - 20 * MINUTE);
    const { service, state } = buildHarness({
      participant: {
        id: 'participant-1',
        joinedAt,
        leftAt: new Date(Date.now() - 12 * MINUTE),
        minutesPresent: 4,
      },
    });

    const result = await service.recordJoin({
      interviewId: 'interview-1',
      identity: 'user-qari',
      userId: 'user-qari',
      displayName: 'Qari Sahib',
      role: InterviewParticipantRole.INTERVIEWER,
    });

    // 4 already banked + the 8 minutes of the segment that ended.
    expect(result).toMatchObject({ minutesPresent: 12, rejoined: true });
    expect(state.participantUpdates[0]).toMatchObject({ leftAt: null, minutesPresent: 12 });
  });

  it('is idempotent when a second tab joins without the first having left', async () => {
    const { service, state } = buildHarness({
      participant: { id: 'participant-1', joinedAt: new Date(), leftAt: null, minutesPresent: 7 },
    });

    const result = await service.recordJoin({
      interviewId: 'interview-1',
      identity: 'user-qari',
      userId: 'user-qari',
      displayName: 'Qari Sahib',
      role: InterviewParticipantRole.INTERVIEWER,
    });

    expect(result).toMatchObject({ minutesPresent: 7, rejoined: false });
    expect(state.participantUpdates).toHaveLength(0);
  });

  it('creates the applicant with a null user id, because they have no account', async () => {
    const { service, state } = buildHarness();

    await service.recordJoin({
      interviewId: 'interview-1',
      identity: applicantIdentity('interview-1'),
      userId: null,
      displayName: 'Hafiz Bilal',
      role: InterviewParticipantRole.APPLICANT,
    });

    expect(state.participantCreates[0]).toMatchObject({
      userId: null,
      identity: 'applicant:interview-1',
      role: InterviewParticipantRole.APPLICANT,
    });
  });

  it('banks the open segment on leave', async () => {
    const { service, state } = buildHarness({
      participant: {
        id: 'participant-1',
        joinedAt: new Date(Date.now() - 9 * MINUTE),
        minutesPresent: 2,
      },
    });

    const result = await service.recordLeave('interview-1', 'user-qari');
    expect(result.minutesPresent).toBe(11);
    expect(state.participantUpdates[0]).toMatchObject({ minutesPresent: 11 });
  });
});

describe('InterviewsService.recordOutcome', () => {
  it('records the verdict, closes the interview and names the step it feeds', async () => {
    const { service, state } = buildHarness();

    const result = await service.recordOutcome(QARI, 'interview-1', {
      outcome: 'PASSED' as never,
      outcomeNotes: 'Ready to teach older students',
      scores: { tajweedScore: 4, recitationScore: 5 },
    });

    const update = state.updates[0];
    expect(update).toMatchObject({
      outcome: 'PASSED',
      status: 'COMPLETED',
      tajweedScore: 4,
      recitationScore: 5,
      decidedById: QARI.id,
    });
    // The verdict is evidence, not an advance: the pipeline is untouched and the step is
    // only named back to the caller.
    expect(result.recordStepHint).toEqual({
      applicationId: 'app-1',
      step: 'DEMO_CLASS',
      suggestedStatus: 'PASSED',
    });
    expect(state.roomsEnded).toEqual(['room-1']);
  });

  it('falls back to the DEMO_CLASS step when the interview was not tagged', async () => {
    const { service } = buildHarness({ interview: { stage: null } });
    const result = await service.recordOutcome(QARI, 'interview-1', { outcome: 'FAILED' as never });
    expect(result.recordStepHint.step).toBe('DEMO_CLASS');
    expect(result.recordStepHint.suggestedStatus).toBe('FAILED');
  });

  it('does not overwrite a no-show status with COMPLETED', async () => {
    const { service, state } = buildHarness({ interview: { status: 'NO_SHOW_APPLICANT' } });
    await service.recordOutcome(QARI, 'interview-1', { outcome: 'FAILED' as never });
    expect(state.updates[0]).not.toHaveProperty('status');
  });

  it('refuses PENDING as a verdict', async () => {
    const { service } = buildHarness();
    await expect(
      service.recordOutcome(QARI, 'interview-1', { outcome: 'PENDING' as never }),
    ).rejects.toThrow(/PASSED or FAILED/);
  });

  it('refuses a verdict on a cancelled interview', async () => {
    const { service } = buildHarness({ interview: { status: 'CANCELLED' } });
    await expect(
      service.recordOutcome(QARI, 'interview-1', { outcome: 'PASSED' as never }),
    ).rejects.toThrow(/cancelled/);
  });

  it('refuses a supervisor who only sat in, but allows an admin to correct it', async () => {
    const observed = buildHarness();
    await expect(
      observed.service.recordOutcome(SUPERVISOR, 'interview-1', { outcome: 'PASSED' as never }),
    ).rejects.toThrow(/assigned interviewer/);

    const byAdmin = buildHarness({ interview: { interviewerId: 'someone-else' } });
    await expect(
      byAdmin.service.recordOutcome(QARI, 'interview-1', { outcome: 'PASSED' as never }),
    ).resolves.toBeDefined();
  });
});

describe('InterviewsService.markNoShow', () => {
  it('records who did not turn up and frees the room', async () => {
    const { service, state } = buildHarness();
    await service.markNoShow(QARI, 'interview-1', 'APPLICANT', 'Waited 15 minutes');

    expect(state.updates[0]).toMatchObject({
      status: 'NO_SHOW_APPLICANT',
      outcomeNotes: 'Waited 15 minutes',
    });
    expect(state.roomsEnded).toEqual(['room-1']);
  });

  it('refuses before the interview has even started', async () => {
    const start = Date.now() + 3_600_000;
    const { service } = buildHarness({
      interview: {
        status: 'SCHEDULED',
        startsAt: new Date(start),
        endsAt: new Date(start + 30 * MINUTE),
      },
    });
    await expect(service.markNoShow(QARI, 'interview-1', 'APPLICANT')).rejects.toThrow(
      /has not started yet/,
    );
  });
});

describe('InterviewsService.resolveSocketIdentity', () => {
  it('accepts the applicant while the interview is open', async () => {
    const { service } = buildHarness();
    await expect(
      service.resolveSocketIdentity({
        sub: applicantIdentity('interview-1'),
        iid: 'interview-1',
        role: InterviewParticipantRole.APPLICANT,
        uid: null,
      }),
    ).resolves.toEqual({ displayName: 'Hafiz Bilal' });
  });

  it('refuses an applicant identity that does not belong to this interview', async () => {
    const { service } = buildHarness();
    await expect(
      service.resolveSocketIdentity({
        sub: applicantIdentity('some-other-interview'),
        iid: 'interview-1',
        role: InterviewParticipantRole.APPLICANT,
        uid: null,
      }),
    ).resolves.toBeNull();
  });

  it('refuses a token whose interview was cancelled after it was issued', async () => {
    const { service } = buildHarness({ interview: { status: 'CANCELLED' } });
    await expect(
      service.resolveSocketIdentity({
        sub: 'user-qari',
        iid: 'interview-1',
        role: InterviewParticipantRole.INTERVIEWER,
        uid: 'user-qari',
      }),
    ).resolves.toBeNull();
  });

  it('refuses a staff token whose account has lost its staff role', async () => {
    const { service, prisma } = buildHarness();
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
      name: 'Former Admin',
      status: 'ACTIVE',
      roles: [{ role: Role.GUARDIAN }],
    });
    await expect(
      service.resolveSocketIdentity({
        sub: 'user-qari',
        iid: 'interview-1',
        role: InterviewParticipantRole.INTERVIEWER,
        uid: 'user-qari',
      }),
    ).resolves.toBeNull();
  });

  it('refuses a token used outside the join window', async () => {
    const end = Date.now() - 2 * 3_600_000;
    const { service } = buildHarness({
      interview: { startsAt: new Date(end - 30 * MINUTE), endsAt: new Date(end) },
    });
    await expect(
      service.resolveSocketIdentity({
        sub: 'user-qari',
        iid: 'interview-1',
        role: InterviewParticipantRole.INTERVIEWER,
        uid: 'user-qari',
      }),
    ).resolves.toBeNull();
  });
});

describe('InterviewsService.closeFinishedInterviews', () => {
  it('completes one that went live and marks an untouched one a no-show', async () => {
    const { service, prisma, state } = buildHarness();
    (prisma.interviewSession.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'interview-live', status: 'LIVE', roomId: 'room-a' },
      { id: 'interview-ignored', status: 'SCHEDULED', roomId: 'room-b' },
    ]);

    const result = await service.closeFinishedInterviews();

    expect(result.closed).toBe(2);
    expect(state.updates[0].status).toBe('COMPLETED');
    expect(state.updates[1].status).toBe('NO_SHOW_APPLICANT');
    expect(state.roomsEnded).toEqual(['room-a', 'room-b']);
  });

  it('survives a provider room that has already gone', async () => {
    const { service, prisma, video } = buildHarness();
    (prisma.interviewSession.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'interview-live', status: 'LIVE', roomId: 'room-a' },
    ]);
    (video.endRoom as jest.Mock).mockRejectedValueOnce(new Error('room not found'));

    await expect(service.closeFinishedInterviews()).resolves.toMatchObject({
      closed: 1,
      roomsEnded: 0,
    });
  });
});
