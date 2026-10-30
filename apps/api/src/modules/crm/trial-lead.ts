import { LeadStatus, Prisma, PrismaClient, TaskStatus, TaskType } from '@prisma/client';

/**
 * Keeps the CRM pipeline in step with what actually happens to a family's trial, so an
 * admin never has to move a lead by hand to mirror a booking, a result or a payment:
 *
 *   trial booked (by the family or an admin) → TRIAL_BOOKED   (lead created if none)
 *   result saved: continuing                 → TRIAL_DONE     (waiting for payment)
 *   result saved: not continuing             → LOST           (with the reason)
 *   first payment / subscription active      → WON
 *
 * Plain Prisma functions (no service) so scheduling, admissions and billing can call them
 * without importing the CRM module — a closed lead (WON/LOST) is never touched.
 */
type Db = PrismaClient | Prisma.TransactionClient;

const OPEN: LeadStatus[] = [LeadStatus.NEW, LeadStatus.TRIAL_BOOKED, LeadStatus.TRIAL_DONE];

/** The family's open lead: the one linked to this trial, else the newest for the family or its guardians. */
async function openLeadFor(db: Db, familyId: string, classId?: string) {
  if (classId) {
    const linked = await db.lead.findFirst({ where: { trialClassId: classId, status: { in: OPEN } } });
    if (linked) return linked;
  }
  const members = await db.familyMember.findMany({
    where: { familyId },
    select: { userId: true, user: { select: { email: true } } },
  });
  const emails = members.map((m) => m.user.email).filter((e): e is string => Boolean(e));
  return db.lead.findFirst({
    where: {
      status: { in: OPEN },
      OR: [
        { familyId },
        { contactUserId: { in: members.map((m) => m.userId) } },
        ...(emails.length ? [{ email: { in: emails, mode: 'insensitive' as const } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** A trial class was booked: move the family's lead to TRIAL_BOOKED, creating it if needed. */
export async function leadTrialBooked(db: Db, input: { classId: string; studentId: string; source: string | null }) {
  const student = await db.student.findUnique({
    where: { id: input.studentId },
    select: {
      displayName: true,
      birthYear: true,
      familyId: true,
      family: {
        select: {
          country: true,
          members: {
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { userId: true, user: { select: { name: true, email: true, phone: true } } },
          },
        },
      },
    },
  });
  if (!student) return null;
  const session = await db.classSession.findUnique({
    where: { id: input.classId },
    select: { course: { select: { code: true } } },
  });

  const existing = await openLeadFor(db, student.familyId);
  if (existing) {
    return db.lead.update({
      where: { id: existing.id },
      data: { status: LeadStatus.TRIAL_BOOKED, trialClassId: input.classId, familyId: student.familyId },
    });
  }

  const guardian = student.family.members[0];
  const lead = await db.lead.create({
    data: {
      source: input.source,
      status: LeadStatus.TRIAL_BOOKED,
      contactName: guardian?.user.name ?? `${student.displayName}'s family`,
      email: guardian?.user.email ?? null,
      phone: guardian?.user.phone ?? null,
      contactUserId: guardian?.userId ?? null,
      country: student.family.country ?? null,
      childAge: new Date().getUTCFullYear() - student.birthYear,
      courseInterest: session?.course.code ?? null,
      familyId: student.familyId,
      trialClassId: input.classId,
    },
  });
  await db.task.create({
    data: {
      leadId: lead.id,
      type: TaskType.OTHER,
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      note: `Welcome call before ${student.displayName}'s trial`,
    },
  });
  return lead;
}

/** A trial result was saved. Continuing → TRIAL_DONE (until they pay); not continuing → LOST. */
export async function leadTrialResult(db: Db, input: { classId: string; familyId: string; won: boolean; lostReason?: string | null }) {
  const lead = await openLeadFor(db, input.familyId, input.classId);
  if (!lead) return null;
  if (input.won) {
    return db.lead.update({ where: { id: lead.id }, data: { status: LeadStatus.TRIAL_DONE, familyId: input.familyId } });
  }
  const updated = await db.lead.update({
    where: { id: lead.id },
    data: { status: LeadStatus.LOST, lostReason: input.lostReason?.trim() || 'Not continuing after the trial', familyId: input.familyId },
  });
  await db.task.updateMany({ where: { leadId: lead.id, status: TaskStatus.OPEN }, data: { status: TaskStatus.CANCELLED } });
  return updated;
}

/** The family started paying: their open lead is won. */
export async function leadWon(db: Db, familyId: string) {
  const lead = await openLeadFor(db, familyId);
  if (!lead) return null;
  const updated = await db.lead.update({ where: { id: lead.id }, data: { status: LeadStatus.WON, familyId } });
  await db.task.updateMany({ where: { leadId: lead.id, status: TaskStatus.OPEN }, data: { status: TaskStatus.DONE } });
  return updated;
}
