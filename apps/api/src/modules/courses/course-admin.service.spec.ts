import { CourseAdminService } from './course-admin.service';
import { CourseMaterialsService, filesOf } from './course-materials.service';

describe('CourseAdminService', () => {
  function build(course: Record<string, unknown> | null, live = 0) {
    const prisma = {
      course: {
        findUnique: jest.fn(async () => course),
        update: jest.fn(async ({ data }: any) => ({ ...course, ...data })),
      },
      enrolment: { count: jest.fn(async () => live) },
    };
    const audit = { record: jest.fn() };
    return { svc: new CourseAdminService(prisma as never, audit as never), prisma, audit };
  }
  const course = { id: 'c', name: 'Hifz', locale: 'en', active: true, deletedAt: null };

  it('edits only the allowed fields and audits', async () => {
    const { svc, prisma, audit } = build(course);
    await svc.update('c', { name: '  Hifz Program ' }, 'admin');
    expect(prisma.course.update).toHaveBeenCalledWith({
      where: { id: 'c' },
      data: { name: 'Hifz Program' },
    });
    expect(audit.record).toHaveBeenCalled();
  });

  it('rejects empty names and editing an archived course', async () => {
    await expect(build(course).svc.update('c', { name: ' ' }, 'a')).rejects.toThrow(/name/);
    await expect(
      build({ ...course, deletedAt: new Date() }).svc.update('c', { name: 'Okay' }, 'a'),
    ).rejects.toThrow(/Restore/);
  });

  it('will not archive a course children are still enrolled on', async () => {
    const { svc, prisma } = build(course, 3);
    await expect(svc.archive('c', 'a')).rejects.toThrow(/3 child/);
    expect(prisma.course.update).not.toHaveBeenCalled();
  });

  it('archives an empty course (switched off) and restores it switched off', async () => {
    const { svc, prisma } = build(course, 0);
    await svc.archive('c', 'a');
    const data = prisma.course.update.mock.calls[0]?.[0].data;
    expect(data.active).toBe(false);
    expect(data.deletedAt).toBeInstanceOf(Date);

    const archived = build({ ...course, deletedAt: new Date(), active: false });
    await archived.svc.restore('c', 'a');
    expect(archived.prisma.course.update).toHaveBeenCalledWith({
      where: { id: 'c' },
      data: { deletedAt: null, active: false },
    });
    await expect(build(course).svc.restore('c', 'a')).rejects.toThrow(/not archived/);
  });

  it('deactivating a course that is already off does nothing', async () => {
    const { svc, prisma } = build({ ...course, active: false });
    await svc.setActive('c', false, 'a');
    expect(prisma.course.update).not.toHaveBeenCalled();
  });
});

describe('CourseMaterialsService', () => {
  function build(files: unknown = [], exists = true) {
    const prisma = {
      lessonTemplate: {
        findUnique: jest.fn(async () => ({ id: 'L1', files })),
        update: jest.fn(),
      },
    };
    const storage = {
      buildKey: (...p: string[]) => p.filter(Boolean).join('/'),
      signedUploadUrl: jest.fn(async () => 'https://put'),
      signedUploadTtlSeconds: 900,
      objectExists: jest.fn(async () => exists),
      remove: jest.fn(async () => undefined),
      signedDownloadUrl: jest.fn(async (k: string) => `https://get/${k}`),
    };
    const audit = { record: jest.fn() };
    return {
      svc: new CourseMaterialsService(prisma as never, storage as never, audit as never),
      prisma,
      storage,
    };
  }

  it('presigns only accepted types within their size limit', async () => {
    const { svc } = build();
    const ok = await svc.presign('L1', { contentType: 'application/pdf', size: 1000 });
    expect(ok.key).toMatch(/^course-materials\/L1\/.+\.pdf$/);
    await expect(svc.presign('L1', { contentType: 'application/zip', size: 10 })).rejects.toThrow(
      /not accepted/,
    );
    await expect(
      svc.presign('L1', { contentType: 'image/png', size: 11 * 1024 * 1024 }),
    ).rejects.toThrow(/at most 10 MB/);
  });

  it("won't attach a key from another lesson, or a file that was never uploaded", async () => {
    await expect(
      build().svc.attach(
        'L1',
        { key: 'course-materials/OTHER/x.pdf', name: 'n', contentType: 'application/pdf', size: 5 },
        'a',
      ),
    ).rejects.toThrow(/not an upload key/);
    await expect(
      build([], false).svc.attach(
        'L1',
        { key: 'course-materials/L1/x.pdf', name: 'n', contentType: 'application/pdf', size: 5 },
        'a',
      ),
    ).rejects.toThrow(/not uploaded/);
    await expect(
      build().svc.attach(
        'L1',
        { key: 'documents/2026/secret.pdf', name: 'n', contentType: 'application/pdf', size: 5 },
        'a',
      ),
    ).rejects.toThrow(/not an upload key/);
  });

  it('attaches a file and strips path characters from its name', async () => {
    const { svc, prisma } = build();
    const file = await svc.attach(
      'L1',
      {
        key: 'course-materials/L1/abc.pdf',
        name: '../../etc/pass.pdf',
        contentType: 'application/pdf',
        size: 5,
      },
      'a',
    );
    expect(file.name).not.toMatch(/[\\/]/);
    expect(prisma.lessonTemplate.update).toHaveBeenCalled();
  });

  it('removes the record and the stored object', async () => {
    const f = {
      id: 'f1',
      key: 'course-materials/L1/a.pdf',
      name: 'a',
      contentType: 'application/pdf',
      size: 1,
      uploadedAt: '',
    };
    const { svc, prisma, storage } = build([f]);
    await svc.remove('L1', 'f1', 'a');
    expect(prisma.lessonTemplate.update).toHaveBeenCalledWith({
      where: { id: 'L1' },
      data: { files: [] },
    });
    expect(storage.remove).toHaveBeenCalledWith(f.key);
    await expect(build([]).svc.remove('L1', 'nope', 'a')).rejects.toThrow(/File/);
  });

  it('hands out links, not keys', async () => {
    const f = {
      id: 'f1',
      key: 'course-materials/L1/a.pdf',
      name: 'a',
      contentType: 'application/pdf',
      size: 1,
      uploadedAt: '',
    };
    const { svc } = build([f]);
    const out = await svc.filesWithLinks([f]);
    expect(out[0]).toEqual({
      id: 'f1',
      name: 'a',
      contentType: 'application/pdf',
      size: 1,
      url: 'https://get/course-materials/L1/a.pdf',
    });
    expect('key' in (out[0] as object)).toBe(false);
    expect(filesOf('junk')).toEqual([]);
  });
});
