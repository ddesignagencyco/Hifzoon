import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';

export type Granularity = 'week' | 'month';

const MAX_RANGE_DAYS = 366;

/**
 * Operations analytics (FR-OPS): revenue, churn, teacher utilisation and class completion
 * by week or month. Aggregation happens in the database; nothing here reads individual
 * children or families. Buckets are UTC calendar weeks (Monday start) or months.
 */
@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(input: { from?: Date; to?: Date; granularity?: Granularity }) {
    const granularity: Granularity = input.granularity ?? 'month';
    if (granularity !== 'week' && granularity !== 'month') {
      throw AppError.badRequest('granularity is week or month');
    }
    const to = input.to ?? new Date();
    const from = input.from ?? new Date(to.getTime() - 90 * 86_400_000);
    if (from >= to) throw AppError.badRequest('from must be before to');
    if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
      throw AppError.badRequest(`Pick a range of at most ${MAX_RANGE_DAYS} days`);
    }
    // `granularity` is one of two literals checked above, so it is safe to inline.
    const unit = Prisma.raw(`'${granularity}'`);

    const [revenue, refunds, completion, churned, activeAtStart, utilisation] = await Promise.all([
      this.prisma.$queryRaw<Array<{ bucket: Date; currency: string; minor: bigint }>>`
        SELECT date_trunc(${unit}, created_at) AS bucket, currency::text AS currency,
               SUM(amount_minor)::bigint AS minor
        FROM payment
        WHERE status IN ('SUCCEEDED', 'REFUNDED') AND created_at >= ${from} AND created_at < ${to}
        GROUP BY 1, 2 ORDER BY 1`,
      this.prisma.$queryRaw<Array<{ bucket: Date; currency: string; minor: bigint }>>`
        SELECT date_trunc(${unit}, r.created_at) AS bucket, p.currency::text AS currency,
               SUM(r.amount_minor)::bigint AS minor
        FROM refund r JOIN payment p ON p.id = r.payment_id
        WHERE r.created_at >= ${from} AND r.created_at < ${to}
        GROUP BY 1, 2 ORDER BY 1`,
      this.prisma.$queryRaw<Array<{ bucket: Date; status: string; n: bigint }>>`
        SELECT date_trunc(${unit}, starts_at) AS bucket, status::text AS status, COUNT(*)::bigint AS n
        FROM class_session
        WHERE starts_at >= ${from} AND starts_at < ${to} AND starts_at < now()
        GROUP BY 1, 2 ORDER BY 1`,
      // There is no cancelled-at column; for a CANCELLED subscription `updated_at` is when it
      // last changed, which is when it was cancelled.
      this.prisma.$queryRaw<Array<{ bucket: Date; n: bigint }>>`
        SELECT date_trunc(${unit}, updated_at) AS bucket, COUNT(*)::bigint AS n
        FROM subscription
        WHERE status = 'CANCELLED' AND updated_at >= ${from} AND updated_at < ${to}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<Array<{ bucket: Date; n: bigint }>>`
        SELECT b AS bucket, COUNT(s.id)::bigint AS n
        FROM generate_series(date_trunc(${unit}, ${from}::timestamptz),
                             date_trunc(${unit}, ${to}::timestamptz),
                             ('1 ' || ${granularity})::interval) AS b
        LEFT JOIN subscription s
          ON s.status <> 'INCOMPLETE' AND s.created_at < b
         AND (s.status <> 'CANCELLED' OR s.updated_at >= b)
        GROUP BY b ORDER BY b`,
      this.teacherUtilisation(from, to),
    ]);

    return {
      range: { from, to, granularity },
      revenue: this.revenueSeries(revenue, refunds),
      completion: this.completionSeries(completion),
      churn: this.churnSeries(churned, activeAtStart),
      teacherUtilisation: utilisation,
    };
  }

  // ── Series builders (pure; exported for tests) ────────────────────────────

  private revenueSeries(
    paid: Array<{ bucket: Date; currency: string; minor: bigint }>,
    refunded: Array<{ bucket: Date; currency: string; minor: bigint }>,
  ) {
    return buildRevenueSeries(paid, refunded);
  }

  private completionSeries(rows: Array<{ bucket: Date; status: string; n: bigint }>) {
    return buildCompletionSeries(rows);
  }

  private churnSeries(
    churned: Array<{ bucket: Date; n: bigint }>,
    active: Array<{ bucket: Date; n: bigint }>,
  ) {
    return buildChurnSeries(churned, active);
  }

  /** Hours taught ÷ hours the teacher offered, per teacher, over the range. */
  private async teacherUtilisation(from: Date, to: Date) {
    const days = (to.getTime() - from.getTime()) / 86_400_000;
    const [taught, slots] = await Promise.all([
      this.prisma.$queryRaw<Array<{ teacher_id: string; minutes: number }>>`
        SELECT teacher_id,
               (SUM(EXTRACT(EPOCH FROM (ends_at - starts_at))) / 60)::float8 AS minutes
        FROM class_session
        WHERE status IN ('COMPLETED', 'LIVE') AND starts_at >= ${from} AND starts_at < ${to}
        GROUP BY teacher_id`,
      this.prisma.availabilitySlot.findMany({
        where: {
          effectiveFrom: { lte: to },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
        },
        select: { teacherId: true, startTime: true, endTime: true },
      }),
    ]);

    const weeklyAvailable = new Map<string, number>();
    for (const slot of slots) {
      const minutes =
        slot.endTime.getUTCHours() * 60 +
        slot.endTime.getUTCMinutes() -
        (slot.startTime.getUTCHours() * 60 + slot.startTime.getUTCMinutes());
      if (minutes > 0) {
        weeklyAvailable.set(slot.teacherId, (weeklyAvailable.get(slot.teacherId) ?? 0) + minutes);
      }
    }
    const taughtBy = new Map(taught.map((t) => [t.teacher_id, t.minutes]));
    const ids = [...new Set([...weeklyAvailable.keys(), ...taughtBy.keys()])];
    const teachers = await this.prisma.teacherProfile.findMany({
      where: { id: { in: ids } },
      select: { id: true, user: { select: { name: true } } },
    });
    const nameOf = new Map(teachers.map((t) => [t.id, t.user.name]));

    return buildUtilisation(ids, nameOf, taughtBy, weeklyAvailable, days);
  }
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export function buildRevenueSeries(
  paid: Array<{ bucket: Date; currency: string; minor: bigint }>,
  refunded: Array<{ bucket: Date; currency: string; minor: bigint }>,
) {
  const map = new Map<
    string,
    { bucket: string; currency: string; grossMinor: number; refundedMinor: number }
  >();
  const slot = (bucket: Date, currency: string) => {
    const key = `${day(bucket)}|${currency}`;
    if (!map.has(key))
      map.set(key, { bucket: day(bucket), currency, grossMinor: 0, refundedMinor: 0 });
    return map.get(key)!;
  };
  for (const r of paid) slot(r.bucket, r.currency).grossMinor += Number(r.minor);
  for (const r of refunded) slot(r.bucket, r.currency).refundedMinor += Number(r.minor);
  return [...map.values()]
    .map((r) => ({ ...r, netMinor: r.grossMinor - r.refundedMinor }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket) || a.currency.localeCompare(b.currency));
}

export function buildCompletionSeries(rows: Array<{ bucket: Date; status: string; n: bigint }>) {
  const map = new Map<
    string,
    { bucket: string; completed: number; noShow: number; cancelled: number }
  >();
  for (const r of rows) {
    const key = day(r.bucket);
    const row = map.get(key) ?? { bucket: key, completed: 0, noShow: 0, cancelled: 0 };
    const n = Number(r.n);
    if (r.status === 'COMPLETED') row.completed += n;
    else if (r.status.startsWith('NO_SHOW')) row.noShow += n;
    else if (r.status.startsWith('CANCELLED')) row.cancelled += n;
    map.set(key, row);
  }
  return [...map.values()]
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
    .map((r) => {
      const finished = r.completed + r.noShow + r.cancelled;
      return {
        ...r,
        finished,
        completionRate: finished === 0 ? null : round(r.completed / finished),
      };
    });
}

export function buildChurnSeries(
  churned: Array<{ bucket: Date; n: bigint }>,
  active: Array<{ bucket: Date; n: bigint }>,
) {
  const lost = new Map(churned.map((c) => [day(c.bucket), Number(c.n)]));
  return active.map((a) => {
    const start = Number(a.n);
    const cancelled = lost.get(day(a.bucket)) ?? 0;
    return {
      bucket: day(a.bucket),
      activeAtStart: start,
      cancelled,
      // Cancellations ÷ subscriptions live at the start of the period; capped at 1 because a
      // subscription created and cancelled inside one period is not in the opening count.
      churnRate: start === 0 ? null : round(Math.min(cancelled / start, 1)),
    };
  });
}

export function buildUtilisation(
  ids: string[],
  nameOf: Map<string, string>,
  taughtMinutes: Map<string, number>,
  weeklyAvailableMinutes: Map<string, number>,
  days: number,
) {
  const weeks = days / 7;
  const rows = ids.map((id) => {
    const taught = Math.round(taughtMinutes.get(id) ?? 0);
    const available = Math.round((weeklyAvailableMinutes.get(id) ?? 0) * weeks);
    return {
      teacherId: id,
      name: nameOf.get(id) ?? 'Unknown',
      taughtMinutes: taught,
      availableMinutes: available,
      utilisation: available === 0 ? null : round(Math.min(taught / available, 1)),
    };
  });
  const totalTaught = rows.reduce((s, r) => s + r.taughtMinutes, 0);
  const totalAvailable = rows.reduce((s, r) => s + r.availableMinutes, 0);
  return {
    overall: totalAvailable === 0 ? null : round(Math.min(totalTaught / totalAvailable, 1)),
    teachers: rows.sort((a, b) => (b.utilisation ?? -1) - (a.utilisation ?? -1)),
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
