import { ApiClientError, http } from '../http';

/**
 * Direct-to-storage uploads (backend M34, §7.5).
 *
 *   POST /uploads/presign  (public, 20/min)  { kind, contentType, size }
 *     → { key, url, method: 'PUT', headers, expiresInSeconds, maxBytes }
 *   PUT  <url>  with exactly `headers` (the Content-Type is part of the signature)
 *   then record `key` on the owning resource (e.g. `POST /teachers/applications`).
 *
 * Shapes and limits mirror apps/api/src/storage/uploads.controller.ts (`UPLOAD_RULES`).
 * The API never sees the bytes, so the type and size are also checked here before asking.
 */

export type UploadKind = 'RECITATION_AUDIO' | 'APPLICATION_DOCUMENT';

interface UploadRule {
  contentTypes: readonly string[];
  maxBytes: number;
  /** For copy: "MP3, WAV, M4A or WebM". */
  label: string;
}

export const UPLOAD_RULES: Record<UploadKind, UploadRule> = {
  RECITATION_AUDIO: {
    contentTypes: ['audio/webm', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/m4a'],
    maxBytes: 25 * 1024 * 1024,
    label: 'MP3, WAV, M4A or WebM',
  },
  APPLICATION_DOCUMENT: {
    contentTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maxBytes: 10 * 1024 * 1024,
    label: 'PDF, JPG or PNG',
  },
};

/** `accept` attribute for a file input of this kind. */
export const UPLOAD_ACCEPT: Record<UploadKind, string> = {
  RECITATION_AUDIO: '.mp3,.wav,.m4a,.webm,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/webm',
  APPLICATION_DOCUMENT: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
};

/** `POST /uploads/presign` response (`UploadsController.presign`). */
export interface PresignedUpload {
  key: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresInSeconds: number;
  maxBytes: number;
}

/** A file refused before any request was made (wrong type or too large). */
export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadValidationError';
  }
}

/** Browser / OS spellings that the backend whitelist knows under another name. */
const CONTENT_TYPE_ALIASES: Record<string, string> = {
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/aac-m4a': 'audio/mp4',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'video/webm': 'audio/webm',
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
};

const EXTENSION_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

function formatMb(bytes: number): string {
  return `${Math.floor(bytes / 1024 / 1024)} MB`;
}

/**
 * The content type to declare for `file`: its MIME type without parameters
 * (`audio/webm;codecs=opus` → `audio/webm`), normalised through known aliases, or —
 * when the browser reports none — inferred from the file name's extension.
 */
export function resolveContentType(file: Blob): string {
  const declared = (file.type || '').toLowerCase().split(';')[0].trim();
  if (declared) return CONTENT_TYPE_ALIASES[declared] ?? declared;
  const name = (file as File).name ?? '';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return EXTENSION_TYPES[ext] ?? '';
}

/**
 * Checks `file` against the same rule the API applies and returns the content type to
 * declare. Throws `UploadValidationError` with a message fit for a toast.
 */
export function validateUpload(kind: UploadKind, file: Blob): string {
  const rule = UPLOAD_RULES[kind];
  const contentType = resolveContentType(file);
  if (!rule.contentTypes.includes(contentType)) {
    throw new UploadValidationError(
      kind === 'RECITATION_AUDIO'
        ? `This audio format is not accepted. Use ${rule.label}.`
        : `This file type is not accepted. Use ${rule.label}.`,
    );
  }
  if (file.size <= 0) {
    throw new UploadValidationError('This file is empty.');
  }
  if (file.size > rule.maxBytes) {
    throw new UploadValidationError(
      kind === 'RECITATION_AUDIO'
        ? `Audio files must be ${formatMb(rule.maxBytes)} or smaller.`
        : `Documents must be ${formatMb(rule.maxBytes)} or smaller.`,
    );
  }
  return contentType;
}

/** `POST /uploads/presign` for `file` (validated first). */
export async function presign(kind: UploadKind, file: Blob): Promise<PresignedUpload> {
  const contentType = validateUpload(kind, file);
  try {
    return await http.post<PresignedUpload>('/uploads/presign', { kind, contentType, size: file.size });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 429) {
      throw new ApiClientError(
        'Too many uploads in a short time. Please wait a minute and try again.',
        429,
        error.code,
        error.details,
      );
    }
    throw error;
  }
}

/** Sends the bytes to the presigned URL with exactly the headers the API signed. */
export async function putToStorage(presigned: PresignedUpload, file: Blob): Promise<void> {
  let response: Response;
  try {
    response = await fetch(presigned.url, {
      method: presigned.method ?? 'PUT',
      headers: presigned.headers,
      body: file,
    });
  } catch {
    throw new Error('Could not reach file storage. Check your connection and try again.');
  }
  if (!response.ok) {
    throw new Error(
      response.status === 403
        ? 'The upload link was refused or has expired. Please try again.'
        : `The file could not be uploaded (storage responded ${response.status}). Please try again.`,
    );
  }
}

/** Presign, PUT, and return the storage key to send to the API. */
export async function uploadFile(kind: UploadKind, file: Blob): Promise<string> {
  const presigned = await presign(kind, file);
  await putToStorage(presigned, file);
  return presigned.key;
}

export const uploadsApi = { presign, putToStorage, uploadFile, validateUpload };
