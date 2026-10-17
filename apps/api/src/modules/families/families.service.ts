import { Injectable, Logger } from '@nestjs/common';
import { Currency, Gender, Role, UserStatus } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { PolicyService } from '../../common/services/policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConsentService } from '../consent/consent.service';

/**
 * Family accounts, guardians and children (AUTH-BE-05, FR-AUTH-03).
 *
 * A child is modelled as a `student` row that does *not* need an email or an
 * account: the guardian manages their lessons, consents and progress. A child may
 * later be given their own (kids-mode) login without any data being migrated.
 */
@Injectable()
export class FamiliesService {
  private readonly logger = new Logger(FamiliesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyService,
    private readonly consent: ConsentService,
  ) {}

  async createFamilyForGuardian(input: {
    userId: string;
    name: string;
    country?: string;
    currency?: Currency;
    billingName?: string;
    billingAddress?: Record<string, unknown>;
    timeZone?: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { name: true, language: true, timeZone: true },
    });
    if (!user) throw AppError.notFound('User');

    const family = await this.prisma.family.create({
      data: {
        name: input.name,
        country: input.country ?? null,
        currency: input.currency ?? Currency.USD,
        billingName: input.billingName ?? user.name,
        billingAddress: (input.billingAddress as never) ?? undefined,
        timeZone: input.timeZone ?? user.timeZone,
        members: {
          create: [
            {
              userId: input.userId,
              relationship: 'PARENT',
              isPrimary: true,
              // CR-01 / S20 — verifiability has to be *established*, not assumed.
              // Setting this on creation made the emailed-code check
              // (/consent/families/:id/verify/*) unreachable, so the onboarding step read
              // "done" immediately and we held no verifiable parental consent for a child
              // under 13. It is now written only by the verification confirm step.
              verifiedAt: null,
            },
          ],
        },
      },
    });

    return family;
  }

  async listForUser(userId: string) {
    const families = await this.prisma.family.findMany({
      where: { members: { some: { userId } } },
      select: {
        id: true,
        name: true,
        country: true,
        currency: true,
        createdAt: true,
        members: {
          where: { userId },
          select: { isPrimary: true, verifiedAt: true, relationship: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (families.length === 0) return [];

    // M12 — verification is a property of the *family* (CR-01 asks for a verifiable
    // guardian for the child), but only the caller's own membership row was returned, so a
    // second guardian asked to confirm saw "done" on a family nobody had verified. The
    // primary guardian's stamp is the family's verification state.
    const primaries = await this.prisma.familyMember.findMany({
      where: { familyId: { in: families.map((f) => f.id) }, isPrimary: true },
      select: { familyId: true, verifiedAt: true },
    });
    const verifiedBy = new Map(primaries.map((p) => [p.familyId, p.verifiedAt]));

    return families.map((family) => ({
      ...family,
      verified: verifiedBy.get(family.id) != null,
    }));
  }

  async getFamily(familyId: string, userId: string) {
    await this.policies.assertGuardianInFamily(userId, familyId);
    return this.prisma.family.findUnique({
      where: { id: familyId },
      select: {
        id: true,
        name: true,
        country: true,
        currency: true,
        billingName: true,
        timeZone: true,
        createdAt: true,
        members: {
          select: {
            id: true,
            relationship: true,
            isPrimary: true,
            verifiedAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        students: {
          select: {
            id: true,
            displayName: true,
            birthYear: true,
            gender: true,
            language: true,
            timeZone: true,
            kidsMode: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async updateFamily(
    familyId: string,
    userId: string,
    patch: {
      name?: string;
      country?: string;
      currency?: Currency;
      billingName?: string;
      billingAddress?: Record<string, unknown>;
      timeZone?: string;
    },
  ) {
    await this.policies.assertGuardianInFamily(userId, familyId);
    return this.prisma.family.update({
      where: { id: familyId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.country !== undefined ? { country: patch.country } : {}),
        ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
        ...(patch.billingName !== undefined ? { billingName: patch.billingName } : {}),
        ...(patch.billingAddress !== undefined
          ? { billingAddress: patch.billingAddress as never }
          : {}),
        ...(patch.timeZone !== undefined ? { timeZone: patch.timeZone } : {}),
      },
      select: {
        id: true,
        name: true,
        country: true,
        currency: true,
        billingName: true,
        timeZone: true,
      },
    });
  }

  // ── Guardians (FR-AUTH-03) ────────────────────────────────────────────────

  /**
   * Adds a second guardian by email. If that address has no account, one is created
   * in an unverified state — the person must set a password and complete CR-10
   * verification before they can see anything.
   */
  async addGuardian(input: {
    familyId: string;
    actorUserId: string;
    email: string;
    relationship: string;
  }) {
    await this.policies.assertGuardianInFamily(input.actorUserId, input.familyId);
    const email = input.email.trim().toLowerCase();

    const user = await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: email.split('@')[0],
        status: UserStatus.ACTIVE,
        roles: { create: [{ role: Role.GUARDIAN }] },
        notificationPreferences: { create: {} },
      },
    });

    await this.prisma.familyMember.upsert({
      where: { familyId_userId: { familyId: input.familyId, userId: user.id } },
      update: { relationship: input.relationship },
      create: { familyId: input.familyId, userId: user.id, relationship: input.relationship },
    });

    // An account created here has no password yet, so the only way in is the normal
    // "forgot password" flow; `verified` stays false until CR-10 verification.
    return { userId: user.id, email: user.email, verified: false, needsPasswordSetup: true };
  }

  async listGuardians(familyId: string, userId: string) {
    await this.policies.assertGuardianInFamily(userId, familyId);
    return this.prisma.familyMember.findMany({
      where: { familyId },
      select: {
        id: true,
        relationship: true,
        isPrimary: true,
        verifiedAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  // ── Students (FR-AUTH-03) ─────────────────────────────────────────────────

  /**
   * Adds a child. No email is collected (FR-AUTH-03) and only the birth *year* is
   * stored, which is the minimum needed to age-gate the under-13 consent rules.
   */
  async addStudent(input: {
    familyId: string;
    actorUserId: string;
    displayName: string;
    birthYear: number;
    gender: Gender;
    language?: string;
    timeZone?: string;
    kidsMode?: boolean;
    notes?: string;
  }) {
    await this.policies.assertGuardianInFamily(input.actorUserId, input.familyId);

    const age = new Date().getUTCFullYear() - input.birthYear;
    if (age < 3 || age > 25) {
      throw AppError.badRequest('Birth year looks out of range for a learner');
    }

    const family = await this.prisma.family.findUnique({
      where: { id: input.familyId },
      select: {
        timeZone: true,
        members: { where: { userId: input.actorUserId }, select: { id: true } },
      },
    });
    if (!family) throw AppError.notFound('Family');

    const student = await this.prisma.student.create({
      data: {
        familyId: input.familyId,
        displayName: input.displayName,
        birthYear: input.birthYear,
        gender: input.gender,
        language: input.language ?? 'en',
        timeZone: input.timeZone ?? family.timeZone,
        kidsMode: input.kidsMode ?? false,
        notes: input.notes ?? null,
      },
    });

    this.logger.log(`Student ${student.id} added to family ${input.familyId} (age ${age})`);

    // CR-01: an under-13 child cannot be used until a verified guardian exists and
    // the mandatory DATA_COLLECTION consent is recorded.
    const needsConsent = age < 13;
    if (needsConsent) {
      const existing = await this.consent.getForStudent(student.id);
      const blocked = existing.purposes.every((p) => p.status !== 'GRANTED');
      if (blocked) {
        return {
          ...student,
          requiresConsent: true,
          nextStep: 'GRANT_DATA_COLLECTION_CONSENT',
        };
      }
    }

    return { ...student, requiresConsent: false, nextStep: null };
  }

  async listStudents(familyId: string, userId: string) {
    await this.policies.assertGuardianInFamily(userId, familyId);
    return this.prisma.student.findMany({
      where: { familyId, deletedAt: null },
      select: {
        id: true,
        displayName: true,
        birthYear: true,
        gender: true,
        language: true,
        timeZone: true,
        kidsMode: true,
        userId: true,
        // M8 — both fields were readable only from the PATCH response, so the list the
        // portal actually renders could not show a note or which Mushaf layout a child
        // is taught against. A list that disagrees with the detail page is worse than
        // neither.
        notes: true,
        mushafLayout: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateStudent(
    studentId: string,
    actorUserId: string,
    patch: Partial<{
      displayName: string;
      birthYear: number;
      gender: Gender;
      language: string;
      timeZone: string;
      kidsMode: boolean;
      notes: string;
    }>,
  ) {
    await this.policies.assertGuardianOwnsStudent(actorUserId, studentId);
    return this.prisma.student.update({
      where: { id: studentId },
      data: { ...patch },
      select: {
        id: true,
        displayName: true,
        birthYear: true,
        gender: true,
        language: true,
        timeZone: true,
        kidsMode: true,
        notes: true,
      },
    });
  }
}
