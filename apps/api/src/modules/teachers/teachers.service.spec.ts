import { TeacherHiringStatus } from '@hifzoon/shared';

import {
  TeachersService,
  assertStepOrder,
  defaultTierId,
  deriveApplicationStatus,
} from './teachers.service';

const KEY = 'recitations/2026/0194c1d0-1111-7222-8333-444455556666.webm';
const DOC = 'documents/2026/0194c1d0-1111-7222-8333-444455556666.pdf';

function build(
  opts: {
    exists?: boolean;
    courseCodes?: string[];
    pending?: Record<string, unknown>;
    owns?: boolean;
  } = {},
) {
  const prisma = {
    student: {
      findUnique: jest.fn(async () => ({
        id: 'child-1',
        displayName: 'Yusuf',
        birthYear: 2016,
        gender: 'MALE',
        language: 'en',
        timeZone: 'Europe/London',
        mushafLayout: 'MADANI_15',
        notes: 'Prefers short sessions',
        family: {
          name: 'Rehman family',
          members: [{ relationship: 'mother', isPrimary: true, user: { name: 'Aisha Rehman' } }],
        },
        consents: [{ purpose: 'CLASS_RECORDING' }],
      })),
    },
    user: { findMany: jest.fn(async () => [{ id: 'admin-1' }]) },
    teacherProfile: {
      findMany: jest.fn(async () => [
        {
          id: 'p1',
          pendingProfileChanges: { bio: 'New bio', languages: ['ar', 'en'] },
          pendingProfileChangesAt: new Date('2026-10-19T09:00:00Z'),
          bio: 'Old bio',
          languages: ['ar'],
          subjects: ['HIFZ'],
          user: { name: 'Ustadh Bilal' },
        },
      ]),
      findUnique: jest.fn(async () => ({
        id: 'p1',
        userId: 'teacher-user',
        pendingProfileChanges: opts.pending ?? null,
      })),
      update: jest.fn(async ({ data }: { data: unknown }) => ({
        ...(data as object),
        user: { name: 'Ustadh Bilal' },
      })),
    },
    course: {
      findMany: jest.fn(async () => (opts.courseCodes ?? ['HIFZ']).map((code) => ({ code }))),
    },
    teacherApplication: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 'a1', status: 'SUBMITTED', createdAt: new Date() })),
      findUnique: jest.fn(async () => ({
        id: 'a1',
        recitationAudioUrl: KEY,
        documents: [
          { id: 'd1', type: 'IJAZAH', fileUrl: DOC, verified: false, approvedById: null },
          { id: 'd2', type: 'ID', fileUrl: 'data:legacy', verified: false, approvedById: null },
        ],
        demos: [],
        references: [],
      })),
    },
    interviewSession: { findFirst: jest.fn(async () => null) },
    hiringStep: { createMany: jest.fn(async () => ({})) },
    applicationDocument: { createMany: jest.fn(async () => ({})) },
  };
  const storage = {
    objectExists: jest.fn(async () => opts.exists ?? true),
    signedDownloadUrl: jest.fn(async (key: string) => `https://signed.test/${key}`),
  };
  const notifications = { enqueue: jest.fn(async () => ({ queued: 1 })) };
  const policies = { teacherOwnsStudent: jest.fn(async () => opts.owns ?? true) };
  const service = new TeachersService(
    prisma as never,
    storage as never,
    notifications as never,
    policies as never,
  );
  return { service, prisma, storage, notifications, policies };
}

describe('TeachersService.requestProfileChange', () => {
  it.each(['javascript:alert(1)', 'data:text/html;base64,AAAA', 'ftp://x.test/a.png'])(
    'refuses %s as a public profile URL (S21)',
    async (url) => {
      const { service, prisma } = build();
      await expect(
        service.requestProfileChange({ userId: 'u1', changes: { photoUrl: url } }),
      ).rejects.toThrow(/https URL/);
      expect(prisma.teacherProfile.update).not.toHaveBeenCalled();
    },
  );

  it('accepts an https URL', async () => {
    const { service } = build();
    await expect(
      service.requestProfileChange({
        userId: 'u1',
        changes: { introVideoUrl: 'https://cdn.test/intro.mp4' },
      }),
    ).resolves.toBeDefined();
  });

  it('rejects null for a list field, which is not nullable in the database (B33)', async () => {
    const { service } = build();
    await expect(
      service.requestProfileChange({ userId: 'u1', changes: { languages: null } }),
    ).rejects.toThrow(/cannot be null/);
  });

  it('allows an empty list to clear a list field', async () => {
    const { service } = build();
    await expect(
      service.requestProfileChange({ userId: 'u1', changes: { subjects: [] } }),
    ).resolves.toBeDefined();
  });

  it('rejects languages that are not ISO 639-1 codes', async () => {
    const { service } = build();
    await expect(
      service.requestProfileChange({ userId: 'u1', changes: { languages: ['english'] } }),
    ).rejects.toThrow(/ISO 639-1/);
  });

  it('rejects subjects that are not course codes', async () => {
    const { service } = build({ courseCodes: ['HIFZ'] });
    await expect(
      service.requestProfileChange({ userId: 'u1', changes: { subjects: ['HIFZ', 'ASTROLOGY'] } }),
    ).rejects.toThrow(/existing course codes/);
  });

  it('strips a teacher-claimed verified:true on a new qualifications entry (FR-TCH-09)', async () => {
    const { service, prisma } = build();
    await service.requestProfileChange({
      userId: 'u1',
      changes: {
        qualifications: [
          {
            type: 'CERTIFICATE',
            title: 'Self-issued cert',
            issuer: 'Me',
            documentUrl: 'https://cdn.test/fake.pdf',
            verified: true,
            verifiedById: 'u1',
            verifiedAt: '2020-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    const { data } = prisma.teacherProfile.update.mock.calls[0][0] as {
      data: { pendingProfileChanges: { qualifications: unknown[] } };
    };
    expect(data.pendingProfileChanges.qualifications).toEqual([
      expect.objectContaining({
        title: 'Self-issued cert',
        verified: false,
        verifiedById: undefined,
        verifiedAt: undefined,
      }),
    ]);
  });
});

describe('TeachersService.submitApplication upload keys (B32)', () => {
  const base = { applicantName: 'Aisha Khan', email: 'aisha@test.dev' };

  it('rejects a base64 data URL in place of a key', async () => {
    const { service } = build();
    await expect(
      service.submitApplication({ ...base, recitationAudioKey: 'data:audio/webm;base64,AAAA' }),
    ).rejects.toThrow(/not a valid upload key/);
  });

  it('rejects a key from the wrong prefix for its kind', async () => {
    const { service } = build();
    await expect(
      service.submitApplication({ ...base, documentKeys: { IJAZAH: KEY } as never }),
    ).rejects.toThrow(/not a valid upload key/);
  });

  it('rejects a well-formed key whose object was never uploaded', async () => {
    const { service } = build({ exists: false });
    await expect(service.submitApplication({ ...base, recitationAudioKey: KEY })).rejects.toThrow(
      /was not uploaded/,
    );
  });

  it('accepts real keys', async () => {
    const { service, prisma } = build();
    await service.submitApplication({
      ...base,
      recitationAudioKey: KEY,
      documentKeys: { IJAZAH: DOC } as never,
    });
    expect(prisma.teacherApplication.create).toHaveBeenCalled();
  });
});

describe('TeachersService.getApplication download links (B31)', () => {
  it('signs links for stored keys and leaves legacy values unsigned', async () => {
    const { service } = build();
    const application = await service.getApplication('a1');

    expect(application.recitationAudioDownloadUrl).toBe(`https://signed.test/${KEY}`);
    expect(application.documents[0].downloadUrl).toBe(`https://signed.test/${DOC}`);
    expect(application.documents[1].downloadUrl).toBeNull();
  });
});

describe('hiring steps need evidence', () => {
  const gate = (prisma: Record<string, unknown>, step: string) => {
    const { service } = build();
    Object.assign((service as unknown as { prisma: Record<string, unknown> }).prisma, prisma);
    return (
      service as unknown as { assertStepEvidence: (id: string, s: string) => Promise<void> }
    ).assertStepEvidence('a1', step);
  };

  it('refuses the demo step until a live interview the applicant attended is marked passed', async () => {
    const findFirst = jest.fn(async () => null);
    await expect(gate({ interviewSession: { findFirst } }, 'DEMO_CLASS')).rejects.toThrow(
      /live interview/,
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          applicationId: 'a1',
          outcome: 'PASSED',
          startedAt: { not: null },
          participants: { some: { role: 'APPLICANT' } },
        }),
      }),
    );
    await expect(
      gate({ interviewSession: { findFirst: jest.fn(async () => ({ id: 'i1' })) } }, 'DEMO_CLASS'),
    ).resolves.toBeUndefined();
  });

  it('refuses the ID check until the ID is verified, and the certificate when a sanad is claimed', async () => {
    const docs = (rows: unknown[], hasSanad: boolean) => ({
      applicationDocument: { findMany: jest.fn(async () => rows) },
      teacherApplication: { findUnique: jest.fn(async () => ({ qualifications: { hasSanad } })) },
    });
    await expect(gate(docs([{ type: 'ID', verified: false }], false), 'ID_CHECK')).rejects.toThrow(
      /photo ID/,
    );
    await expect(gate(docs([{ type: 'ID', verified: true }], true), 'ID_CHECK')).rejects.toThrow(
      /certificate/,
    );
    await expect(
      gate(docs([{ type: 'ID', verified: true }], false), 'ID_CHECK'),
    ).resolves.toBeUndefined();
  });

  it('refuses the reference check without a confirmed referee, and training without a passed course', async () => {
    await expect(
      gate({ hiringReference: { count: jest.fn(async () => 0) } }, 'REFERENCE_CHECK'),
    ).rejects.toThrow(/referee/);
    await expect(
      gate({ applicantTraining: { findFirst: jest.fn(async () => null) } }, 'TRAINING'),
    ).rejects.toThrow(/completed training/);
    await expect(
      gate({ applicantTraining: { findFirst: jest.fn(async () => ({ id: 't1' })) } }, 'TRAINING'),
    ).resolves.toBeUndefined();
  });
});

describe('teacher profile change review (M54)', () => {
  it('stamps when a change was staged', async () => {
    const { service, prisma } = build();
    await service.requestProfileChange({ userId: 'u1', changes: { bio: 'Hello there' } });
    expect(prisma.teacherProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pendingProfileChangesAt: expect.any(Date) }),
      }),
    );
  });

  it('lists staged changes next to the current values of only the changed fields', async () => {
    const { service } = build();
    const [row] = await service.listPendingProfileChanges();

    expect(row).toMatchObject({
      profileId: 'p1',
      teacherName: 'Ustadh Bilal',
      changes: { bio: 'New bio', languages: ['ar', 'en'] },
      current: { bio: 'Old bio', languages: ['ar'] },
    });
    expect(row.current).not.toHaveProperty('subjects');
    expect(row.submittedAt).toEqual(new Date('2026-10-19T09:00:00Z'));
  });
});

describe('profile change outcome and notifications (M57)', () => {
  it('tells the admins when a teacher submits a change', async () => {
    const { service, notifications } = build();
    await service.requestProfileChange({ userId: 'u1', changes: { bio: 'A new bio' } });

    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['admin-1'],
        template: 'teacher.profile-change.submitted',
        data: { teacherName: 'Ustadh Bilal', fields: 'bio' },
      }),
    );
  });

  it('clears the previous outcome when a new change is submitted', async () => {
    const { service, prisma } = build();
    await service.requestProfileChange({ userId: 'u1', changes: { bio: 'Another bio' } });

    expect(prisma.teacherProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ profileChangeOutcome: null, profileChangeReason: null }),
      }),
    );
  });

  it('stores a rejection with its reason and notifies the teacher', async () => {
    const { service, prisma, notifications } = build({ pending: { bio: 'x' } });
    await service.reviewProfileChange({
      profileId: 'p1',
      approve: false,
      reviewerUserId: 'admin-1',
      reason: 'The photo is not suitable',
    });

    expect(prisma.teacherProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profileChangeOutcome: 'REJECTED',
          profileChangeReason: 'The photo is not suitable',
        }),
      }),
    );
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['teacher-user'],
        template: 'teacher.profile-change.reviewed',
        data: { outcome: 'rejected', reason: 'The photo is not suitable' },
      }),
    );
  });

  it('stores an approval and notifies the teacher', async () => {
    const { service, prisma, notifications } = build({ pending: { bio: 'Approved bio' } });
    await service.reviewProfileChange({
      profileId: 'p1',
      approve: true,
      reviewerUserId: 'admin-1',
    });

    expect(prisma.teacherProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bio: 'Approved bio', profileChangeOutcome: 'APPROVED' }),
      }),
    );
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ data: { outcome: 'approved', reason: null } }),
    );
  });

  it('stamps an unverified qualifications entry as verified on approval (FR-TCH-09)', async () => {
    const { service, prisma } = build({
      pending: {
        qualifications: [
          {
            type: 'CERTIFICATE',
            title: 'Ijazah',
            issuer: 'Al-Azhar',
            documentUrl: 'https://cdn.test/ijazah.pdf',
            verified: false,
          },
        ],
      },
    });
    await service.reviewProfileChange({
      profileId: 'p1',
      approve: true,
      reviewerUserId: 'admin-1',
    });

    const { data } = prisma.teacherProfile.update.mock.calls[0][0] as {
      data: { qualifications: unknown[] };
    };
    expect(data.qualifications).toEqual([
      expect.objectContaining({
        title: 'Ijazah',
        verified: true,
        verifiedById: 'admin-1',
        verifiedAt: expect.any(String),
      }),
    ]);
  });

  it('lets a teacher withdraw their own staged change', async () => {
    const { service, prisma } = build({ pending: { bio: 'x' } });
    await service.withdrawProfileChange('teacher-user');

    expect(prisma.teacherProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'teacher-user' } }),
    );
    expect(prisma.teacherProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ profileChangeOutcome: 'WITHDRAWN' }),
      }),
    );
  });

  it('refuses to withdraw when nothing is pending', async () => {
    const { service } = build();
    await expect(service.withdrawProfileChange('teacher-user')).rejects.toThrow(/no pending/);
  });

  it('does not block the teacher when the admin notification fails', async () => {
    const { service, notifications } = build();
    notifications.enqueue.mockRejectedValueOnce(new Error('queue down'));
    await expect(
      service.requestProfileChange({ userId: 'u1', changes: { bio: 'Still saved' } }),
    ).resolves.toBeDefined();
  });
});

describe('TeachersService.studentForTeacher (M47)', () => {
  it("returns the child's teaching context and the consents that matter in class", async () => {
    const { service } = build();
    const view = await service.studentForTeacher('teacher-user', 'child-1');

    expect(view).toMatchObject({
      displayName: 'Yusuf',
      timeZone: 'Europe/London',
      mushafLayout: 'MADANI_15',
      notes: 'Prefers short sessions',
      family: {
        name: 'Rehman family',
        guardians: [{ name: 'Aisha Rehman', relationship: 'mother', isPrimary: true }],
      },
      consents: { classRecording: true, aiVoice: false, aiTraining: false },
    });
  });

  it('never exposes a contact detail', async () => {
    const { service } = build();
    const view = await service.studentForTeacher('teacher-user', 'child-1');
    const text = JSON.stringify(view);

    expect(text).not.toMatch(/email|phone|@/i);
  });

  it('asks only for the guardian name, never an email or phone', async () => {
    const { service, prisma } = build();
    await service.studentForTeacher('teacher-user', 'child-1');

    const select = JSON.stringify((prisma.student.findUnique as jest.Mock).mock.calls[0][0].select);
    expect(select).not.toMatch(/email|phone/i);
  });

  it("refuses a student who is not the teacher's own", async () => {
    const { service, policies, prisma } = build({ owns: false });

    await expect(service.studentForTeacher('teacher-user', 'child-9')).rejects.toThrow();
    expect(policies.teacherOwnsStudent).toHaveBeenCalledWith('teacher-user', 'child-9');
    expect(prisma.student.findUnique).not.toHaveBeenCalled();
  });
});

describe('assertStepOrder (B8)', () => {
  it('lets a brand-new application record its first review, RECITATION_REVIEW', () => {
    expect(() =>
      assertStepOrder('SUBMITTED' as never, 'RECITATION_REVIEW' as never, 'PASSED'),
    ).not.toThrow();
  });

  it('still refuses to skip a step from a new application', () => {
    expect(() => assertStepOrder('SUBMITTED' as never, 'DEMO_CLASS' as never, 'PASSED')).toThrow(
      /Cannot record DEMO_CLASS/,
    );
  });

  it('keeps refusing to skip ahead later in the pipeline', () => {
    expect(() =>
      assertStepOrder('DEMO_CLASS' as never, 'REFERENCE_CHECK' as never, 'PASSED'),
    ).toThrow();
    expect(() =>
      assertStepOrder('DEMO_CLASS' as never, 'DEMO_CLASS' as never, 'PASSED'),
    ).not.toThrow();
  });

  it('does not constrain a failure or a reset', () => {
    expect(() =>
      assertStepOrder('SUBMITTED' as never, 'TRAINING' as never, 'FAILED'),
    ).not.toThrow();
  });
});

describe('TeachersService teacher tiers (point 4)', () => {
  function buildTierService(opts: { tierExists?: boolean } = {}) {
    const prisma = {
      teacherTier: {
        findMany: jest.fn(async () => [
          { id: 'tier-standard', code: 'STANDARD', sortOrder: 0 },
          { id: 'tier-senior', code: 'SENIOR', sortOrder: 2 },
        ]),
        findUnique: jest.fn(async () =>
          opts.tierExists === false ? null : { id: 'tier-senior', code: 'SENIOR' },
        ),
      },
      teacherProfile: {
        update: jest.fn(async ({ data }: { data: unknown }) => ({
          id: 'p1',
          tierId: (data as { tierId: string | null }).tierId,
          tier: null,
        })),
      },
    };
    const service = new TeachersService(prisma as never, {} as never, {} as never, {} as never);
    return { service, prisma };
  }

  it('lists tiers ordered by sortOrder', async () => {
    const { service, prisma } = buildTierService();
    const tiers = await service.listTeacherTiers();
    expect(tiers).toHaveLength(2);
    expect(prisma.teacherTier.findMany).toHaveBeenCalledWith({ orderBy: { sortOrder: 'asc' } });
  });

  it('refuses to assign a tier that does not exist', async () => {
    const { service } = buildTierService({ tierExists: false });
    await expect(service.assignTeacherTier('p1', 'missing-tier')).rejects.toThrow('Teacher tier');
  });

  it('assigns an existing tier to a teacher profile', async () => {
    const { service, prisma } = buildTierService();
    const result = await service.assignTeacherTier('p1', 'tier-senior');
    expect(result.tierId).toBe('tier-senior');
    expect(prisma.teacherProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { tierId: 'tier-senior' } }),
    );
  });

  it('clears a tier when tierId is null, without checking existence', async () => {
    const { service, prisma } = buildTierService();
    const result = await service.assignTeacherTier('p1', null);
    expect(result.tierId).toBeNull();
    expect(prisma.teacherTier.findUnique).not.toHaveBeenCalled();
  });
});

describe('application status after a step is recorded', () => {
  it('moves forward when the current step passes', () => {
    expect(
      deriveApplicationStatus(
        TeacherHiringStatus.RECITATION_REVIEW,
        'PASSED',
        TeacherHiringStatus.RECITATION_REVIEW,
      ),
    ).toBe(TeacherHiringStatus.DEMO_CLASS);
  });

  it('does not move an approved application back when an earlier step is passed again', () => {
    expect(
      deriveApplicationStatus(
        TeacherHiringStatus.RECITATION_REVIEW,
        'PASSED',
        TeacherHiringStatus.APPROVED,
      ),
    ).toBe(TeacherHiringStatus.APPROVED);
  });

  it('rejects the application when a step fails, so the applicant can reapply', () => {
    expect(
      deriveApplicationStatus(TeacherHiringStatus.ID_CHECK, 'FAILED', TeacherHiringStatus.ID_CHECK),
    ).toBe(TeacherHiringStatus.REJECTED);
  });

  it('moves a rejected application forward again when the failed step is passed', () => {
    expect(
      deriveApplicationStatus(TeacherHiringStatus.ID_CHECK, 'PASSED', TeacherHiringStatus.REJECTED),
    ).toBe(TeacherHiringStatus.REFERENCE_CHECK);
  });

  it('still moves back when an earlier step is reopened', () => {
    expect(
      deriveApplicationStatus(
        TeacherHiringStatus.ID_CHECK,
        'PENDING',
        TeacherHiringStatus.APPROVED,
      ),
    ).toBe(TeacherHiringStatus.ID_CHECK);
  });
});

describe('approval of an applicant who already has an account (backlog 12)', () => {
  it('grants the TEACHER role to the existing user', async () => {
    const roleUpsert = jest.fn();
    const prisma = {
      teacherApplication: {
        findUnique: jest.fn(async () => ({
          id: 'app1',
          applicantName: 'Aisha',
          email: 'Aisha@Example.com',
          phone: null,
          recitationAudioUrl: null,
          qualifications: null,
          safeguardingTrainingAt: null,
        })),
        update: jest.fn(),
      },
      user: { findUnique: jest.fn(async () => ({ id: 'u-guardian' })), create: jest.fn() },
      userRole: { upsert: roleUpsert },
      teacherProfile: { upsert: jest.fn() },
      passwordResetToken: { create: jest.fn() },
      $executeRaw: jest.fn(),
    };
    const service = new TeachersService(
      prisma as never,
      {} as never,
      { emailAddress: jest.fn() } as never,
      {} as never,
      { issueOpaqueToken: () => 't', hashToken: () => 'h' } as never,
      { value: { APP_WEB_URL: 'https://web.test' } } as never,
    );

    await (
      service as unknown as { createAccountForApplicant(id: string): Promise<void> }
    ).createAccountForApplicant('app1');

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(roleUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: 'u-guardian', role: 'TEACHER' } }),
    );
  });
});

describe('TeachersService.recordStep when the step row does not exist yet', () => {
  it('records the step by creating its row instead of failing "record not found"', async () => {
    // An application created through the real apply flow has no pre-created hiring_step
    // rows, so advancing a step must create the row rather than update a missing one.
    const { service, prisma } = build();
    const upsert = jest.fn(async () => ({
      id: 's1',
      step: TeacherHiringStatus.DEMO_CLASS,
      status: 'PENDING',
      completedAt: null,
    }));
    // The pre-fix code called hiringStep.update, which throws when the row is absent.
    const update = jest.fn(async () => {
      throw new Error('No record was found for an update.');
    });
    Object.assign(service as unknown as Record<string, unknown>, {
      recomputeReadiness: jest.fn(async () => undefined),
    });
    Object.assign(prisma, {
      teacherApplication: {
        findUnique: jest.fn(async () => ({
          id: 'a1',
          status: 'SUBMITTED',
          applicantName: 'Ustadh Yahya',
          email: 'yahya@example.com',
          userId: null,
        })),
        update: jest.fn(async () => ({})),
      },
      hiringStep: { upsert, update, updateMany: jest.fn(async () => ({ count: 0 })) },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    });

    const result = await service.recordStep({
      applicationId: 'a1',
      step: TeacherHiringStatus.DEMO_CLASS,
      status: 'PENDING',
      reviewerUserId: 'admin-1',
    });

    expect(result.step).toMatchObject({ step: TeacherHiringStatus.DEMO_CLASS });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          applicationId_step: { applicationId: 'a1', step: TeacherHiringStatus.DEMO_CLASS },
        },
        create: expect.objectContaining({
          applicationId: 'a1',
          step: TeacherHiringStatus.DEMO_CLASS,
          status: 'PENDING',
        }),
      }),
    );
  });
});

describe('teacher account creation after approval is idempotent', () => {
  it('refuses the "create account" retry when the application already has an account', async () => {
    const { service, prisma } = build();
    const transaction = jest.fn();
    Object.assign(prisma, {
      teacherApplication: {
        findUnique: jest.fn(async () => ({
          id: 'a1',
          status: 'APPROVED',
          applicantName: 'Ustadha Maryam',
          email: 'maryam@example.com',
          userId: 'teacher-user',
        })),
      },
      $transaction: transaction,
    });

    await expect(
      service.recordStep({
        applicationId: 'a1',
        step: TeacherHiringStatus.APPROVED,
        status: 'PASSED',
        reviewerUserId: 'admin-1',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringMatching(/already has a teacher account/),
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not create a second account when one was linked meanwhile', async () => {
    const { service, prisma } = build();
    const userCreate = jest.fn();
    Object.assign(service as unknown as Record<string, unknown>, {
      crypto: { issueOpaqueToken: jest.fn(), hashToken: jest.fn() },
      config: { value: { APP_WEB_URL: 'http://localhost:3000' } },
    });
    Object.assign(prisma, {
      teacherApplication: {
        findUnique: jest.fn(async () => ({
          id: 'a1',
          applicantName: 'Ustadha Maryam',
          email: 'maryam@example.com',
          userId: 'teacher-user',
        })),
      },
      user: { findUnique: jest.fn(), create: userCreate },
    });

    await (
      service as unknown as { createAccountForApplicant: (id: string) => Promise<void> }
    ).createAccountForApplicant('a1');
    expect(userCreate).not.toHaveBeenCalled();
  });
});

describe('TeachersService public directory: complete profiles only', () => {
  function build() {
    const prisma = {
      teacherProfile: {
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(async () => null),
      },
    };
    const service = new TeachersService(prisma as never, {} as never, {} as never, {} as never);
    return { service, prisma };
  }

  it('lists only approved, matchable teachers who finished setup, with a bio and a tier', async () => {
    const { service, prisma } = build();
    await service.listPublicProfiles({});
    const [args] = prisma.teacherProfile.findMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(args.where).toMatchObject({
      readyToMatch: true,
      hiringStatus: 'APPROVED',
      profileCompletedAt: { not: null },
      bio: { not: null },
      NOT: { bio: '' },
      tierId: { not: null },
    });
    // A photo is not required: a missing one shows initials.
    expect(args.where).not.toHaveProperty('photoUrl');
  });

  it('does not show the public page of a teacher without a bio or tier', async () => {
    const { service, prisma } = build();
    await expect(service.publicProfile('u1')).rejects.toThrow();
    const [args] = prisma.teacherProfile.findFirst.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(args.where).toMatchObject({
      userId: 'u1',
      profileCompletedAt: { not: null },
      bio: { not: null },
      tierId: { not: null },
    });
  });

  it('never hands a private storage key to families', async () => {
    const prisma = {
      teacherProfile: {
        findFirst: jest.fn(async () => ({
          id: 'p1',
          qualifications: [
            {
              type: 'CERTIFICATE',
              title: 'Ijazah',
              issuer: '',
              documentUrl:
                'teacher-profiles/0194c1d0-1111-7222-8333-444455556666/0194c1d0-1111-7222-8333-444455556667.pdf',
              verified: true,
            },
            {
              type: 'CERTIFICATE',
              title: 'Unchecked',
              issuer: 'x',
              documentUrl: 'https://a.b/c',
              verified: false,
            },
          ],
        })),
      },
    };
    const service = new TeachersService(prisma as never, {} as never, {} as never, {} as never);
    const profile = await service.publicProfile('u1');
    expect(profile.qualifications).toEqual([
      expect.objectContaining({ title: 'Ijazah', documentUrl: '' }),
    ]);
  });
});

describe('defaultTierId: new teachers start on the Standard tier', () => {
  it('returns the STANDARD tier id', async () => {
    const findUnique = jest.fn(async () => ({ id: 'tier-standard' }));
    await expect(defaultTierId({ teacherTier: { findUnique } })).resolves.toBe('tier-standard');
    expect(findUnique).toHaveBeenCalledWith({ where: { code: 'STANDARD' }, select: { id: true } });
  });

  it('returns null when there is no Standard tier or the lookup fails', async () => {
    await expect(
      defaultTierId({ teacherTier: { findUnique: jest.fn(async () => null) } }),
    ).resolves.toBeNull();
    await expect(defaultTierId({})).resolves.toBeNull();
    await expect(
      defaultTierId({
        teacherTier: { findUnique: jest.fn(async () => Promise.reject(new Error('down'))) },
      }),
    ).resolves.toBeNull();
  });
});

describe('listAssignableTeachers (medium)', () => {
  it('lists approved teachers without the public-profile or tier requirements', async () => {
    const findMany = jest.fn(async () => [
      { id: 'tp1', readyToMatch: false, tierId: null, user: { name: 'Newly Approved' } },
    ]);
    const service = new TeachersService(
      { teacherProfile: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const rows = await service.listAssignableTeachers({});
    expect(rows).toEqual([
      { id: 'tp1', name: 'Newly Approved', readyToMatch: false, tierId: null },
    ]);
    const where = (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0]
      .where;
    expect(where).toEqual({ hiringStatus: 'APPROVED' });
  });
});

describe('listApplications search and paging (medium)', () => {
  it('filters by name or email on the server and pages the board', async () => {
    const findMany = jest.fn(async () => []);
    const service = new TeachersService(
      { teacherApplication: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await service.listApplications({ q: ' aisha ', page: 3, limit: 50 });
    const args = (findMany.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(args.skip).toBe(100);
    expect(args.take).toBe(50);
    expect(JSON.stringify(args.where)).toContain('aisha');
  });

  it('keeps the old default of up to 200 rows when nothing is asked for', async () => {
    const findMany = jest.fn(async () => []);
    const service = new TeachersService(
      { teacherApplication: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await service.listApplications({});
    const args = (findMany.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(args.take).toBe(200);
    expect(args.skip).toBe(0);
  });
});

describe('listPublicProfiles paging (medium)', () => {
  it('pages the directory with a stable order instead of stopping at 100', async () => {
    const findMany = jest.fn(async () => []);
    const service = new TeachersService(
      { teacherProfile: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await service.listPublicProfiles({ page: 3 });
    const args = (findMany.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(args.skip).toBe(200);
    expect(args.take).toBe(100);
    expect(args.orderBy).toEqual([{ publicRatingAvg: 'desc' }, { id: 'asc' }]);
  });
});
