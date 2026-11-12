import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Currency, ErrorCode, Gender, LOGIN_SECURITY, Role, UserStatus } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { write } from '../../common/prisma-enum-bridge';
import { CryptoService } from '../../common/services/crypto.service';
import { PolicyService } from '../../common/services/policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConsentService } from '../consent/consent.service';
import {
  ageFromBirthYear,
  kidsPinProblem,
  LEARNER_MAX_AGE,
  LEARNER_MIN_AGE,
  OWN_LOGIN_MIN_AGE,
  PARENTAL_CONSENT_UNDER_AGE,
} from './families.constants';

/** Roles a child's own login may hold; anything else means the account is not theirs alone. */
const CHILD_LOGIN_ROLES: readonly string[] = [Role.STUDENT, Role.CHILD_STUDENT];

/** What a guardian sees of a child after their login changes. Never a password or hash. */
const STUDENT_LOGIN_VIEW = {
  id: true,
  familyId: true,
  displayName: true,
  birthYear: true,
  gender: true,
  language: true,
  timeZone: true,
  kidsMode: true,
  userId: true,
  user: { select: { email: true } },
  kidsCredential: { select: { lockedUntil: true } },
} satisfies Prisma.StudentSelect;

/**
 * How a child signs in. A kids-PIN account is linked through `Student.userId` like an own
 * login (so every student-facing read resolves the child the same way), but it is not
 * one: it has no email or password and exists only while the PIN does.
 */
function loginState(
  userId: string | null,
  user: { email: string | null } | null,
  kidsCredential: { lockedUntil: Date | null } | null,
) {
  const hasKidsPin = Boolean(kidsCredential);
  return {
    hasOwnLogin: userId !== null && !hasKidsPin,
    loginEmail: hasKidsPin ? null : (user?.email ?? null),
    hasKidsPin,
    kidsPinLockedUntil:
      kidsCredential?.lockedUntil && kidsCredential.lockedUntil > new Date()
        ? kidsCredential.lockedUntil
        : null,
  };
}

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
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async createFamilyForGuardian(input: {
    userId: string;
    name: string;
    country?: string;
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
        // Every family is billed in USD; Stripe shows their local currency at checkout.
        currency: Currency.USD,
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

    const age = ageFromBirthYear(input.birthYear);
    if (age < LEARNER_MIN_AGE || age > LEARNER_MAX_AGE) {
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
    const needsConsent = age < PARENTAL_CONSENT_UNDER_AGE;
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
    const students = await this.prisma.student.findMany({
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
        // FR-AUTH-03 — the settings tab shows which address the child signs in with.
        user: { select: { email: true } },
        kidsCredential: { select: { lockedUntil: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return students.map(({ user, kidsCredential, ...student }) => ({
      ...student,
      ...loginState(student.userId, user, kidsCredential),
    }));
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

  // ── Child's own login (FR-AUTH-03) ────────────────────────────────────────

  /**
   * Gives a child aged {@link OWN_LOGIN_MIN_AGE}+ their own email-and-password login.
   *
   * The guardian sets both the address and the password; nothing is emailed. The new
   * account holds only the STUDENT role, so it lands in the student portal and every
   * student-facing read resolves the child through `Student.userId`. Kids mode is
   * switched off in the same transaction, because a child signing in as themselves is
   * past the guardian-driven kids experience.
   */
  async createStudentLogin(input: {
    familyId: string;
    studentId: string;
    actorUserId: string;
    email: string;
    password: string;
  }) {
    await this.policies.assertGuardianInFamily(input.actorUserId, input.familyId);
    const student = await this.studentInFamily(input.familyId, input.studentId);

    const age = ageFromBirthYear(student.birthYear);
    if (age < OWN_LOGIN_MIN_AGE) {
      throw AppError.badRequest(
        `A child gets their own login from age ${OWN_LOGIN_MIN_AGE}. Until then they use yours.`,
        { field: 'birthYear', minAge: OWN_LOGIN_MIN_AGE },
      );
    }
    // A kids-PIN account gives way to the real login: the PIN stops working and the new
    // email account takes its place on the child.
    const pinAccountId = isKidsPinAccount(student) ? student.userId : null;
    if (student.userId && !pinAccountId) {
      throw AppError.conflict(ErrorCode.CONFLICT, 'This child already has their own login');
    }

    // Same rule the register DTO applies, re-checked here so no caller can skip it.
    if (input.password.length < LOGIN_SECURITY.PASSWORD_MIN_LENGTH) {
      throw AppError.badRequest(
        `Password must be at least ${LOGIN_SECURITY.PASSWORD_MIN_LENGTH} characters`,
        { field: 'password' },
      );
    }

    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        status: true,
        passwordHash: true,
        roles: { select: { role: true } },
        _count: {
          select: { oauthAccounts: true, familyMembers: true, students: true },
        },
      },
    });
    // A login this flow removed earlier is the only account that may be taken over: it
    // is disabled, has no password, holds nothing but a student role and belongs to no
    // one. Anything else with this address is somebody's live account.
    const reusable = existing !== null && isRemovedChildLogin(existing);
    if (existing && !reusable) {
      throw new AppError(ErrorCode.EMAIL_TAKEN, 'That email address is already in use');
    }

    const passwordHash = await this.crypto.hashPassword(input.password);
    const language = student.language || 'en';

    let userId: string;
    try {
      userId = await this.prisma.$transaction(async (tx) => {
        if (pinAccountId) await retireKidsPinAccount(tx, student.id, pinAccountId);
        const user = existing
          ? await tx.user.update({
              where: { id: existing.id },
              data: {
                passwordHash,
                name: student.displayName,
                language,
                timeZone: student.timeZone,
                status: write.userStatus(UserStatus.ACTIVE),
                failedLoginCount: 0,
                lockedUntil: null,
              },
              select: { id: true },
            })
          : await tx.user.create({
              data: {
                email,
                passwordHash,
                name: student.displayName,
                language,
                timeZone: student.timeZone,
                status: write.userStatus(UserStatus.ACTIVE),
                roles: { create: [{ role: write.role(Role.STUDENT) }] },
                notificationPreferences: { create: { language } },
              },
              select: { id: true },
            });

        // Conditional on the row still being unlinked, so two guardians racing each
        // other cannot leave a child pointing at one account while another dangles.
        const linked = await tx.student.updateMany({
          where: { id: student.id, userId: null },
          data: { userId: user.id, kidsMode: false },
        });
        if (linked.count === 0) {
          throw AppError.conflict(ErrorCode.CONFLICT, 'This child already has their own login');
        }
        return user.id;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(ErrorCode.EMAIL_TAKEN, 'That email address is already in use');
      }
      throw error;
    }

    this.logger.log(`Student ${student.id} given their own login ${userId}`);
    await this.audit.record({
      actorId: input.actorUserId,
      action: 'family.student.login.create',
      targetType: 'student',
      targetId: student.id,
      before: { userId: null, kidsMode: student.kidsMode },
      after: {
        userId,
        kidsMode: false,
        reusedAccount: reusable,
        replacedKidsPin: Boolean(pinAccountId),
      },
    });

    return this.studentLoginView(student.id);
  }

  /**
   * Takes a child's own login away again. The account is disabled rather than deleted:
   * messages, class attendance and audit rows may point at it, and a deleted row would
   * either cascade those away or fail. Every session and refresh token is revoked, the
   * same way a lock or password change ends access, so the child is signed out at once.
   * Kids mode is left as it is; the guardian can switch it back on in the settings.
   */
  async removeStudentLogin(input: { familyId: string; studentId: string; actorUserId: string }) {
    await this.policies.assertGuardianInFamily(input.actorUserId, input.familyId);
    const student = await this.studentInFamily(input.familyId, input.studentId);
    if (!student.userId) {
      throw AppError.badRequest('This child does not have their own login');
    }
    if (isKidsPinAccount(student)) {
      throw AppError.badRequest('This child signs in with a kids PIN; remove the PIN instead');
    }
    const userId = student.userId;

    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        roles: { select: { role: true } },
        _count: { select: { familyMembers: true, students: true } },
      },
    });
    // Only an account that is the child's alone is switched off. If the link somehow
    // points at a shared account (a guardian's, say), unlinking is all a guardian may do.
    const dedicated =
      account !== null &&
      account.roles.every((r) => CHILD_LOGIN_ROLES.includes(r.role)) &&
      account._count.familyMembers === 0 &&
      account._count.students <= 1;

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.student.update({ where: { id: student.id }, data: { userId: null } }),
      ...(dedicated
        ? [
            this.prisma.user.update({
              where: { id: userId },
              data: {
                status: write.userStatus(UserStatus.DISABLED),
                passwordHash: null,
                failedLoginCount: 0,
                lockedUntil: null,
              },
            }),
            this.prisma.session.updateMany({
              where: { userId, revokedAt: null },
              data: { revokedAt: now },
            }),
            this.prisma.refreshToken.updateMany({
              where: { userId, revokedAt: null },
              data: { revokedAt: now },
            }),
            // An outstanding reset link must not hand the account back.
            this.prisma.passwordResetToken.updateMany({
              where: { userId, usedAt: null },
              data: { usedAt: now },
            }),
          ]
        : []),
    ]);

    this.logger.log(`Own login ${userId} removed from student ${student.id}`);
    await this.audit.record({
      actorId: input.actorUserId,
      action: 'family.student.login.remove',
      targetType: 'student',
      targetId: student.id,
      before: { userId },
      after: { userId: null, accountDisabled: dedicated },
    });

    return this.studentLoginView(student.id);
  }

  // ── Kids PIN sign-in (FR-AUTH-03) ─────────────────────────────────────────

  /**
   * Sets or resets the PIN a child in kids mode signs in with (family sign-in code + name
   * + PIN; see AuthService.kidsPinLogin).
   *
   * The first PIN creates the child a CHILD_STUDENT account with no email and no password,
   * linked through `Student.userId`, because sessions, the student portal and the classroom
   * all resolve a learner from a signed-in user. That account can do nothing a student
   * cannot, and only for this one child. A reset ends every session started with the old
   * PIN, in case the old one is why it is being changed.
   */
  async setKidsPin(input: {
    familyId: string;
    studentId: string;
    actorUserId: string;
    pin: string;
  }) {
    await this.policies.assertGuardianInFamily(input.actorUserId, input.familyId);
    const student = await this.studentInFamily(input.familyId, input.studentId);

    const problem = kidsPinProblem(input.pin);
    if (problem) throw AppError.badRequest(problem, { field: 'pin' });
    if (!student.kidsMode) {
      throw AppError.badRequest(
        `Turn on kids mode for ${student.displayName} first; the PIN is for the kids sign-in`,
        { field: 'kidsMode' },
      );
    }
    const pinAccountId = isKidsPinAccount(student) ? student.userId : null;
    if (student.userId && !pinAccountId) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        `${student.displayName} has their own login and signs in with that`,
      );
    }

    const secretHash = await this.crypto.hashPassword(input.pin);
    const now = new Date();
    let userId: string;
    if (pinAccountId) {
      userId = pinAccountId;
      await this.prisma.$transaction([
        this.prisma.kidsCredential.update({
          where: { studentId: student.id },
          data: { type: 'PIN', secretHash, failedAttempts: 0, lockedUntil: null },
        }),
        this.prisma.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        }),
        this.prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        }),
      ]);
    } else {
      const language = student.language || 'en';
      userId = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: student.displayName,
            language,
            timeZone: student.timeZone,
            status: write.userStatus(UserStatus.ACTIVE),
            roles: { create: [{ role: write.role(Role.CHILD_STUDENT) }] },
            // No address to email: anything for the child reaches the guardians anyway.
            notificationPreferences: { create: { language, email: false, whatsapp: false } },
          },
          select: { id: true },
        });
        // Conditional on the child still having no account, as in createStudentLogin.
        const linked = await tx.student.updateMany({
          where: { id: student.id, userId: null },
          data: { userId: user.id },
        });
        if (linked.count === 0) {
          throw AppError.conflict(ErrorCode.CONFLICT, 'This child already has a login');
        }
        await tx.kidsCredential.upsert({
          where: { studentId: student.id },
          create: { studentId: student.id, type: 'PIN', secretHash },
          update: { type: 'PIN', secretHash, failedAttempts: 0, lockedUntil: null },
        });
        return user.id;
      });
    }

    this.logger.log(`Kids PIN ${pinAccountId ? 'reset' : 'set'} for student ${student.id}`);
    await this.audit.record({
      actorId: input.actorUserId,
      action: pinAccountId ? 'family.student.kids-pin.reset' : 'family.student.kids-pin.set',
      targetType: 'student',
      targetId: student.id,
      // Never the PIN or its hash.
      after: { userId, sessionsRevoked: Boolean(pinAccountId) },
    });

    return this.studentLoginView(student.id);
  }

  /** Removes the PIN: the child's PIN account is switched off and every session ends. */
  async removeKidsPin(input: { familyId: string; studentId: string; actorUserId: string }) {
    await this.policies.assertGuardianInFamily(input.actorUserId, input.familyId);
    const student = await this.studentInFamily(input.familyId, input.studentId);
    if (!student.kidsCredential) {
      throw AppError.badRequest(`${student.displayName} does not have a PIN`);
    }
    const pinAccountId = isKidsPinAccount(student) ? student.userId : null;

    await this.prisma.$transaction(async (tx) => {
      if (pinAccountId) await retireKidsPinAccount(tx, student.id, pinAccountId);
      else await tx.kidsCredential.deleteMany({ where: { studentId: student.id } });
    });

    this.logger.log(`Kids PIN removed from student ${student.id}`);
    await this.audit.record({
      actorId: input.actorUserId,
      action: 'family.student.kids-pin.remove',
      targetType: 'student',
      targetId: student.id,
      before: { userId: pinAccountId },
      after: { userId: null, accountDisabled: Boolean(pinAccountId) },
    });

    return this.studentLoginView(student.id);
  }

  private async studentInFamily(familyId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, familyId, deletedAt: null },
      select: {
        id: true,
        displayName: true,
        birthYear: true,
        language: true,
        timeZone: true,
        kidsMode: true,
        userId: true,
        kidsCredential: { select: { id: true } },
        user: { select: { email: true, passwordHash: true } },
      },
    });
    if (!student) throw AppError.notFound('Student');
    return student;
  }

  private async studentLoginView(studentId: string) {
    const row = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: STUDENT_LOGIN_VIEW,
    });
    if (!row) throw AppError.notFound('Student');
    const { user, kidsCredential, ...student } = row;
    return { ...student, ...loginState(student.userId, user, kidsCredential) };
  }
}

/**
 * True when the child's linked account is the one a kids PIN created: a credential exists
 * and the account has neither email nor password, so it cannot be anybody's real login.
 */
function isKidsPinAccount(student: {
  userId: string | null;
  kidsCredential: { id: string } | null;
  user: { email: string | null; passwordHash: string | null } | null;
}): boolean {
  return Boolean(
    student.userId &&
    student.kidsCredential &&
    student.user &&
    !student.user.email &&
    !student.user.passwordHash,
  );
}

/**
 * Switches a kids-PIN account off: the PIN goes, the child is unlinked and every session
 * ends. The row is disabled rather than deleted because class attendance may point at it.
 */
async function retireKidsPinAccount(
  tx: Prisma.TransactionClient,
  studentId: string,
  userId: string,
): Promise<void> {
  const now = new Date();
  await tx.kidsCredential.deleteMany({ where: { studentId } });
  await tx.student.updateMany({ where: { id: studentId, userId }, data: { userId: null } });
  await tx.user.update({
    where: { id: userId },
    data: { status: write.userStatus(UserStatus.DISABLED) },
  });
  await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  await tx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });
}

/** True for an account left behind by {@link FamiliesService.removeStudentLogin}. */
function isRemovedChildLogin(user: {
  status: string;
  passwordHash: string | null;
  roles: Array<{ role: string }>;
  _count: { oauthAccounts: number; familyMembers: number; students: number };
}): boolean {
  return (
    user.status === (UserStatus.DISABLED as string) &&
    user.passwordHash === null &&
    user.roles.length > 0 &&
    user.roles.every((r) => CHILD_LOGIN_ROLES.includes(r.role)) &&
    user._count.oauthAccounts === 0 &&
    user._count.familyMembers === 0 &&
    user._count.students === 0
  );
}
