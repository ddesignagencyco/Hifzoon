import { ErrorCode, Role } from '@hifzoon/shared';

import { ProfileCompleteGuard } from './profile-complete.guard';
import {
  TeacherOnboardingService,
  assertOnboardingBio,
  assertOnboardingUpload,
  isOnboardingExempt,
} from './teacher-onboarding.service';

const PROFILE = '0194c1d0-1111-7222-8333-444455556666';
const OTHER = '0194c1d0-9999-7222-8333-444455556666';
const key = (profileId: string, ext: string) =>
  `teacher-profiles/${profileId}/0194c1d0-aaaa-7222-8333-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}.${ext}`;
const BIO = 'Assalamu alaikum. '.padEnd(120, 'I teach Quran with patience and care. ');

function build(opts: { completedAt?: Date | null; exists?: boolean; hiringDocs?: unknown[] } = {}) {
  const profile = {
    id: PROFILE,
    bio: null,
    photoUrl: null,
    introVideoUrl: null,
    recitationSampleUrl: null,
    qualifications: [],
    profileCompletedAt: opts.completedAt ?? null,
    languages: ['en'],
    subjects: ['HIFZ'],
    ageGroups: ['6-9'],
    gender: 'MALE',
    user: { name: 'Ustadh Test' },
  };
  const prisma = {
    teacherProfile: {
      findUnique: jest.fn(async () => profile),
      findFirst: jest.fn(async () => null as unknown),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(profile, data);
        return profile;
      }),
    },
    applicationDocument: { findMany: jest.fn(async () => opts.hiringDocs ?? []) },
    user: { findMany: jest.fn(async () => [{ id: 'admin-1' }]) },
  };
  const storage = {
    buildKey: (...parts: string[]) => parts.join('/'),
    signedUploadUrl: jest.fn(async () => 'https://storage/put'),
    signedDownloadUrl: jest.fn(async () => 'https://storage/get'),
    objectExists: jest.fn(async () => opts.exists ?? true),
    signedUploadTtlSeconds: 900,
  };
  const notifications = { enqueue: jest.fn(async () => ({ queued: 1 })) };
  const config = { value: { API_PREFIX: 'api/v1' } };
  const service = new TeacherOnboardingService(
    prisma as never,
    storage as never,
    notifications as never,
    config as never,
  );
  return { service, prisma, storage, notifications, profile };
}

const teacher = { id: 'teacher-user', roles: [Role.TEACHER] };

describe('assertOnboardingBio', () => {
  it('requires 80-1500 characters after trimming', () => {
    expect(() => assertOnboardingBio('too short')).toThrow(/80-1500/);
    expect(() => assertOnboardingBio(`   ${'a'.repeat(79)}   `)).toThrow();
    expect(() => assertOnboardingBio('a'.repeat(1501))).toThrow();
    expect(assertOnboardingBio(`  ${'a'.repeat(80)}  `)).toBe('a'.repeat(80));
    expect(() => assertOnboardingBio(undefined)).toThrow();
  });
});

describe('assertOnboardingUpload', () => {
  it('accepts a photo, certificate or media of the right type and size', () => {
    expect(assertOnboardingUpload('photo', 'image/png', 1000)).toMatchObject({ extension: 'png' });
    expect(assertOnboardingUpload('photo', 'image/webp; q=1', 1000)).toMatchObject({
      contentType: 'image/webp',
    });
    expect(
      assertOnboardingUpload('certificate', 'application/pdf', 10 * 1024 * 1024),
    ).toMatchObject({
      extension: 'pdf',
    });
    expect(assertOnboardingUpload('media', 'video/mp4', 50 * 1024 * 1024)).toMatchObject({
      extension: 'mp4',
    });
  });

  it('refuses an unknown kind, a wrong type, or a file over the limit', () => {
    expect(() => assertOnboardingUpload('avatar', 'image/png', 10)).toThrow(/kind/);
    expect(() => assertOnboardingUpload('photo', 'application/pdf', 10)).toThrow(/not accepted/);
    expect(() => assertOnboardingUpload('photo', 'image/gif', 10)).toThrow();
    expect(() => assertOnboardingUpload('photo', 'image/png', 5 * 1024 * 1024 + 1)).toThrow(/5 MB/);
    expect(() => assertOnboardingUpload('certificate', 'image/png', 10 * 1024 * 1024 + 1)).toThrow(
      /10 MB/,
    );
    expect(() => assertOnboardingUpload('media', 'audio/mpeg', 50 * 1024 * 1024 + 1)).toThrow(
      /50 MB/,
    );
    expect(() => assertOnboardingUpload('photo', 'image/png', 0)).toThrow();
  });
});

describe('TeacherOnboardingService', () => {
  it('presigns uploads under the caller’s own profile prefix', async () => {
    const { service, storage } = build();
    const result = await service.presignUpload('teacher-user', {
      kind: 'photo',
      contentType: 'image/jpeg',
      size: 2048,
    });
    expect(result.key).toMatch(new RegExp(`^teacher-profiles/${PROFILE}/[0-9a-f-]{36}\\.jpg$`));
    expect(result.uploadUrl).toBe('https://storage/put');
    expect(storage.signedUploadUrl).toHaveBeenCalledWith(result.key, 'image/jpeg', 2048);
  });

  it('reports the bio as missing and staff as exempt', async () => {
    const { service } = build();
    const status = await service.status(teacher);
    expect(status).toMatchObject({ required: true, complete: false, missing: ['bio'] });
    const staff = await service.status({ id: 'x', roles: [Role.TEACHER, Role.ADMIN] });
    expect(staff.required).toBe(false);
  });

  it('refuses a submission without a valid bio', async () => {
    const { service, prisma } = build();
    await expect(service.submit(teacher, { bio: 'short' })).rejects.toThrow(/bio/i);
    expect(prisma.teacherProfile.update).not.toHaveBeenCalled();
  });

  it('completes with only a bio: photo, media and certificates are optional', async () => {
    const { service, prisma, notifications } = build();
    const status = await service.submit(teacher, { bio: BIO });
    const [args] = prisma.teacherProfile.update.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ];
    expect(args.data.bio).toBe(BIO.trim());
    expect(args.data.profileCompletedAt).toBeInstanceOf(Date);
    expect(args.data).not.toHaveProperty('photoUrl');
    expect(status.complete).toBe(true);
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'teacher.profile.completed' }),
    );
  });

  it('stores an uploaded photo and media as stable API paths and certificates as shown', async () => {
    const { service, prisma } = build();
    const photoKey = key(PROFILE, 'png');
    const videoKey = key(PROFILE, 'mp4');
    const certKey = key(PROFILE, 'pdf');
    await service.submit(teacher, {
      bio: BIO,
      photoKey,
      introVideoKey: videoKey,
      certificates: [{ key: certKey, title: 'Ijazah in Hafs', year: 2015 }],
    });
    const [args] = prisma.teacherProfile.update.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ];
    expect(args.data.photoUrl).toBe(`/api/v1/teachers/files/${PROFILE}/${photoKey.split('/')[2]}`);
    expect(args.data.introVideoUrl).toBe(
      `/api/v1/teachers/files/${PROFILE}/${videoKey.split('/')[2]}`,
    );
    expect(args.data.qualifications).toEqual([
      expect.objectContaining({
        title: 'Ijazah in Hafs',
        documentUrl: certKey,
        verified: true,
        year: 2015,
        source: 'ONBOARDING',
      }),
    ]);
  });

  it('copies certificates verified in hiring onto the profile', async () => {
    const doc = 'documents/2026/0194c1d0-1111-7222-8333-444455556666.pdf';
    const { service, prisma } = build({
      hiringDocs: [{ fileUrl: doc, approvedById: 'admin-1', reviewedAt: new Date() }],
    });
    await service.submit(teacher, { bio: BIO });
    const [args] = prisma.teacherProfile.update.mock.calls[0] as unknown as [
      { data: { qualifications: Array<Record<string, unknown>> } },
    ];
    expect(args.data.qualifications).toEqual([
      expect.objectContaining({ documentUrl: doc, verified: true, source: 'HIRING' }),
    ]);
    expect(prisma.applicationDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'CERTIFICATE', verified: true }),
      }),
    );
  });

  it('refuses a key from another profile, of the wrong kind, or never uploaded', async () => {
    await expect(
      build().service.submit(teacher, { bio: BIO, photoKey: key(OTHER, 'png') }),
    ).rejects.toThrow(/not a valid upload/);
    await expect(
      build().service.submit(teacher, { bio: BIO, photoKey: key(PROFILE, 'pdf') }),
    ).rejects.toThrow(/not a valid upload/);
    await expect(
      build().service.submit(teacher, { bio: BIO, photoKey: 'https://example.com/me.jpg' }),
    ).rejects.toThrow(/not a valid upload/);
    await expect(
      build({ exists: false }).service.submit(teacher, { bio: BIO, photoKey: key(PROFILE, 'png') }),
    ).rejects.toThrow(/not uploaded/);
  });

  it('is done once: a second submission is refused', async () => {
    const { service } = build({ completedAt: new Date() });
    await expect(service.submit(teacher, { bio: BIO })).rejects.toThrow(/already complete/);
  });

  it('serves only a file the profile currently shows', async () => {
    const { service, prisma } = build();
    const file = key(PROFILE, 'png').split('/')[2];
    await expect(service.publicFileUrl(PROFILE, file)).rejects.toThrow(/not found/i);
    prisma.teacherProfile.findFirst.mockResolvedValueOnce({ id: PROFILE });
    await expect(service.publicFileUrl(PROFILE, file)).resolves.toBe('https://storage/get');
    await expect(service.publicFileUrl(PROFILE, '../etc/passwd')).rejects.toThrow(/not found/i);
  });
});

describe('ProfileCompleteGuard', () => {
  const context = (user: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;

  beforeEach(() => ProfileCompleteGuard.reset());

  it('refuses a teacher who has not finished setup with 403 PROFILE_INCOMPLETE', async () => {
    const prisma = {
      teacherProfile: { findUnique: jest.fn(async () => ({ profileCompletedAt: null })) },
    };
    const guard = new ProfileCompleteGuard(prisma as never);
    await expect(
      guard.canActivate(context({ id: 'u1', roles: [Role.TEACHER] })),
    ).rejects.toMatchObject({ code: ErrorCode.PROFILE_INCOMPLETE, status: 403 });
  });

  it('lets a completed teacher through and remembers it', async () => {
    const prisma = {
      teacherProfile: { findUnique: jest.fn(async () => ({ profileCompletedAt: new Date() })) },
    };
    const guard = new ProfileCompleteGuard(prisma as never);
    const user = { id: 'u2', roles: [Role.TEACHER] };
    await expect(guard.canActivate(context(user))).resolves.toBe(true);
    await expect(guard.canActivate(context(user))).resolves.toBe(true);
    expect(prisma.teacherProfile.findUnique).toHaveBeenCalledTimes(1);
  });

  it('never blocks staff who also hold TEACHER, or non-teachers', async () => {
    const prisma = { teacherProfile: { findUnique: jest.fn() } };
    const guard = new ProfileCompleteGuard(prisma as never);
    await expect(
      guard.canActivate(context({ id: 'a', roles: [Role.TEACHER, Role.ADMIN] })),
    ).resolves.toBe(true);
    await expect(guard.canActivate(context({ id: 'g', roles: [Role.GUARDIAN] }))).resolves.toBe(
      true,
    );
    expect(prisma.teacherProfile.findUnique).not.toHaveBeenCalled();
    expect(isOnboardingExempt([Role.TEACHER, Role.SUPERVISOR])).toBe(true);
    expect(isOnboardingExempt([Role.TEACHER])).toBe(false);
  });
});
