import { TeachersService } from './teachers.service';

const KEY = 'recitations/2026/0194c1d0-1111-7222-8333-444455556666.webm';
const DOC = 'documents/2026/0194c1d0-1111-7222-8333-444455556666.pdf';

function build(opts: { exists?: boolean; courseCodes?: string[] } = {}) {
  const prisma = {
    teacherProfile: {
      findUnique: jest.fn(async () => ({ id: 'p1', pendingProfileChanges: null })),
      update: jest.fn(async ({ data }: { data: unknown }) => data),
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
  const service = new TeachersService(prisma as never, storage as never);
  return { service, prisma, storage };
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
