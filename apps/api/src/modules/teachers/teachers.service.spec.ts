import { TeachersService, assertStepOrder } from './teachers.service';

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
      })),
    },
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
