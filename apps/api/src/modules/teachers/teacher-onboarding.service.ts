import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode, Role, TeacherCredentialType, type TeacherCredential } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';

/**
 * One-time teacher profile setup (owner requirement, Nov 2026).
 *
 * A teacher is fully vetted in the hiring pipeline (recitation, interview, ID, referees,
 * training, documents) before the account exists, so this is not a second review. It asks
 * for the one thing hiring never collected — a bio written for families — plus optional
 * extras: a photo, an intro video or recitation, and certificates to display. Languages,
 * subjects, age groups and gender come from the application and are not edited here.
 *
 * Until `profileCompletedAt` is set the teacher portal is locked to the setup page, the
 * key teaching actions answer 403 PROFILE_INCOMPLETE, and the teacher is never shown to
 * families. It is set once and never asked again.
 */
export const ONBOARDING_BIO = { min: 80, max: 1500 } as const;

/** What the setup page may upload, by kind. The API never sees the bytes, so this is the check. */
export const ONBOARDING_UPLOADS = {
  photo: {
    contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 5 * 1024 * 1024,
  },
  certificate: {
    contentTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maxBytes: 10 * 1024 * 1024,
  },
  media: {
    contentTypes: [
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/mp4',
      'audio/m4a',
      'audio/webm',
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ],
    maxBytes: 50 * 1024 * 1024,
  },
} as const;

export type OnboardingUploadKind = keyof typeof ONBOARDING_UPLOADS;

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/webm': 'webm',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/** Extensions each submitted field accepts (the key's extension came from its content type). */
const FIELD_EXTENSIONS = {
  photoKey: ['jpg', 'png', 'webp'],
  recitationSampleKey: ['mp3', 'wav', 'm4a', 'webm'],
  introVideoKey: ['mp4', 'webm', 'mov'],
  certificate: ['pdf', 'jpg', 'png'],
} as const;

/** Keys handed out by `presignUpload`: `teacher-profiles/<profileId>/<uuid>.<ext>`. */
const ONBOARDING_KEY_PATTERN =
  /^teacher-profiles\/([0-9a-f-]{36})\/([0-9a-f-]{36}\.[a-z0-9]{2,5})$/;

/** Staff who also hold TEACHER are never locked into setup: they run the academy. */
const EXEMPT_ROLES: readonly string[] = [Role.ADMIN, Role.SUPER_ADMIN, Role.SUPERVISOR];

export function isOnboardingExempt(roles: readonly string[]): boolean {
  return !roles.includes(Role.TEACHER) || roles.some((r) => EXEMPT_ROLES.includes(r));
}

export interface OnboardingCertificateInput {
  key: string;
  title: string;
  issuer?: string;
  year?: number;
}

export interface OnboardingSubmission {
  bio: string;
  photoKey?: string;
  introVideoKey?: string;
  recitationSampleKey?: string;
  certificates?: OnboardingCertificateInput[];
}

/** Checks a bio against the setup rule; returns the trimmed text. */
export function assertOnboardingBio(bio: unknown): string {
  const text = typeof bio === 'string' ? bio.trim() : '';
  if (text.length < ONBOARDING_BIO.min || text.length > ONBOARDING_BIO.max) {
    throw AppError.badRequest(
      `Your bio must be ${ONBOARDING_BIO.min}-${ONBOARDING_BIO.max} characters (it is ${text.length})`,
      { field: 'bio', min: ONBOARDING_BIO.min, max: ONBOARDING_BIO.max },
    );
  }
  return text;
}

/** Checks an upload request; returns the normalised content type and the file extension. */
export function assertOnboardingUpload(
  kind: unknown,
  contentType: unknown,
  size: unknown,
): { kind: OnboardingUploadKind; contentType: string; extension: string; maxBytes: number } {
  if (typeof kind !== 'string' || !(kind in ONBOARDING_UPLOADS)) {
    throw AppError.badRequest('kind must be photo, certificate or media', {
      field: 'kind',
      allowed: Object.keys(ONBOARDING_UPLOADS),
    });
  }
  const rule = ONBOARDING_UPLOADS[kind as OnboardingUploadKind];
  const type =
    typeof contentType === 'string' ? contentType.toLowerCase().split(';')[0].trim() : '';
  if (!(rule.contentTypes as readonly string[]).includes(type)) {
    throw AppError.badRequest(`This file type is not accepted for a ${kind}`, {
      field: 'contentType',
      allowed: rule.contentTypes,
    });
  }
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1) {
    throw AppError.badRequest('size must be a positive whole number of bytes', { field: 'size' });
  }
  if (size > rule.maxBytes) {
    throw AppError.badRequest(
      `A ${kind} may be at most ${Math.floor(rule.maxBytes / 1024 / 1024)} MB`,
      { field: 'size', maxBytes: rule.maxBytes },
    );
  }
  return {
    kind: kind as OnboardingUploadKind,
    contentType: type,
    extension: EXTENSION_BY_TYPE[type],
    maxBytes: rule.maxBytes,
  };
}

@Injectable()
export class TeacherOnboardingService {
  private readonly logger = new Logger(TeacherOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfigService,
  ) {}

  /** `/api/v1/teachers/files/<profileId>/<file>`: the stable, public path a profile file is served at. */
  filePath(key: string): string {
    const match = ONBOARDING_KEY_PATTERN.exec(key);
    if (!match) throw new Error(`Not an onboarding key: ${key}`);
    const prefix = this.config.value.API_PREFIX.replace(/^\/+|\/+$/g, '');
    return `/${prefix}/teachers/files/${match[1]}/${match[2]}`;
  }

  private async profileFor(userId: string) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        bio: true,
        photoUrl: true,
        introVideoUrl: true,
        recitationSampleUrl: true,
        qualifications: true,
        profileCompletedAt: true,
        languages: true,
        subjects: true,
        ageGroups: true,
        gender: true,
        user: { select: { name: true } },
      },
    });
    if (!profile) throw AppError.notFound('Teacher profile');
    return profile;
  }

  /** `GET /teachers/me/onboarding`. */
  async status(user: { id: string; roles: readonly string[] }) {
    const profile = await this.profileFor(user.id);
    const required = !isOnboardingExempt(user.roles);
    const bio = profile.bio?.trim() ?? '';
    const missing =
      bio.length >= ONBOARDING_BIO.min && bio.length <= ONBOARDING_BIO.max ? [] : ['bio'];
    const credentials = Array.isArray(profile.qualifications)
      ? (profile.qualifications as unknown as TeacherCredential[])
      : [];
    return {
      required,
      complete: profile.profileCompletedAt !== null,
      completedAt: profile.profileCompletedAt,
      // What the setup page still needs before it can be submitted.
      missing,
      limits: { bio: ONBOARDING_BIO, uploads: ONBOARDING_UPLOADS },
      profile: {
        id: profile.id,
        name: profile.user.name,
        bio: profile.bio,
        photoUrl: profile.photoUrl,
        introVideoUrl: profile.introVideoUrl,
        recitationSampleUrl: profile.recitationSampleUrl,
        // Read-only here: these came from the application and change only through review.
        languages: profile.languages,
        subjects: profile.subjects,
        ageGroups: profile.ageGroups,
        gender: profile.gender,
        certificates: credentials.map((c) => ({
          title: c.title,
          issuer: c.issuer,
          year: c.year ?? null,
          source: c.source ?? null,
        })),
      },
    };
  }

  /** `POST /teachers/me/uploads` — a presigned PUT under the caller's own profile prefix. */
  async presignUpload(
    userId: string,
    input: { kind: unknown; contentType: unknown; size: unknown },
  ) {
    const rule = assertOnboardingUpload(input.kind, input.contentType, input.size);
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw AppError.notFound('Teacher profile');

    const key = this.storage.buildKey(
      'teacher-profiles',
      profile.id,
      `${randomUUID()}.${rule.extension}`,
    );
    const size = input.size as number;
    const uploadUrl = await this.storage.signedUploadUrl(key, rule.contentType, size);
    return {
      key,
      uploadUrl,
      url: uploadUrl,
      method: 'PUT' as const,
      headers: { 'Content-Type': rule.contentType, 'Content-Length': String(size) },
      expiresInSeconds: this.storage.signedUploadTtlSeconds,
      maxBytes: rule.maxBytes,
    };
  }

  /** A key from the client must be one of this profile's, of the right kind, and really uploaded. */
  private async assertOwnKey(
    profileId: string,
    field: string,
    key: unknown,
    extensions: readonly string[],
  ): Promise<string> {
    const match = typeof key === 'string' ? ONBOARDING_KEY_PATTERN.exec(key) : null;
    const extension = match?.[2].split('.').pop() ?? '';
    if (!match || match[1] !== profileId || !extensions.includes(extension)) {
      throw AppError.badRequest(`"${field}" is not a valid upload for your profile`, { field });
    }
    if (!(await this.storage.objectExists(key as string))) {
      throw AppError.badRequest(`"${field}" refers to a file that was not uploaded`, { field });
    }
    return key as string;
  }

  /**
   * `POST /teachers/me/onboarding` — validates and saves the setup, then marks it complete.
   *
   * Saved directly (not staged for review): the teacher is already approved and every
   * document was checked in hiring. Certificates already verified there are copied onto the
   * profile so families see them without anyone retyping them.
   */
  async submit(user: { id: string; roles: readonly string[] }, input: OnboardingSubmission) {
    const profile = await this.profileFor(user.id);
    if (profile.profileCompletedAt) {
      throw AppError.conflict(ErrorCode.CONFLICT, 'Your profile setup is already complete');
    }

    const bio = assertOnboardingBio(input.bio);
    const photoKey = input.photoKey
      ? await this.assertOwnKey(profile.id, 'photoKey', input.photoKey, FIELD_EXTENSIONS.photoKey)
      : null;
    const introVideoKey = input.introVideoKey
      ? await this.assertOwnKey(
          profile.id,
          'introVideoKey',
          input.introVideoKey,
          FIELD_EXTENSIONS.introVideoKey,
        )
      : null;
    const recitationKey = input.recitationSampleKey
      ? await this.assertOwnKey(
          profile.id,
          'recitationSampleKey',
          input.recitationSampleKey,
          FIELD_EXTENSIONS.recitationSampleKey,
        )
      : null;

    const certificates = input.certificates ?? [];
    if (!Array.isArray(certificates) || certificates.length > 10) {
      throw AppError.badRequest('Add at most 10 certificates', { field: 'certificates' });
    }
    const now = new Date().toISOString();
    const added: TeacherCredential[] = [];
    for (const [i, c] of certificates.entries()) {
      const field = `certificates.${i}`;
      const title = typeof c?.title === 'string' ? c.title.trim() : '';
      if (title.length < 1 || title.length > 160) {
        throw AppError.badRequest(`Give each certificate a title of 1-160 characters`, { field });
      }
      const issuer = typeof c.issuer === 'string' ? c.issuer.trim() : '';
      if (issuer.length > 160) {
        throw AppError.badRequest('An issuer may be at most 160 characters', { field });
      }
      const thisYear = new Date().getUTCFullYear();
      if (
        c.year !== undefined &&
        c.year !== null &&
        (!Number.isInteger(c.year) || c.year < 1900 || c.year > thisYear)
      ) {
        throw AppError.badRequest(`The year must be between 1900 and ${thisYear}`, { field });
      }
      const key = await this.assertOwnKey(profile.id, field, c.key, FIELD_EXTENSIONS.certificate);
      added.push({
        type: TeacherCredentialType.CERTIFICATE,
        title,
        issuer,
        documentUrl: key,
        // Shown, not pending: the owner's rule is that vetting happened in hiring.
        verified: true,
        verifiedAt: now,
        ...(c.year ? { year: c.year } : {}),
        source: 'ONBOARDING',
      });
    }

    const existing = Array.isArray(profile.qualifications)
      ? (profile.qualifications as unknown as TeacherCredential[])
      : [];
    const fromHiring = await this.verifiedHiringCertificates(user.id, existing);

    const completedAt = new Date();
    await this.prisma.teacherProfile.update({
      where: { id: profile.id },
      data: {
        bio,
        ...(photoKey ? { photoUrl: this.filePath(photoKey) } : {}),
        ...(introVideoKey ? { introVideoUrl: this.filePath(introVideoKey) } : {}),
        ...(recitationKey ? { recitationSampleUrl: this.filePath(recitationKey) } : {}),
        qualifications: [...existing, ...fromHiring, ...added] as never,
        profileCompletedAt: completedAt,
      },
    });

    await this.notifyAdmins(profile.user.name);
    this.logger.log(`Teacher profile ${profile.id} completed onboarding`);
    return this.status(user);
  }

  /** Certificates verified in the hiring pipeline that the profile does not show yet. */
  private async verifiedHiringCertificates(
    userId: string,
    existing: TeacherCredential[],
  ): Promise<TeacherCredential[]> {
    const documents = await this.prisma.applicationDocument.findMany({
      where: {
        type: 'CERTIFICATE',
        verified: true,
        rejected: false,
        application: { userId },
      },
      select: { fileUrl: true, approvedById: true, reviewedAt: true },
    });
    const shown = new Set(existing.map((c) => c.documentUrl));
    return documents
      .filter((d) => !shown.has(d.fileUrl))
      .map((d) => ({
        type: TeacherCredentialType.CERTIFICATE,
        title: 'Ijazah / Quran certificate',
        issuer: 'Verified by Hifzoon during hiring',
        documentUrl: d.fileUrl,
        verified: true,
        ...(d.approvedById ? { verifiedById: d.approvedById } : {}),
        verifiedAt: (d.reviewedAt ?? new Date()).toISOString(),
        source: 'HIRING' as const,
      }));
  }

  private async notifyAdmins(teacherName: string): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: { status: 'ACTIVE', roles: { some: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } } },
        select: { id: true },
      });
      if (admins.length === 0) return;
      await this.notifications.enqueue({
        userIds: admins.map((a) => a.id),
        template: TEMPLATE.TEACHER_PROFILE_COMPLETED,
        data: { teacherName },
      });
    } catch (error) {
      this.logger.warn(
        `Could not notify admins of a completed profile: ${(error as Error).message}`,
      );
    }
  }

  /**
   * `GET /teachers/files/:profileId/:file` — a short-lived signed link to a profile's photo
   * or media, for the public directory. Only a file the profile currently shows resolves:
   * certificates and unused uploads under the same prefix never do.
   */
  async publicFileUrl(profileId: string, file: string): Promise<string> {
    const key = `teacher-profiles/${profileId}/${file}`;
    if (!ONBOARDING_KEY_PATTERN.test(key)) throw AppError.notFound('File');
    const path = this.filePath(key);
    const profile = await this.prisma.teacherProfile.findFirst({
      where: {
        id: profileId,
        OR: [{ photoUrl: path }, { introVideoUrl: path }, { recitationSampleUrl: path }],
      },
      select: { id: true },
    });
    if (!profile) throw AppError.notFound('File');
    return this.storage.signedDownloadUrl(key);
  }
}
