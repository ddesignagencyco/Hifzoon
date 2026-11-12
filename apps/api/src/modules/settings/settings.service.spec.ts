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

describe('SettingsService — server-side validation (medium)', () => {
  it.each([
    ['payroll.cutoff_day', 0],
    ['payroll.cutoff_day', 31],
    ['safeguarding.alert_sla_minutes', 0],
    ['scheduling.materialise_days', 2.5],
    ['billing.invoice_due_days', -1],
  ])('refuses %s = %s', async (key, value) => {
    const { service, prisma } = build();
    await expect(service.set(key, value, 'admin-1')).rejects.toThrow(/must be a/);
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  it('refuses an empty required text and a malformed email', async () => {
    const { service } = build();
    await expect(service.set('platform.branding.name', '   ', 'a')).rejects.toThrow(/empty/);
    await expect(service.set('platform.contact.email', 'nope', 'a')).rejects.toThrow(/email/);
  });

  it('lets optional text be cleared and rejects non-boolean flags', async () => {
    const { service } = build();
    await expect(service.set('platform.contact.whatsapp', '', 'a')).resolves.toBeDefined();
    await expect(service.set('platform.trial.enabled', 'maybe', 'a')).rejects.toThrow(
      /true or false/,
    );
  });
});
