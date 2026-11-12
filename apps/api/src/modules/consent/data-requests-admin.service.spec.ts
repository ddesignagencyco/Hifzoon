import { DataRequestsAdminService } from './data-requests-admin.service';

describe('DataRequestsAdminService.list search (medium)', () => {
  it('searches family and child names on the server and pages', async () => {
    const findMany = jest.fn(async () => []);
    const service = new DataRequestsAdminService(
      { dataRequest: { findMany } } as never,
      {} as never,
      {} as never,
    );
    await service.list({ q: 'khan', page: 2, limit: 25 });
    const args = (findMany.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(args.skip).toBe(25);
    expect(args.take).toBe(25);
    expect(JSON.stringify(args.where)).toContain('khan');
  });
});
