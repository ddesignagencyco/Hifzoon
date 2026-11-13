import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { Prisma, type ClassType, type Currency } from '@prisma/client';

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

  async listRates(opts: { includeInactive?: boolean } = {}) {
    return this.prisma.payRate.findMany({
      where: opts.includeInactive ? {} : { active: true },
      include: { _count: { select: { teachers: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  /** Creates a pay rate (FR-PAY-01). A rate applies from `effectiveFrom`; amounts are minor units. */
  async createRate(
    input: {
      name: string;
      currency: Currency;
      ratePerClassMinor: number;
      classType?: ClassType | null;
      effectiveFrom: Date;
    },
    actorId: string,
  ) {
    const name = input.name.trim();
    if (!name) throw AppError.badRequest('A pay rate needs a name');
    if (!Number.isInteger(input.ratePerClassMinor) || input.ratePerClassMinor <= 0) {
      throw AppError.badRequest('The rate per class is a whole number of minor units above zero');
    }
    const rate = await this.prisma.payRate.create({
      data: {
        name,
        currency: input.currency,
        ratePerClassMinor: input.ratePerClassMinor,
        classType: input.classType ?? null,
        effectiveFrom: input.effectiveFrom,
      },
    });
    await this.audit.record({
      actorId,
      action: 'pay.rate.create',
      targetType: 'pay_rate',
      targetId: rate.id,
      after: { name, currency: rate.currency, ratePerClassMinor: rate.ratePerClassMinor },
    });
    return rate;
  }

  /**
   * Edits a rate. Periods already calculated keep what they were paid (they are never
   * recalculated); the new amount applies to periods calculated from now on.
   */
  async updateRate(
    id: string,
    patch: {
      name?: string;
      ratePerClassMinor?: number;
      classType?: ClassType | null;
      effectiveFrom?: Date;
    },
    actorId: string,
  ) {
    const current = await this.prisma.payRate.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('Pay rate');
    if (
      patch.ratePerClassMinor !== undefined &&
      (!Number.isInteger(patch.ratePerClassMinor) || patch.ratePerClassMinor <= 0)
    ) {
      throw AppError.badRequest('The rate per class is a whole number of minor units above zero');
    }
    if (patch.name !== undefined && !patch.name.trim()) {
      throw AppError.badRequest('A pay rate needs a name');
    }
    const updated = await this.prisma.payRate.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.ratePerClassMinor !== undefined
          ? { ratePerClassMinor: patch.ratePerClassMinor }
          : {}),
        ...(patch.classType !== undefined ? { classType: patch.classType } : {}),
        ...(patch.effectiveFrom !== undefined ? { effectiveFrom: patch.effectiveFrom } : {}),
      },
    });
    await this.audit.record({
      actorId,
      action: 'pay.rate.update',
      targetType: 'pay_rate',
      targetId: id,
      before: {
        name: current.name,
        ratePerClassMinor: current.ratePerClassMinor,
        classType: current.classType,
      },
      after: patch,
    });
    return updated;
  }

  /** Switches a rate on or off. A rate teachers are still on cannot be switched off. */
  async setRateActive(id: string, active: boolean, actorId: string) {
    const current = await this.prisma.payRate.findUnique({
      where: { id },
      include: { _count: { select: { teachers: true } } },
    });
    if (!current) throw AppError.notFound('Pay rate');
    if (!active && current._count.teachers > 0) {
      throw AppError.conflict(
        'CONFLICT',
        `${current._count.teachers} teacher(s) are still on this rate; move them to another rate first`,
        { teachers: current._count.teachers },
      );
    }
    const updated = await this.prisma.payRate.update({ where: { id }, data: { active } });
    await this.audit.record({
      actorId,
      action: active ? 'pay.rate.activate' : 'pay.rate.deactivate',
      targetType: 'pay_rate',
      targetId: id,
      before: { active: current.active },
      after: { active },
    });
    return updated;
  }

  /** Puts a teacher on a rate, or takes them off one (rateId null). Only an active rate. */
  async assignRate(teacherProfileId: string, rateId: string | null, actorId: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherProfileId },
      select: { id: true, payRateId: true },
    });
    if (!teacher) throw AppError.notFound('Teacher');
    if (rateId) {
      const rate = await this.prisma.payRate.findUnique({ where: { id: rateId } });
      if (!rate) throw AppError.notFound('Pay rate');
      if (!rate.active) throw AppError.conflict('CONFLICT', 'That pay rate is switched off');
    }
    const updated = await this.prisma.teacherProfile.update({
      where: { id: teacherProfileId },
      data: { payRateId: rateId },
      select: { id: true, payRateId: true },
    });
    await this.audit.record({
      actorId,
      action: 'pay.rate.assign',
      targetType: 'teacher_profile',
      targetId: teacherProfileId,
      before: { payRateId: teacher.payRateId },
      after: { payRateId: rateId },
    });
    return updated;
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
    // The end date is inclusive, so a one-day period (start === end) is valid.
    if (endsOn < startsOn) {
      throw AppError.badRequest('A payroll period cannot end before it starts');
    }

    const overlapping = await this.prisma.payrollPeriod.findFirst({
      where: { startsOn: { lte: endsOn }, endsOn: { gte: startsOn } },
      select: { id: true, startsOn: true, endsOn: true },
    });
    if (overlapping) {
      throw AppError.conflict('CONFLICT', 'Payroll period overlaps an existing period', {
        overlappingPeriodId: overlapping.id,
      });
    }

    let period;
    try {
      period = await this.prisma.payrollPeriod.create({
        data: { startsOn, endsOn, status: 'OPEN' },
      });
    } catch (error) {
      // Race backstop: the `payroll_period_no_overlap` exclusion constraint rejects an
      // overlap that slipped past the check above (two periods opened at once). Surface
      // the same conflict instead of a raw database error.
      if (isNoOverlapViolation(error)) {
        throw AppError.conflict('CONFLICT', 'Payroll period overlaps an existing period');
      }
      throw error;
    }

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

    // PayrollPeriod dates are date-only (midnight), and the end date is inclusive: classes
    // anywhere on the last day belong to the period, so the upper bound is the next midnight.
    const endExclusive = new Date(period.endsOn.getTime() + 24 * 60 * 60 * 1000);
    const classes = await this.prisma.classSession.findMany({
      where: {
        startsAt: { gte: period.startsOn, lt: endExclusive },
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
        let deductions = 0;
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
            deductions += rate.ratePerClassMinor;
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
          data: {
            grossMinor: gross,
            deductionsMinor: deductions,
            bonusesMinor: 0, // no bonus lines are generated yet
            netMinor: gross - deductions,
          },
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

    // When the last entry is paid the period is paid too, so the periods list stops showing
    // a finished payroll as still in progress.
    const unpaid = await this.prisma.payrollEntry.count({
      where: { periodId: entry.periodId, status: { not: 'PAID' } },
    });
    if (unpaid === 0) {
      await this.prisma.payrollPeriod.update({
        where: { id: entry.periodId },
        data: { status: 'PAID' },
      });
    }

    await this.audit.record({
      actorId,
      action: 'pay.entry.paid',
      targetType: 'payroll_entry',
      targetId: entryId,
      after: { payoutReference, netMinor: updated.netMinor },
    });

    return updated;
  }

  /**
   * Adds a manual bonus or deduction to a teacher's entry with the reason that will appear on
   * the payslip (FR-PAY-03). Allowed while the period is CALCULATED and the entry unpaid; the
   * entry totals are recomputed from its lines so they can never drift from them.
   */
  async addAdjustment(
    entryId: string,
    input: { kind: 'BONUS' | 'DEDUCTION'; amountMinor: number; reason: string },
    actorId: string,
  ) {
    const reason = input.reason.trim();
    if (reason.length < 3) throw AppError.badRequest('Give a reason for the adjustment');
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw AppError.badRequest('An adjustment is a whole number of minor units above zero');
    }
    const entry = await this.prisma.payrollEntry.findUnique({
      where: { id: entryId },
      include: { period: { select: { status: true } } },
    });
    if (!entry) throw AppError.notFound('Payroll entry');
    if (entry.status === 'PAID' || entry.period.status !== 'CALCULATED') {
      throw AppError.conflict(
        'CONFLICT',
        'Adjustments can only be made to an unpaid entry in a calculated, not yet exported, period',
        { entryStatus: entry.status, periodStatus: entry.period.status },
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.payrollLine.create({
        data: {
          entryId,
          teacherId: entry.teacherId,
          kind: input.kind === 'BONUS' ? 'BONUS' : 'DEDUCTION_MANUAL',
          amountMinor: input.kind === 'BONUS' ? input.amountMinor : -input.amountMinor,
          note: reason,
        },
      });
      const lines = await tx.payrollLine.findMany({
        where: { entryId },
        select: { kind: true, amountMinor: true },
      });
      const totals = totalsOf(lines);
      return tx.payrollEntry.update({
        where: { id: entryId },
        data: {
          grossMinor: totals.gross,
          deductionsMinor: totals.deductions,
          bonusesMinor: totals.bonuses,
          netMinor: totals.gross - totals.deductions + totals.bonuses,
        },
      });
    });

    await this.audit.record({
      actorId,
      action: input.kind === 'BONUS' ? 'pay.entry.bonus' : 'pay.entry.deduction',
      targetType: 'payroll_entry',
      targetId: entryId,
      after: { amountMinor: input.amountMinor, reason, netMinor: updated.netMinor },
    });
    return updated;
  }

  /**
   * The period as CSV for an international payout run (FR-PAY-04). One row per teacher.
   * Exporting a calculated period moves it to EXPORTED, which closes it to adjustments.
   * Cells that start with `= + - @` are prefixed so a spreadsheet never runs them as formulas.
   */
  async exportPeriodCsv(periodId: string, actorId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        entries: {
          include: {
            teacher: {
              select: {
                user: { select: { name: true, email: true } },
                payRate: { select: { currency: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!period) throw AppError.notFound('Payroll period');
    if (period.status === 'OPEN') {
      throw AppError.conflict('CONFLICT', 'Calculate the period before exporting it');
    }

    const header = [
      'teacher_name',
      'teacher_email',
      'period_start',
      'period_end',
      'currency',
      'gross',
      'deductions',
      'bonuses',
      'net',
      'status',
      'payout_reference',
    ];
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const rows = period.entries.map((e) => [
      e.teacher.user.name,
      e.teacher.user.email ?? '',
      day(period.startsOn),
      day(period.endsOn),
      e.teacher.payRate?.currency ?? 'USD',
      minorToDecimal(e.grossMinor, e.teacher.payRate?.currency ?? 'USD'),
      minorToDecimal(e.deductionsMinor, e.teacher.payRate?.currency ?? 'USD'),
      minorToDecimal(e.bonusesMinor, e.teacher.payRate?.currency ?? 'USD'),
      minorToDecimal(e.netMinor, e.teacher.payRate?.currency ?? 'USD'),
      e.status,
      e.payoutReference ?? '',
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

    if (period.status === 'CALCULATED') {
      await this.prisma.payrollPeriod.update({
        where: { id: periodId },
        data: { status: 'EXPORTED' },
      });
    }
    await this.audit.record({
      actorId,
      action: 'pay.period.export',
      targetType: 'payroll_period',
      targetId: periodId,
      after: { rows: rows.length },
    });

    return { filename: `payroll-${day(period.startsOn)}-${day(period.endsOn)}.csv`, csv };
  }

  /** A teacher's own payslips, newest period first — paginated. */
  async teacherPayslips(userId: string, opts: { skip?: number; take?: number } = {}) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) return { items: [], total: 0 };

    const where = { teacherId: profile.id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payrollEntry.findMany({
        where,
        include: {
          period: { select: { startsOn: true, endsOn: true, status: true } },
          lines: { select: { kind: true, amountMinor: true, note: true, classId: true } },
        },
        orderBy: { period: { startsOn: 'desc' } },
        skip: opts.skip ?? 0,
        take: opts.take ?? 20,
      }),
      this.prisma.payrollEntry.count({ where }),
    ]);
    return { items, total };
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
        teacherId: e.teacher.id,
        grossMinor: e.grossMinor,
        // Per row, so the report can show how each net figure was reached.
        deductionsMinor: e.deductionsMinor,
        bonusesMinor: e.bonusesMinor,
        netMinor: e.netMinor,
        status: e.status,
        payoutReference: e.payoutReference,
        lineCount: e.lines.length,
      })),
    };
  }
}

/**
 * True when a write was rejected by the `payroll_period_no_overlap` exclusion constraint.
 * Postgres raises exclusion violations as SQLSTATE 23P01; Prisma surfaces unique indexes as
 * P2002, so both the code and the constraint name are checked to stay robust across Prisma's
 * mapping of exclusion constraints.
 */
function isNoOverlapViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return true;
    const target = (error.meta as { constraint?: unknown } | undefined)?.constraint;
    if (typeof target === 'string' && target.includes('payroll_period_no_overlap')) return true;
  }
  const message = error instanceof Error ? error.message : '';
  return message.includes('payroll_period_no_overlap');
}

/** Sums an entry's lines. Deduction lines are stored negative; totals are positive figures. */
export function totalsOf(lines: Array<{ kind: string; amountMinor: number }>) {
  let gross = 0;
  let deductions = 0;
  let bonuses = 0;
  for (const line of lines) {
    if (line.kind === 'CLASS') gross += line.amountMinor;
    else if (line.kind === 'BONUS') bonuses += line.amountMinor;
    else deductions += Math.abs(line.amountMinor);
  }
  return { gross, deductions, bonuses };
}

/** 2-decimal currencies only (every Currency in the schema); no float arithmetic. */
export function minorToDecimal(minor: number, _currency: string): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** One CSV cell: quoted when needed, and neutralised against spreadsheet formula injection. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
