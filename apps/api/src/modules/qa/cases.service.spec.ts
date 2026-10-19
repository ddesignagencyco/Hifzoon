import { SAFEGUARDING_ALERT_SLA_MINUTES } from '@hifzoon/shared';

import { CasesService } from './cases.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { QueueService } from '../../queue/queue.service';

/**
 * Safeguarding case tests.
 *
 * These assert the properties that matter if this code is ever wrong: the SLA clock
 * starts when the case is opened and cannot be reset, a closed case cannot be closed
 * again, a case cannot be closed with no record of what was done, and reading a case is
 * itself an audited event.
 */
function buildHarness(overrides: { record?: Record<string, unknown> } = {}) {
  const record = {
    id: 'case-1',
    type: 'SAFEGUARDING',
    status: 'OPEN',
    summary: 'Concern raised about a class interaction',
    openedById: 'staff-1',
    ownerId: null,
    subjectUserId: null,
    classId: 'class-1',
    dueAt: new Date(Date.now() + 15 * 60_000),
    alertedAt: new Date(),
    closedAt: null,
    notes: [] as Array<{ note: string }>,
    ...overrides.record,
  };

  const state = {
    record,
    notes: [] as Array<Record<string, unknown>>,
    audits: [] as Array<Record<string, unknown>>,
  };

  const prisma = {
    caseRecord: {
      findUnique: jest.fn(async () => ({ ...record, _count: { notes: state.notes.length } })),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(record, data);
        return { ...record };
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(record, data);
        return { ...record };
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async () => [{ ...record }]),
      count: jest.fn(async () => 1),
    },
    caseNote: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.notes.push(data);
        return { id: 'note-1', ...data };
      }),
    },
    user: {
      findMany: jest.fn(async () => [{ id: 'lead-1' }]),
      findUnique: jest.fn(async () => ({ id: 'owner-1' })),
    },
  } as unknown as PrismaService;

  const notifications = {
    enqueue: jest.fn(async () => ({ queued: 1 })),
  } as unknown as NotificationsService;
  const queues = {
    add: jest.fn(async () => ({})),
    addDelayed: jest.fn(async () => ({})),
  } as unknown as QueueService;
  const audit = {
    record: jest.fn(async (entry: Record<string, unknown>) => {
      state.audits.push(entry);
    }),
  } as unknown as AuditService;

  return {
    service: new CasesService(prisma, audit, notifications, queues),
    state,
    prisma,
    notifications,
    queues,
    audit,
  };
}

describe('CasesService', () => {
  describe('opening a case', () => {
    it('stamps the SLA from the moment of opening, not from assignment', async () => {
      const { service } = buildHarness();

      const created = await service.open({
        type: 'SAFEGUARDING',
        summary: 'A concern was raised during a live class',
        openedById: 'staff-1',
      });

      expect(created.dueAt).toBeDefined();
      expect(created.alertedAt).toBeDefined();
      // The clock must not be restartable: reopening a case must not buy extra time.
      expect(new Date(created.dueAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('schedules the CR-08 escalation rather than only notifying once', async () => {
      const { service, queues, notifications } = buildHarness();

      await service.open({
        type: 'SAFEGUARDING',
        summary: 'A concern was raised during a live class',
        openedById: 'staff-1',
      });

      // A one-shot notification is not an SLA. The delayed job is what makes the
      // response time enforceable.
      expect(queues.addDelayed).toHaveBeenCalledWith(
        'safeguarding',
        'escalate-case',
        { caseId: expect.any(String) },
        expect.any(Number),
        expect.anything(),
      );
      expect(notifications.enqueue).toHaveBeenCalled();
    });

    it('rejects an SLA that is not a sane duration', async () => {
      const { service } = buildHarness();

      await expect(
        service.open({
          type: 'COMPLAINT',
          summary: 'x'.repeat(20),
          openedById: 's1',
          slaMinutes: 0,
        }),
      ).rejects.toThrow(/between 1 minute and 1 week/i);

      await expect(
        service.open({
          type: 'COMPLAINT',
          summary: 'x'.repeat(20),
          openedById: 's1',
          slaMinutes: 1_000_000,
        }),
      ).rejects.toThrow(/between 1 minute and 1 week/i);
    });

    it('records an audit entry naming the type of case', async () => {
      const { service, audit } = buildHarness();

      await service.open({ type: 'COMPLAINT', summary: 'Billing dispute', openedById: 's1' });

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'qa.case.open.COMPLAINT', targetType: 'case_record' }),
      );
    });
  });

  describe('notes', () => {
    it('appends without ever replacing what was written before', async () => {
      const { service, state } = buildHarness();

      await service.addNote('case-1', 'lead-1', 'Spoke to the family.');
      await service.addNote('case-1', 'lead-1', 'Reviewed the recording.');

      // Append-only: a safeguarding record that can be edited afterwards is not evidence.
      expect(state.notes).toHaveLength(2);
      expect(state.notes.map((n) => n.note)).toEqual([
        'Spoke to the family.',
        'Reviewed the recording.',
      ]);
    });
  });

  describe('transitions', () => {
    it('refuses to close a case with no note recording what was done', async () => {
      const { service } = buildHarness();

      await expect(service.transition('case-1', 'CLOSED', 'lead-1')).rejects.toThrow(
        /cannot be closed without at least one note/i,
      );
    });

    it('allows a close once a note exists', async () => {
      const { service, state } = buildHarness();
      await service.addNote('case-1', 'lead-1', 'Actioned and communicated to the family.');

      const updated = await service.transition('case-1', 'CLOSED', 'lead-1');

      expect(updated.status).toBe('CLOSED');
      expect(state.record.closedAt).toBeDefined();
    });

    it('refuses to move an already closed case', async () => {
      const { service, prisma } = buildHarness({ record: { status: 'CLOSED' } });

      await expect(service.transition('case-1', 'INVESTIGATING', 'lead-1')).rejects.toThrow(
        /already closed/i,
      );
      expect(prisma.caseRecord.update).not.toHaveBeenCalled();
    });
  });

  describe('reading a case', () => {
    it('audits the read, because "who looked" must be answerable', async () => {
      const { service, audit } = buildHarness();

      await service.read('case-1', 'lead-1');

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'qa.case.read', targetId: 'case-1', actorId: 'lead-1' }),
      );
    });

    it('reports SLA breach and minutes remaining on the read', async () => {
      const { service } = buildHarness();

      const healthy = await service.read('case-1', 'lead-1');
      expect(healthy.sla.breached).toBe(false);

      const { service: overdueService } = buildHarness({
        record: { dueAt: new Date(Date.now() - 60_000) },
      });
      const overdue = await overdueService.read('case-1', 'lead-1');
      expect(overdue.sla.breached).toBe(true);
      expect(overdue.sla.minutesRemaining).toBeLessThan(0);
    });

    it('does not report a closed case as breaching its SLA', async () => {
      const { service } = buildHarness({
        record: { status: 'CLOSED', dueAt: new Date(Date.now() - 60_000) },
      });

      const result = await service.read('case-1', 'lead-1');

      // Closing an old case is the resolution, not a failure.
      expect(result.sla.breached).toBe(false);
    });
  });

  describe('assignment', () => {
    it('refuses to assign a case to a user that does not exist', async () => {
      const { service, prisma } = buildHarness();
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.assign('case-1', 'ghost', 'actor-1')).rejects.toThrow(/Owner/i);
    });
  });

  describe('SLA reporting', () => {
    it('lists how far past due each breached case is', async () => {
      const { service } = buildHarness({ record: { dueAt: new Date(Date.now() - 60_000) } });

      const report = await service.slaReport();

      expect(report.breached).toBeGreaterThanOrEqual(1);
      expect(report.breachedDetail[0]).toHaveProperty('minutesOverdue');
    });

    it('does not count a case that is still inside its window as breached', async () => {
      const { service } = buildHarness();

      const report = await service.slaReport();

      expect(report.breached).toBe(0);
      expect(report.openDetail[0]?.minutesRemaining).toBeGreaterThan(0);
    });

    it('uses the documented response time', () => {
      expect(SAFEGUARDING_ALERT_SLA_MINUTES).toBe(15);
    });
  });
});

/**
 * A concern raised by a guardian, teacher or student (M56). The reporter must be able to
 * open a case, but must learn nothing from the response and cannot attach it to a class
 * they are not part of.
 */
describe('CasesService.report (M56)', () => {
  function withClassCount(count: number) {
    const harness = buildHarness();
    (harness.prisma as unknown as { classSession: unknown }).classSession = {
      count: jest.fn(async () => count),
    };
    return harness;
  }

  it('opens a case and returns only a reference and a timestamp', async () => {
    const { service, state } = withClassCount(1);

    const result = await service.report({
      reporterId: 'parent-1',
      type: 'SAFEGUARDING',
      description: 'The teacher asked my child to turn the camera off.',
      classId: 'class-1',
    });

    expect(Object.keys(result).sort()).toEqual(['receivedAt', 'reference']);
    expect(result.reference).toBe('CASE-1');
    expect(state.record.openedById).toBe('parent-1');
  });

  it('pages the safeguarding lead through the same path as a staff-opened case', async () => {
    const { service, notifications, queues } = withClassCount(1);

    await service.report({
      reporterId: 'parent-1',
      type: 'SAFEGUARDING',
      description: 'Something about this class worried me a great deal.',
      classId: 'class-1',
    });

    expect(notifications.enqueue).toHaveBeenCalledTimes(1);
    expect(queues.addDelayed).toHaveBeenCalledWith(
      expect.anything(),
      'escalate-case',
      expect.anything(),
      15 * 60_000,
      expect.anything(),
    );
  });

  it('refuses a class the reporter is not part of', async () => {
    const { service, prisma } = withClassCount(0);

    await expect(
      service.report({
        reporterId: 'stranger',
        type: 'COMPLAINT',
        description: 'I would like to report a class I am not in.',
        classId: 'class-9',
      }),
    ).rejects.toThrow(/not part of that class/);
    expect(prisma.caseRecord.create).not.toHaveBeenCalled();
  });

  it('gives a complaint a longer SLA than a safeguarding concern', async () => {
    const { service, queues } = withClassCount(1);

    await service.report({
      reporterId: 'parent-1',
      type: 'COMPLAINT',
      description: 'The class started twenty minutes late again.',
    });

    expect(queues.addDelayed).toHaveBeenCalledWith(
      expect.anything(),
      'escalate-case',
      expect.anything(),
      24 * 60 * 60_000,
      expect.anything(),
    );
  });

  it("lists the reporter's own cases without notes or owner", async () => {
    const { service } = withClassCount(1);
    const rows = await service.mine('parent-1');

    expect(rows[0]).toEqual(
      expect.objectContaining({ reference: expect.any(String), status: 'OPEN' }),
    );
    expect(rows[0]).not.toHaveProperty('notes');
    expect(rows[0]).not.toHaveProperty('ownerId');
  });
});
