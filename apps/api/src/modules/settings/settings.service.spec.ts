import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { SettingsService } from './settings.service';

function build() {
  const prisma = {
    appSetting: {
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      upsert: jest.fn(async ({ create }: { create: { key: string; value: unknown } }) => create),
    },
  };
  const db = Object.assign(prisma, {
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(prisma)),
  });
  const service = new SettingsService(
    db as unknown as PrismaService,
    { record: jest.fn() } as unknown as AuditService,
  );
  return { service, prisma };
}

describe('SettingsService — sibling discount', () => {
  it('defaults to no sibling discount', async () => {
    const { service } = build();
    await expect(service.getNumber('billing.sibling_discount_percent')).resolves.toBe(0);
  });

  it('accepts a whole percentage from 0 to 50', async () => {
    const { service } = build();
    await expect(
      service.setMany({ 'billing.sibling_discount_percent': 50 }, 'admin-1'),
    ).resolves.toEqual({ 'billing.sibling_discount_percent': 50 });
  });

  it('refuses more than 50 or a fraction, before writing anything', async () => {
    const { service, prisma } = build();
    await expect(
      service.setMany({ 'billing.sibling_discount_percent': 500 }, 'admin-1'),
    ).rejects.toThrow(/0 to 50/);
    await expect(service.set('billing.sibling_discount_percent', 12.5, 'admin-1')).rejects.toThrow(
      /whole number/,
    );
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });
});
