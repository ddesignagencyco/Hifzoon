import { TeachersService } from './teachers.service';

const KEY = 'recitations/2026/0194c1d0-1111-7222-8333-444455556666.webm';
const DOC = 'documents/2026/0194c1d0-1111-7222-8333-444455556666.pdf';

function build(
  opts: { exists?: boolean; courseCodes?: string[]; pending?: Record<string, unknown> } = {},
) {
  const prisma = {
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
  const service = new TeachersService(prisma as never, storage as never, notifications as never);
  return { service, prisma, storage, notifications };
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
