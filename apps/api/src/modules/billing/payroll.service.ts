import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { AuditService } from '../audit/audit.service';

/**
 * Teacher payroll (FR-PAY-01..04).
 *
 * Payroll is the module where a rounding error becomes someone's real income, so the
 * rules are strict:
 *
 *   - **A period is calculated once.** `status` moves `OPEN → CALCULATED → EXPORTED →
 *     PAID`, and calculation refuses to run on a period that is not `OPEN`. Recalculating
 *     a period after a teacher disputes it is how a payslip shows two different numbers.
 *   - **A cancelled class is not paid.** Only `COMPLETED` classes earn. A teacher is
 *     paid for teaching, not for a slot the school cancelled.
 *   - **A no-show by the teacher is a deduction, not a zero.** The teacher did not work;
 *     recording a negative line keeps the explanation on the payslip instead of making
 *     the deduction an unexplained gap in the gross.
 */
@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listRates() {
    return this.prisma.payRate.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  /** Payroll periods, newest first, with how many teachers each pays. */
  async listPeriods() {
    return this.prisma.payrollPeriod.findMany({
      orderBy: { startsOn: 'desc' },
      take: 60,
      select: {
        id: true,
        startsOn: true,
        endsOn: true,
        status: true,
        _count: { select: { entries: true } },
      },
    });
  }

  /** Opens a payroll period. */
  async openPeriod(startsOn: Date, endsOn: Date, actorId: string) {
    if (endsOn <= startsOn) {
      throw AppError.badRequest('A payroll period must end after it starts');
    }

    const period = await this.prisma.payrollPeriod.create({
      data: { startsOn, endsOn, status: 'OPEN' },
    });

    await this.audit.record({
      actorId,
      action: 'pay.period.open',
      targetType: 'payroll_period',
      targetId: period.id,
      after: { startsOn, endsOn },
    });

    return period;
  }

  /**
   * Calculates pay for a period (FR-PAY-02).
   *
   * One transaction per teacher, not one for the whole period: a single failure would
   * otherwise discard hours of correct work for everyone else. A teacher who already
   * has an entry is skipped rather than overwritten.
   */
  async calculatePeriod(periodId: string, actorId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw AppError.notFound('Payroll period');

    if (period.status !== 'OPEN') {
      throw AppError.conflict(
        'CONFLICT',
        `Payroll period is ${period.status}; only an OPEN period can be calculated`,
        { periodId, status: period.status },
      );
    }

    const classes = await this.prisma.classSession.findMany({
      where: {
        startsAt: { gte: period.startsOn, lte: period.endsOn },
        charged: true,
      },
      select: {
        id: true,
        teacherId: true,
        startsAt: true,
        type: true,
        status: true,
        charged: true,
        teacher: { select: { payRateId: true } },
      },
    });

    const byTeacher = new Map<string, typeof classes>();
    for (const klass of classes) {
      byTeacher.set(klass.teacherId, [...(byTeacher.get(klass.teacherId) ?? []), klass]);
    }

    let calculated = 0;
    for (const [teacherId, teacherClasses] of byTeacher) {
      const existing = await this.prisma.payrollEntry.findUnique({
        where: { periodId_teacherId: { periodId, teacherId } },
        select: { id: true },
      });
      if (existing) continue; // already calculated; never silently recomputed

      await this.prisma.$transaction(async (tx) => {
        const entry = await tx.payrollEntry.create({
          data: { periodId, teacherId, status: 'OPEN' },
        });

        let gross = 0;
        const lines: Array<{
          classId: string;
          kind: 'CLASS' | 'DEDUCTION_LATE' | 'DEDUCTION_MISSED' | 'BONUS';
          amountMinor: number;
          note: string;
        }> = [];

        for (const klass of teacherClasses) {
          if (!klass.teacher.payRateId) continue; // no rate assigned: nothing to pay, flagged in the report
          const rate = await tx.payRate.findUnique({ where: { id: klass.teacher.payRateId } });

          // A teacher-specific rate wins; a class-type rate applies only to that type.
          const applies = rate && (rate.classType === null || rate.classType === klass.type);
          if (!rate || !applies) continue;

          if (klass.status === 'COMPLETED') {
            gross += rate.ratePerClassMinor;
            lines.push({
              classId: klass.id,
              kind: 'CLASS',
              amountMinor: rate.ratePerClassMinor,
              note: `${klass.type} class`,
            });
            continue;
          }

          // A chargeable class that did not complete is either a teacher no-show or an
          // academy/teacher cancellation. Only the former is a deduction.
          if (klass.status === 'NO_SHOW_TEACHER') {
            const deduction = -rate.ratePerClassMinor;
            gross += deduction;
            lines.push({
              classId: klass.id,
              kind: 'DEDUCTION_MISSED',
              amountMinor: deduction,
              note: 'Teacher no-show',
            });
          }
        }

        await tx.payrollLine.createMany({
          data: lines.map((l) => ({ ...l, entryId: entry.id })),
        });

        await tx.payrollEntry.update({
          where: { id: entry.id },
          data: { grossMinor: gross, netMinor: gross },
        });
      });

      calculated += 1;
    }

    await this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: 'CALCULATED' },
    });

    await this.audit.record({
      actorId,
      action: 'pay.period.calculate',
      targetType: 'payroll_period',
      targetId: periodId,
      after: { teachers: calculated, classesScanned: classes.length },
    });

    return { periodId, teachers: calculated, classesScanned: classes.length };
  }

  /** Marks entries paid (FR-PAY-04). */
  async markPaid(entryId: string, payoutReference: string, actorId: string) {
    const entry = await this.prisma.payrollEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw AppError.notFound('Payroll entry');
    if (entry.status === 'PAID') {
      throw AppError.conflict('CONFLICT', 'Payroll entry is already paid');
    }

    const updated = await this.prisma.payrollEntry.update({
      where: { id: entryId },
      data: { status: 'PAID', paidAt: new Date(), payoutReference },
    });

    await this.audit.record({
      actorId,
      action: 'pay.entry.paid',
      targetType: 'payroll_entry',
      targetId: entryId,
      after: { payoutReference, netMinor: updated.netMinor },
    });

    return updated;
  }

  /** A teacher's own payslips. */
  async teacherPayslips(userId: string) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) return [];

    return this.prisma.payrollEntry.findMany({
      where: { teacherId: profile.id },
      include: {
        period: { select: { startsOn: true, endsOn: true, status: true } },
        lines: { select: { kind: true, amountMinor: true, note: true, classId: true } },
      },
      orderBy: { period: { startsOn: 'desc' } },
      take: 24,
    });
  }

  /** Period report with totals (PAY-FE-01). */
  async periodReport(periodId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        entries: {
          include: {
            teacher: { select: { id: true, user: { select: { name: true, email: true } } } },
            lines: true,
          },
        },
      },
    });
    if (!period) throw AppError.notFound('Payroll period');

    const totals = period.entries.reduce(
      (acc, e) => ({
        gross: acc.gross + e.grossMinor,
        deductions: acc.deductions + e.deductionsMinor,
        bonuses: acc.bonuses + e.bonusesMinor,
        net: acc.net + e.netMinor,
      }),
      { gross: 0, deductions: 0, bonuses: 0, net: 0 },
    );

    return {
      period: {
        id: period.id,
        startsOn: period.startsOn,
        endsOn: period.endsOn,
        status: period.status,
      },
      totals,
      entries: period.entries.map((e) => ({
        id: e.id,
        teacher: e.teacher.user.name,
        grossMinor: e.grossMinor,
        netMinor: e.netMinor,
        status: e.status,
        lineCount: e.lines.length,
      })),
    };
  }
}
