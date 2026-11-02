import { CrmService } from './crm.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

function buildHarness() {
  const leads: Array<Record<string, unknown>> = [];

  const prisma = {
    lead: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const lead = { id: `lead-${leads.length + 1}`, ...data };
        leads.push(lead);
        return lead;
      }),
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          leads.find((l) => l.id === where.id) ?? null,
      ),
      findFirst: jest.fn(
        async ({ where }: { where: { email: { equals: string } } }) =>
          leads.find(
            (l) =>
              String(l.email).toLowerCase() === where.email.equals.toLowerCase() &&
              l.status !== 'WON' &&
              l.status !== 'LOST',
          ) ?? null,
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
          Object.assign(
            leads.find((l) => l.id === where.id)!,
            data,
          ),
      ),
      groupBy: jest.fn(async ({ by, where }: { by: string[]; where?: { country?: string } }) => {
        const filtered = where?.country ? leads.filter((l) => l.country === where.country) : leads;
        const groups = new Map<
          string,
          { country: unknown; region: unknown; city: unknown; count: number }
        >();
        for (const lead of filtered) {
          const key = by.map((k) => String(lead[k])).join('|');
          const existing = groups.get(key);
          if (existing) existing.count += 1;
          else
            groups.set(key, {
              country: lead.country,
              region: lead.region,
              city: lead.city,
              count: 1,
            });
        }
        return [...groups.values()].map((g) => ({
          country: g.country,
          region: g.region,
          city: g.city,
          _count: { _all: g.count },
        }));
      }),
    },
    task: {
      create: jest.fn(async () => ({ id: 'task-1' })),
    },
    user: {
      findMany: jest.fn(async () => [
        { id: 'admin-busy', _count: { leadsOwned: 2 } },
        { id: 'admin-free', _count: { leadsOwned: 0 } },
      ]),
    },
  };

  const audit = { record: jest.fn(async () => undefined) };
  const service = new CrmService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );

  return { service, prisma, audit };
}

describe('CrmService geolocation (M-GEO-01)', () => {
  it('stores the optional geo fields on a new lead', async () => {
    const { service } = buildHarness();

    const lead = await service.createLead({
      contactName: 'Amina Yusuf',
      country: 'GB',
      region: 'Greater London',
      city: 'London',
      postcode: 'E1 6AN',
      lat: 51.515,
      lng: -0.072,
    });

    expect(lead.region).toBe('Greater London');
    expect(lead.city).toBe('London');
    expect(lead.postcode).toBe('E1 6AN');
    expect(lead.lat).toBe(51.515);
    expect(lead.lng).toBe(-0.072);
  });

  it('defaults geo fields to null when not supplied', async () => {
    const { service } = buildHarness();

    const lead = await service.createLead({ contactName: 'No Geo Lead' });

    expect(lead.region).toBeNull();
    expect(lead.city).toBeNull();
    expect(lead.postcode).toBeNull();
    expect(lead.lat).toBeNull();
    expect(lead.lng).toBeNull();
  });

  it('groups lead counts by country and region', async () => {
    const { service } = buildHarness();

    await service.createLead({ contactName: 'A', country: 'GB', region: 'Greater London' });
    await service.createLead({ contactName: 'B', country: 'GB', region: 'Greater London' });
    await service.createLead({ contactName: 'C', country: 'GB', region: 'West Midlands' });
    await service.createLead({ contactName: 'D', country: 'PK', region: 'Punjab' });

    const result = await service.leadsByArea({});

    expect(result).toEqual([
      { country: 'GB', region: 'Greater London', city: null, count: 2 },
      { country: 'GB', region: 'West Midlands', city: null, count: 1 },
      { country: 'PK', region: 'Punjab', city: null, count: 1 },
    ]);
  });

  it('filters the area roll-up by country', async () => {
    const { service } = buildHarness();

    await service.createLead({ contactName: 'A', country: 'GB', region: 'Greater London' });
    await service.createLead({ contactName: 'D', country: 'PK', region: 'Punjab' });

    const result = await service.leadsByArea({ country: 'PK' });

    expect(result).toEqual([{ country: 'PK', region: 'Punjab', city: null, count: 1 }]);
  });
});

describe('CrmService website enquiries', () => {
  it('creates a NEW website lead with a follow-up task', async () => {
    const { service, prisma } = buildHarness();
    const lead = await service.createEnquiry({
      contactName: 'Hamid Raza',
      email: 'hamid@example.test',
      courseInterest: 'HIFZ',
      timeZone: 'Asia/Karachi',
      message: 'Evenings please',
    });
    expect(lead).toMatchObject({
      status: 'NEW',
      source: 'website',
      courseInterest: 'HIFZ',
    });
    expect(String(lead.notes)).toContain('Evenings please');
    expect(prisma.task.create).toHaveBeenCalledTimes(1);
    // Shared out: the admin with the fewest open leads owns it, and its first task.
    expect(lead.ownerId).toBe('admin-free');
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assigneeId: 'admin-free' }) }),
    );
  });

  it('adds to the open lead for the same email instead of a duplicate', async () => {
    const { service, prisma } = buildHarness();
    await service.createEnquiry({ contactName: 'Hamid Raza', email: 'hamid@example.test' });
    await service.createEnquiry({
      contactName: 'Hamid Raza',
      email: 'HAMID@example.test',
      message: 'Still keen',
    });
    expect(prisma.lead.create).toHaveBeenCalledTimes(1);
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { notes: expect.stringContaining('Still keen') } }),
    );
    expect(prisma.task.create).toHaveBeenCalledTimes(2);
  });
});

describe('CrmService lead edits', () => {
  it('writes and audits only the fields that changed', async () => {
    const { service, prisma, audit } = buildHarness();
    const lead = await service.createLead({ contactName: 'Hamid', email: 'h@example.test' });
    audit.record.mockClear();

    await service.updateLead(
      lead.id,
      { contactName: 'Hamid', email: 'h@example.test', city: 'Manchester' },
      'admin-1',
    );

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: lead.id },
      data: { city: 'Manchester' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'crm.lead.update', after: { city: 'Manchester' } }),
    );
  });

  it('records nothing when nothing changed', async () => {
    const { service, prisma, audit } = buildHarness();
    const lead = await service.createLead({ contactName: 'Hamid' });
    audit.record.mockClear();

    await service.updateLead(lead.id, { contactName: 'Hamid' }, 'admin-1');

    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
