import { Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface FamilyPatch {
  name?: string;
  country?: string | null;
  timeZone?: string;
  billingName?: string | null;
}

export interface StudentPatch {
  displayName?: string;
  birthYear?: number;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  language?: string;
  timeZone?: string;
  kidsMode?: boolean;
  notes?: string | null;
  mushafLayout?: 'MADANI_15' | 'INDOPAK_13' | 'INDOPAK_16';
}

function assertTimeZone(zone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
  } catch {
    throw AppError.badRequest('Unknown time zone', { field: 'timeZone' });
  }
}

/**
 * Staff view and edit of a family and its children (FR-OPS). One read returns everything an
 * administrator needs to answer a call: who the guardians are, what each child studies and
 * with whom, what the family pays, and what is owed. Safeguarding cases are never part of
 * it; they have their own access rules.
 */
@Injectable()
export class AdminFamiliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getFamily(familyId: string) {
    const family = await this.prisma.family.findFirst({
      where: { id: familyId },
      select: {
        id: true,
        name: true,
        country: true,
        currency: true,
        timeZone: true,
        billingName: true,
        createdAt: true,
        deletedAt: true,
        members: {
          select: {
            id: true,
            relationship: true,
            isPrimary: true,
            verifiedAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                status: true,
                lastActiveAt: true,
              },
            },
          },
        },
        students: {
          where: { deletedAt: null },
          orderBy: { displayName: 'asc' },
          select: {
            id: true,
            displayName: true,
            birthYear: true,
            gender: true,
            language: true,
            kidsMode: true,
            enrolments: {
              select: {
                id: true,
                status: true,
                course: { select: { name: true } },
                teacher: { select: { id: true, user: { select: { name: true } } } },
              },
            },
          },
        },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: true,
            amountMinor: true,
            currency: true,
            plan: { select: { name: true } },
          },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            number: true,
            status: true,
            totalMinor: true,
            currency: true,
            dueAt: true,
          },
        },
      },
    });
    if (!family) throw AppError.notFound('Family');

    const [credits, makeups, openRequests, outstanding] = await Promise.all([
      this.prisma.classCredit.aggregate({ where: { familyId }, _sum: { amountClasses: true } }),
      this.prisma.makeupCredit.count({ where: { familyId, status: 'AVAILABLE' } }),
      this.prisma.dataRequest.count({
        where: { familyId, status: { in: ['REQUESTED', 'IN_PROGRESS'] } },
      }),
      this.prisma.invoice.aggregate({
        where: { familyId, status: 'OPEN' },
        _sum: { totalMinor: true },
        _count: true,
      }),
    ]);

    return {
      ...family,
      balances: {
        classCredits: credits._sum.amountClasses ?? 0,
        availableMakeupCredits: makeups,
        openInvoices: outstanding._count,
        openInvoicesMinor: outstanding._sum.totalMinor ?? 0,
        openDataRequests: openRequests,
      },
    };
  }

  async updateFamily(familyId: string, patch: FamilyPatch, actorId: string) {
    const current = await this.prisma.family.findUnique({ where: { id: familyId } });
    if (!current) throw AppError.notFound('Family');
    if (patch.name !== undefined && patch.name.trim().length < 2) {
      throw AppError.badRequest('A family needs a name', { field: 'name' });
    }
    if (patch.country != null && !/^[A-Za-z]{2}$/.test(patch.country)) {
      throw AppError.badRequest('Country is a 2-letter code', { field: 'country' });
    }
    if (patch.timeZone !== undefined) assertTimeZone(patch.timeZone);

    const data = {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.country !== undefined ? { country: patch.country?.toUpperCase() ?? null } : {}),
      ...(patch.timeZone !== undefined ? { timeZone: patch.timeZone } : {}),
      ...(patch.billingName !== undefined
        ? { billingName: patch.billingName?.trim() || null }
        : {}),
    };
    const updated = await this.prisma.family.update({ where: { id: familyId }, data });
    await this.audit.record({
      actorId,
      action: 'ops.family.update',
      targetType: 'family',
      targetId: familyId,
      before: {
        name: current.name,
        country: current.country,
        timeZone: current.timeZone,
        billingName: current.billingName,
      },
      after: data,
    });
    return updated;
  }

  async getStudent(studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId },
      select: {
        id: true,
        displayName: true,
        birthYear: true,
        gender: true,
        language: true,
        timeZone: true,
        kidsMode: true,
        notes: true,
        mushafLayout: true,
        createdAt: true,
        deletedAt: true,
        family: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
        enrolments: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            startedAt: true,
            currentLessonPosition: true,
            course: { select: { id: true, name: true } },
            currentLevel: { select: { name: true } },
            teacher: { select: { id: true, user: { select: { name: true } } } },
          },
        },
      },
    });
    if (!student) throw AppError.notFound('Student');

    const [recent, byStatus] = await Promise.all([
      this.prisma.classSession.findMany({
        where: { students: { some: { studentId } } },
        orderBy: { startsAt: 'desc' },
        take: 10,
        select: {
          id: true,
          startsAt: true,
          status: true,
          type: true,
          course: { select: { name: true } },
          teacher: { select: { user: { select: { name: true } } } },
        },
      }),
      this.prisma.classSession.groupBy({
        by: ['status'],
        where: { students: { some: { studentId } } },
        _count: { _all: true },
      }),
    ]);

    return {
      ...student,
      recentClasses: recent,
      classCounts: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
    };
  }

  async updateStudent(studentId: string, patch: StudentPatch, actorId: string) {
    const current = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!current) throw AppError.notFound('Student');

    if (patch.displayName !== undefined && patch.displayName.trim().length < 1) {
      throw AppError.badRequest('A child needs a name', { field: 'displayName' });
    }
    const thisYear = new Date().getUTCFullYear();
    if (
      patch.birthYear !== undefined &&
      (patch.birthYear < thisYear - 90 || patch.birthYear > thisYear)
    ) {
      throw AppError.badRequest('Birth year is not plausible', { field: 'birthYear' });
    }
    if (patch.timeZone !== undefined) assertTimeZone(patch.timeZone);

    const data = {
      ...(patch.displayName !== undefined ? { displayName: patch.displayName.trim() } : {}),
      ...(patch.birthYear !== undefined ? { birthYear: patch.birthYear } : {}),
      ...(patch.gender !== undefined ? { gender: patch.gender } : {}),
      ...(patch.language !== undefined ? { language: patch.language } : {}),
      ...(patch.timeZone !== undefined ? { timeZone: patch.timeZone } : {}),
      ...(patch.kidsMode !== undefined ? { kidsMode: patch.kidsMode } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
      ...(patch.mushafLayout !== undefined ? { mushafLayout: patch.mushafLayout } : {}),
    };
    const updated = await this.prisma.student.update({ where: { id: studentId }, data });
    await this.audit.record({
      actorId,
      action: 'ops.student.update',
      targetType: 'student',
      targetId: studentId,
      before: {
        displayName: current.displayName,
        birthYear: current.birthYear,
        gender: current.gender,
        language: current.language,
        mushafLayout: current.mushafLayout,
      },
      // The notes text is not copied into the log; only that it changed.
      after: { ...data, ...(patch.notes !== undefined ? { notes: '[changed]' } : {}) },
    });
    return updated;
  }
}
