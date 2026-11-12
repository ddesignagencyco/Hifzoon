import { CmsService } from './cms.service';

describe('CmsService — deleted posts (medium)', () => {
  it('refuses to save or republish a post that is marked deleted', async () => {
    const update = jest.fn();
    const prisma = {
      cmsPost: {
        findUnique: jest.fn(async () => ({
          id: 'p1',
          status: 'ARCHIVED',
          deletedAt: new Date(),
          publishedAt: null,
        })),
        update,
      },
    };
    const service = new CmsService(prisma as never, { record: jest.fn() } as never);

    await expect(
      service.save({
        id: 'p1',
        type: 'BLOG',
        slug: 's',
        locale: 'en',
        title: 't',
        body: 'b',
        status: 'PUBLISHED',
        actorId: 'a',
      }),
    ).rejects.toThrow(/deleted/);
    expect(update).not.toHaveBeenCalled();
  });
});
