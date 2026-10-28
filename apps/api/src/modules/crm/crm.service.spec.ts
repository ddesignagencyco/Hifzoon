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
      groupBy: jest.fn(async ({ by, where }: { by: string[]; where?: { country?: string } }) => {
        const filtered = where?.country ? leads.filter((l) => l.country === where.country) : leads;
        const groups = new Map<string, { country: unknown; region: unknown; count: number }>();
        for (const lead of filtered) {
          const key = by.map((k) => String(lead[k])).join('|');
          const existing = groups.get(key);
          if (existing) existing.count += 1;
          else groups.set(key, { country: lead.country, region: lead.region, count: 1 });
        }
        return [...groups.values()].map((g) => ({
          country: g.country,
          region: g.region,
          _count: { _all: g.count },
        }));
      }),
    },
    task: {
      create: jest.fn(async () => ({ id: 'task-1' })),
    },
  };

  const service = new CrmService(
    prisma as unknown as PrismaService,
    { record: jest.fn(async () => undefined) } as unknown as AuditService,
  );

  return { service, prisma };
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
      { country: 'GB', region: 'Greater London', count: 2 },
      { country: 'GB', region: 'West Midlands', count: 1 },
      { country: 'PK', region: 'Punjab', count: 1 },
    ]);
  });

  it('filters the area roll-up by country', async () => {
    const { service } = buildHarness();

    await service.createLead({ contactName: 'A', country: 'GB', region: 'Greater London' });
    await service.createLead({ contactName: 'D', country: 'PK', region: 'Punjab' });

    const result = await service.leadsByArea({ country: 'PK' });

    expect(result).toEqual([{ country: 'PK', region: 'Punjab', count: 1 }]);
  });
});
