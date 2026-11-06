import { ApiClientError, http } from '../http';
import { putToStorage, type PresignedUpload } from './uploads';

/**
 * One-time teacher profile setup (TeacherOnboardingService, apps/api).
 *
 *   GET  /teachers/me/onboarding  → OnboardingStatus
 *   POST /teachers/me/uploads     { kind, contentType, size } → presigned PUT + key
 *   POST /teachers/me/onboarding  OnboardingSubmission → OnboardingStatus
 *
 * Only the bio is required. The photo, intro video / recitation and certificates are
 * optional extras that help families. Languages, subjects, age groups and gender come from
 * the application and are not edited here.
 */

export const BIO_MIN = 80;
export const BIO_MAX = 1500;

export type OnboardingUploadKind = 'photo' | 'certificate' | 'media';

interface UploadRule {
  contentTypes: readonly string[];
  maxBytes: number;
  label: string;
  accept: string;
}

/** Mirrors ONBOARDING_UPLOADS in apps/api/src/modules/teachers/teacher-onboarding.service.ts. */
export const ONBOARDING_UPLOAD_RULES: Record<OnboardingUploadKind, UploadRule> = {
  photo: {
    contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 5 * 1024 * 1024,
    label: 'JPG, PNG or WebP up to 5 MB',
    accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
  },
  certificate: {
    contentTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maxBytes: 10 * 1024 * 1024,
    label: 'PDF, JPG or PNG up to 10 MB',
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
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
    label: 'MP3, WAV, M4A, MP4, WebM or MOV up to 50 MB',
    accept: '.mp3,.wav,.m4a,.mp4,.webm,.mov,audio/*,video/mp4,video/webm,video/quicktime',
  },
};

const TYPE_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/wave': 'audio/wav',
};

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

/** The content type to declare for `file`, from its MIME type or, failing that, its extension. */
export function fileContentType(file: Blob): string {
  const declared = (file.type || '').toLowerCase().split(';')[0].trim();
  if (declared) return TYPE_ALIASES[declared] ?? declared;
  const name = (file as File).name ?? '';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return EXTENSION_TYPES[ext] ?? '';
}

/** Null when `file` is acceptable for `kind`, otherwise a message fit for the form. */
export function onboardingFileError(kind: OnboardingUploadKind, file: Blob): string | null {
  const rule = ONBOARDING_UPLOAD_RULES[kind];
  if (!rule.contentTypes.includes(fileContentType(file)))
    return `This file type is not accepted. Use ${rule.label}.`;
  if (file.size <= 0) return 'This file is empty.';
  if (file.size > rule.maxBytes) return `This file is too large. Use ${rule.label}.`;
  return null;
}

/** Null when the bio can be submitted, otherwise why not. */
export function bioError(bio: string): string | null {
  const length = bio.trim().length;
  if (length < BIO_MIN) return `Write at least ${BIO_MIN} characters (${length} so far).`;
  if (length > BIO_MAX) return `Keep it to ${BIO_MAX} characters (${length} now).`;
  return null;
}

export interface OnboardingStatus {
  /** False for staff (admin, super admin, supervisor) who also hold TEACHER. */
  required: boolean;
  complete: boolean;
  completedAt: string | null;
  missing: string[];
  profile: {
    id: string;
    name: string;
    bio: string | null;
    photoUrl: string | null;
    introVideoUrl: string | null;
    recitationSampleUrl: string | null;
    languages: string[];
    subjects: string[];
    ageGroups: string[];
    gender: string | null;
    certificates: Array<{
      title: string;
      issuer: string;
      year: number | null;
      source: string | null;
    }>;
  };
}

export interface OnboardingCertificate {
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
  certificates?: OnboardingCertificate[];
}

/** Presigns, then PUTs `file` to storage; returns the key to submit. */
export async function uploadOnboardingFile(
  kind: OnboardingUploadKind,
  file: Blob,
): Promise<string> {
  const problem = onboardingFileError(kind, file);
  if (problem) throw new ApiClientError(problem, 400, 'VALIDATION_FAILED');
  const presigned = await http.post<PresignedUpload>('/teachers/me/uploads', {
    kind,
    contentType: fileContentType(file),
    size: file.size,
  });
  await putToStorage(presigned, file);
  return presigned.key;
}

export const teacherOnboardingApi = {
  status: () => http.get<OnboardingStatus>('/teachers/me/onboarding'),
  submit: (body: OnboardingSubmission) =>
    http.post<OnboardingStatus>('/teachers/me/onboarding', body),
  upload: uploadOnboardingFile,
};

/** Whether a media file goes on the profile as a video (intro) or audio (recitation). */
export function isVideoFile(file: Blob): boolean {
  return fileContentType(file).startsWith('video/');
}

const DONE_KEY = (userId: string) => `hifzoon:teacher-profile-complete:${userId}`;

/**
 * Completion is one-way, so once seen it is remembered on this device and the portal never
 * asks the API again for that teacher.
 */
export function rememberedComplete(userId: string): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(DONE_KEY(userId)) === '1';
  } catch {
    return false;
  }
}

export function rememberComplete(userId: string): void {
  try {
    window.localStorage.setItem(DONE_KEY(userId), '1');
  } catch {
    // Private mode: the status call simply runs once per visit instead.
  }
}

/** Routes under /teacher that stay open while setup is incomplete. */
export function isOnboardingOpenPath(pathname: string): boolean {
  return pathname === '/teacher/onboarding' || pathname.startsWith('/teacher/onboarding/');
}
