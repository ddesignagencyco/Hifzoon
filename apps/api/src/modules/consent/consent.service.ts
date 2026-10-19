import { Injectable, Logger } from '@nestjs/common';
import {
  ConsentMethod,
  ConsentPurpose,
  ConsentStatus,
  DataRequestStatus,
  DataRequestType,
  RETENTION_DAYS,
} from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { CryptoService } from '../../common/services/crypto.service';
import { SettingsService } from '../settings/settings.service';
import { PolicyService } from '../../common/services/policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { QUEUE } from '../../queue/queue.constants';

export interface GrantConsentInput {
  studentId: string;
  purposes: ConsentPurpose[];
  method: ConsentMethod;
  /** Defaults to the current notice version when the client does not send one (M9). */
  policyVersion?: string;
  actorUserId: string;
  ip?: string;
}

/**
 * Verifiable parental consent ledger (FR-AUTH-04, CR-01, CR-06, AUTH-BE-07).
 *
 * Design rules that matter legally and technically:
 *   - the ledger is append-only in spirit: withdrawal never deletes the grant, it
 *     flips the status and writes a `consent_event` with who/when/why
 *   - a guardian may only consent for children in their own family (CR-10)
 *   - each purpose is independent, so refusing AI training never affects class
 *     delivery (CR-06 — children's data is not used for training without a
 *     separate, specific opt-in)
 *   - the policy version that was shown is recorded with every grant, so the
 *     academy can prove which notice was accepted
 */
@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly policies: PolicyService,
    private readonly queues: QueueService,
    private readonly settings: SettingsService,
  ) {}

  /** The privacy notice version a guardian is accepting right now (M9). */
  currentPolicyVersion(): Promise<string> {
    return this.settings.getString('consent.policy_version');
  }

  /** Current consent state for a student, keyed by purpose. */
  async getForStudent(studentId: string) {
    const rows = await this.prisma.consent.findMany({
      where: { studentId },
      orderBy: { purpose: 'asc' },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });

    const byPurpose = new Map(rows.map((row) => [row.purpose, row]));
    return {
      studentId,
      purposes: Object.values(ConsentPurpose).map((purpose) => {
        const row = byPurpose.get(purpose);
        return {
          purpose,
          status: row?.status ?? ConsentStatus.WITHDRAWN,
          grantedAt: row?.grantedAt ?? null,
          withdrawnAt: row?.withdrawnAt ?? null,
          policyVersion: row?.policyVersion ?? null,
        };
      }),
    };
  }

  /** Purposes from `purposes` that are not currently granted for this student. */
  async findMissingPurposes(
    studentId: string,
    purposes: ConsentPurpose[],
  ): Promise<ConsentPurpose[]> {
    if (purposes.length === 0) return [];
    const granted = await this.prisma.consent.findMany({
      where: { studentId, purpose: { in: purposes }, status: ConsentStatus.GRANTED },
      select: { purpose: true },
    });
    const grantedSet = new Set(granted.map((row) => row.purpose));
    return purposes.filter((purpose) => !grantedSet.has(purpose));
  }

  async hasConsent(studentId: string, purpose: ConsentPurpose): Promise<boolean> {
    return (await this.findMissingPurposes(studentId, [purpose])).length === 0;
  }

  /** Grants one or more purposes, replacing any previous grant for the same version. */
  async grant(input: GrantConsentInput) {
    const policyVersion = input.policyVersion ?? (await this.currentPolicyVersion());
    const student = await this.prisma.student.findUnique({
      where: { id: input.studentId },
      select: { id: true, familyId: true },
    });
    if (!student) throw AppError.notFound('Student');

    await this.policies.assertGuardianOwnsStudent(input.actorUserId, input.studentId);

    // S15 — *how* consent was given is evidence, not a label the client picks. A guardian
    // tapping "accept" in the app has given consent online and nothing more; letting the
    // request body say `SIGNED_FORM` or `ID_CHECK` would let anyone manufacture the record
    // of a signature or an identity check that never happened. Staff acting on a child's
    // behalf may still record the method, because a paper form genuinely exists then.
    const isStaff =
      (await this.prisma.userRole.count({
        where: { userId: input.actorUserId, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
        take: 1,
      })) > 0;
    const method = isStaff ? input.method : ConsentMethod.OTHER;

    const results = [];
    for (const purpose of input.purposes) {
      const existing = await this.prisma.consent.findFirst({
        where: { studentId: input.studentId, purpose },
        orderBy: { createdAt: 'desc' },
      });

      const record = await this.prisma.$transaction(async (tx) => {
        if (existing) {
          // Re-granting after a withdrawal: flip the row back and append the event.
          await tx.consentEvent.create({
            data: {
              consentId: existing.id,
              fromStatus: existing.status,
              toStatus: ConsentStatus.GRANTED,
              actorId: input.actorUserId,
              reason: 'Re-granted',
              ip: input.ip,
            },
          });
          return tx.consent.update({
            where: { id: existing.id },
            data: {
              status: ConsentStatus.GRANTED,
              withdrawnAt: null,
              grantedAt: new Date(),
              method: method,
              policyVersion,
              grantedByUserId: input.actorUserId,
            },
          });
        }

        const created = await tx.consent.create({
          data: {
            familyId: student.familyId,
            studentId: input.studentId,
            purpose,
            status: ConsentStatus.GRANTED,
            method: method,
            policyVersion,
            grantedByUserId: input.actorUserId,
            ip: input.ip,
          },
        });
        await tx.consentEvent.create({
          data: {
            consentId: created.id,
            fromStatus: ConsentStatus.WITHDRAWN,
            toStatus: ConsentStatus.GRANTED,
            actorId: input.actorUserId,
            reason: 'Granted',
            ip: input.ip,
          },
        });
        return created;
      });

      results.push(record);
    }

    this.logger.log(`Consent granted for student ${input.studentId}: ${input.purposes.join(', ')}`);
    return results;
  }

  /** Withdraws consent. Data already collected stays until the retention job removes it. */
  async withdraw(input: {
    studentId: string;
    purposes: ConsentPurpose[];
    actorUserId: string;
    reason?: string;
    ip?: string;
  }) {
    await this.policies.assertGuardianOwnsStudent(input.actorUserId, input.studentId);

    const rows = await this.prisma.consent.findMany({
      where: { studentId: input.studentId, purpose: { in: input.purposes } },
    });

    const withdrawn = [];
    for (const row of rows) {
      if (row.status === (ConsentStatus.WITHDRAWN as string)) continue;
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.consentEvent.create({
          data: {
            consentId: row.id,
            fromStatus: row.status,
            toStatus: ConsentStatus.WITHDRAWN,
            actorId: input.actorUserId,
            reason: input.reason ?? 'Guardian withdrew consent',
            ip: input.ip,
          },
        });
        return tx.consent.update({
          where: { id: row.id },
          data: { status: ConsentStatus.WITHDRAWN, withdrawnAt: new Date() },
        });
      });
      withdrawn.push(updated);
    }

    this.logger.log(
      `Consent withdrawn for student ${input.studentId}: ${input.purposes.join(', ')}`,
    );

    // Drop anything the withdrawal immediately invalidates (FR-CLS-12, FR-AIC-09).
    await this.enforceWithdrawalConsequences(input.studentId, input.purposes);

    return withdrawn;
  }

  /**
   * Withdrawal has to take effect in the product, not just on paper:
   *   - CLASS_RECORDING: pending recordings for the student stop and are scheduled
   *     for deletion
   * - AI_VOICE / AI_TRAINING: stored practice audio is scheduled for immediate
   *     deletion rather than waiting for the 30 day sweep (CR-02, CR-06)
   */
  private async enforceWithdrawalConsequences(
    studentId: string,
    purposes: ConsentPurpose[],
  ): Promise<void> {
    const stopsRecording = purposes.includes(ConsentPurpose.CLASS_RECORDING);
    const dropsAudio =
      purposes.includes(ConsentPurpose.AI_VOICE) || purposes.includes(ConsentPurpose.AI_TRAINING);

    if (stopsRecording) {
      await this.prisma.classSession.updateMany({
        where: { status: 'SCHEDULED', students: { some: { studentId } } },
        data: { tajweedColours: false },
      });
      await this.queues.add(QUEUE.RETENTION, 'withdrawal-recording-cleanup', {
        action: 'DELETE_EXPIRED_RECORDINGS',
        studentId,
      });
    }

    if (dropsAudio) {
      const sessions = await this.prisma.practiceSession.findMany({
        where: { studentId, audioKey: { not: null } },
        select: { id: true, audioKey: true },
      });
      for (const session of sessions) {
        await this.prisma.practiceSession.update({
          where: { id: session.id },
          data: { audioKey: null, audioDeleteAfter: new Date() },
        });
      }
      if (sessions.length > 0) {
        this.logger.log(`Removed ${sessions.length} practice recordings after consent withdrawal`);
      }
    }
  }

  // ── CR-05: export and deletion requests ───────────────────────────────────

  async requestDataRequest(input: {
    familyId: string;
    studentId?: string;
    type: DataRequestType;
    actorUserId: string;
  }) {
    // S15 — `studentId` arrives from the client, so it has to be proven to be this
    // family's child before it is recorded. Without this check a guardian could file an
    // export or deletion against any student in the academy by guessing an id, and the
    // request would sit in the queue looking legitimate.
    if (input.studentId) {
      const owned = await this.prisma.student.count({
        where: { id: input.studentId, familyId: input.familyId },
        take: 1,
      });
      if (owned === 0) {
        throw AppError.badRequest('That student is not part of this family', {
          field: 'studentId',
        });
      }
    }

    const record = await this.prisma.dataRequest.create({
      data: {
        familyId: input.familyId,
        studentId: input.studentId ?? null,
        type: input.type,
        status: DataRequestStatus.REQUESTED,
        dueAt: new Date(Date.now() + RETENTION_DAYS.DATA_REQUEST_SLA * 86_400_000),
      },
    });

    await this.queues.add(QUEUE.DATA_REQUEST, 'process-data-request', {
      dataRequestId: record.id,
    });

    return {
      id: record.id,
      type: record.type,
      status: record.status,
      dueAt: record.dueAt,
    };
  }

  async listDataRequests(familyId: string) {
    return this.prisma.dataRequest.findMany({
      where: { familyId },
      orderBy: { requestedAt: 'desc' },
      select: {
        id: true,
        type: true,
        status: true,
        requestedAt: true,
        dueAt: true,
        completedAt: true,
        fileUrl: true,
      },
    });
  }

  // ── CR-10: guardian ↔ family verification ──────────────────────────────────

  /**
   * Issues a numeric code to the *primary* verified guardian. The new guardian must
   * present it, which proves control of a channel the family already trusts and
   * prevents a stranger from attaching themselves to a family (CR-10).
   */
  async startGuardianVerification(input: {
    familyId: string;
    requesterUserId: string;
  }): Promise<{ challengeId: string; expiresInSeconds: number }> {
    const members = await this.prisma.familyMember.findMany({
      where: { familyId: input.familyId, isPrimary: true },
      include: { user: { select: { id: true, email: true } } },
      take: 1,
    });
    const primary = members[0];
    if (!primary)
      throw AppError.badRequest('This family has no primary guardian to verify against');

    const code = this.crypto.generateNumericCode(6);
    const challenge = await this.prisma.guardianVerification.create({
      data: {
        familyId: input.familyId,
        targetUserId: input.requesterUserId,
        primaryUserId: primary.user.id,
        codeHash: this.crypto.hashToken(code),
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });

    // M11 — this interpolated the family *id*, so the email a parent was asked to trust read
    // "A code was requested for family 3f9c…". The family's name is what makes the message
    // recognisable to the person it is asking, and the name is not a secret.
    //
    // The requester's name is the other half: the template greets the primary guardian with
    // `${d.requesterName}`, and without it the delivered copy read "undefined asked to join
    // your family as a guardian" — which is exactly the message that must never look
    // malformed when it is asking someone to trust a stranger with their children.
    const [family, requester] = await Promise.all([
      this.prisma.family.findUnique({
        where: { id: input.familyId },
        select: { name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: input.requesterUserId },
        select: { name: true },
      }),
    ]);

    await this.queues.add(QUEUE.NOTIFICATION, 'guardian-verification', {
      notificationId: '',
      userId: primary.user.id,
      template: 'consent.guardian-verification',
      locale: 'en',
      channel: 'EMAIL',
      data: {
        code,
        familyName: family?.name ?? 'your family',
        requesterName: requester?.name ?? 'Someone',
      },
    });

    return { challengeId: challenge.id, expiresInSeconds: 900 };
  }

  async confirmGuardianVerification(input: {
    familyId: string;
    userId: string;
    code: string;
  }): Promise<{ verifiedAt: string }> {
    const challenge = await this.prisma.guardianVerification.findFirst({
      where: {
        familyId: input.familyId,
        targetUserId: input.userId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) throw AppError.badRequest('No pending verification for this account');

    if (!this.crypto.safeEqual(challenge.codeHash, this.crypto.hashToken(input.code))) {
      throw AppError.badRequest('That code is not correct');
    }

    const verifiedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.guardianVerification.update({
        where: { id: challenge.id },
        data: { consumedAt: verifiedAt },
      }),
      this.prisma.familyMember.update({
        where: { familyId_userId: { familyId: input.familyId, userId: input.userId } },
        data: { verifiedAt },
      }),
    ]);

    return { verifiedAt: verifiedAt.toISOString() };
  }

  /** Under-13 students need verified parental consent before any data is stored. */
  async assertChildUsable(studentId: string): Promise<void> {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        birthYear: true,
        family: {
          select: { members: { where: { verifiedAt: { not: null } }, select: { id: true } } },
        },
      },
    });
    if (!student) throw AppError.notFound('Student');

    const age = new Date().getUTCFullYear() - student.birthYear;
    if (age < 13 && student.family.members.length === 0) {
      throw new AppError(
        'CONSENT_REQUIRED',
        'A verified guardian must be added before a child under 13 can be enrolled',
        { studentId, age },
      );
    }
  }

  /** Bulk view for the parent portal privacy centre (CR-05, FR-AUTH-05). */
  async privacySummary(familyId: string) {
    const [students, consents, requests, openCases] = await Promise.all([
      this.prisma.student.findMany({
        // M11 — a deleted child was still listed in the privacy summary. The point of the
        // summary is to show a family what is held about them; naming a child their
        // family has asked to remove is the opposite of that.
        where: { familyId, deletedAt: null },
        select: { id: true, displayName: true, birthYear: true, consents: true },
      }),
      this.prisma.consent.findMany({ where: { familyId }, include: { events: true } }),
      this.prisma.dataRequest.findMany({ where: { familyId }, orderBy: { requestedAt: 'desc' } }),
      this.prisma.caseRecord.count({
        where: { openedBy: { familyMembers: { some: { familyId } } }, status: { not: 'CLOSED' } },
      }),
    ]);

    return {
      familyId,
      students: students.map((s) => ({
        id: s.id,
        displayName: s.displayName,
        birthYear: s.birthYear,
      })),
      consents,
      requests,
      openCases,
      generatedAt: new Date().toISOString(),
      exportAvailable: true,
    };
  }
}
