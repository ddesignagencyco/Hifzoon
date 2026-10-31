import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, envelope, mockApi } from '../helpers/fetch-mock';
import {
  presign,
  putToStorage,
  resolveContentType,
  uploadFile,
  UploadValidationError,
  validateUpload,
  type PresignedUpload,
} from '@/lib/api/modules/uploads';

const STORAGE_URL = 'https://api.cloudinary.com/v1_1/demo/video/upload';

function presigned(overrides: Partial<PresignedUpload> = {}): PresignedUpload {
  return {
    key: 'recitations/2026/abc.webm',
    url: STORAGE_URL,
    method: 'POST',
    fields: {
      api_key: 'key',
      timestamp: '1760000000',
      signature: 'sig',
      public_id: 'recitations/2026/abc',
      type: 'authenticated',
      format: 'webm',
    },
    fileField: 'file',
    expiresInSeconds: 900,
    maxBytes: 25 * 1024 * 1024,
    ...overrides,
  };
}

/** A Blob that reports `size` without allocating it. */
function sizedFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

afterEach(() => vi.restoreAllMocks());

describe('uploads: client-side rules (UPLOAD_RULES)', () => {
  it('normalises MIME parameters, aliases and missing types', () => {
    expect(resolveContentType(new Blob(['a'], { type: 'audio/webm;codecs=opus' }))).toBe('audio/webm');
    expect(resolveContentType(new File(['a'], 'a.m4a', { type: 'audio/x-m4a' }))).toBe('audio/mp4');
    expect(resolveContentType(new File(['a'], 'a.mp3', { type: 'audio/mp3' }))).toBe('audio/mpeg');
    expect(resolveContentType(new File(['a'], 'scan.PDF', { type: '' }))).toBe('application/pdf');
  });

  it('accepts audio up to 25 MB and documents up to 10 MB', () => {
    expect(validateUpload('RECITATION_AUDIO', sizedFile('a.mp3', 'audio/mpeg', 25 * 1024 * 1024))).toBe('audio/mpeg');
    expect(validateUpload('APPLICATION_DOCUMENT', sizedFile('id.png', 'image/png', 10 * 1024 * 1024))).toBe('image/png');
  });

  it('rejects oversize files and wrong types before any request', async () => {
    const api = mockApi({});
    expect(() => validateUpload('RECITATION_AUDIO', sizedFile('a.mp3', 'audio/mpeg', 25 * 1024 * 1024 + 1))).toThrow(/25 MB/);
    expect(() => validateUpload('APPLICATION_DOCUMENT', sizedFile('id.pdf', 'application/pdf', 10 * 1024 * 1024 + 1))).toThrow(/10 MB/);
    expect(() => validateUpload('RECITATION_AUDIO', new File(['a'], 'a.ogg', { type: 'audio/ogg' }))).toThrow(UploadValidationError);
    expect(() => validateUpload('APPLICATION_DOCUMENT', new File(['a'], 'a.mp3', { type: 'audio/mpeg' }))).toThrow(/PDF, JPG or PNG/);
    await expect(presign('APPLICATION_DOCUMENT', new File(['a'], 'a.docx', { type: 'application/msword' }))).rejects.toBeInstanceOf(UploadValidationError);
    expect(api.calls).toHaveLength(0);
  });
});

describe('uploads: presign', () => {
  it('POSTs { kind, contentType, size } and returns the presigned upload', async () => {
    const api = mockApi({ 'POST /uploads/presign': { body: envelope(presigned()) } });
    const blob = new Blob(['hello'], { type: 'audio/webm;codecs=opus' });
    const result = await presign('RECITATION_AUDIO', blob);
    expect(api.calls[0].method).toBe('POST');
    expect(api.calls[0].url).toContain('/uploads/presign');
    expect(api.calls[0].body).toEqual({ kind: 'RECITATION_AUDIO', contentType: 'audio/webm', size: 5 });
    expect(result.key).toBe('recitations/2026/abc.webm');
  });

  it('surfaces the backend message and a clear rate-limit message', async () => {
    mockApi({ 'POST /uploads/presign': apiError(400, 'VALIDATION_FAILED', 'Content type not accepted for RECITATION_AUDIO') });
    await expect(presign('RECITATION_AUDIO', new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(/Content type not accepted/);
    vi.restoreAllMocks();
    mockApi({ 'POST /uploads/presign': apiError(429, 'RATE_LIMITED', 'ThrottlerException') });
    await expect(presign('RECITATION_AUDIO', new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(/Too many uploads/);
  });
});

describe('uploads: putToStorage', () => {
  it('POSTs the bytes as multipart form data with the signed fields', async () => {
    const api = mockApi({ 'POST /v1_1/demo/video/upload': { status: 200 } });
    const blob = new Blob(['bytes'], { type: 'audio/webm' });
    await putToStorage(presigned(), blob);
    const [call] = api.calls;
    expect(call.method).toBe('POST');
    expect(call.url).toBe(STORAGE_URL);
    expect(call.headers.get('Authorization')).toBeNull();
    const init = api.spy.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    // FormData wraps a Blob in a File, so compare the bytes/type rather than identity.
    const sent = form.get('file') as File;
    expect(sent).toBeInstanceOf(Blob);
    expect(sent.type).toBe('audio/webm');
    expect(sent.size).toBe(blob.size);
    expect(form.get('api_key')).toBe('key');
    expect(form.get('signature')).toBe('sig');
    expect(form.get('public_id')).toBe('recitations/2026/abc');
    expect(form.get('type')).toBe('authenticated');
  });

  it('throws a clear Error when storage refuses or is unreachable', async () => {
    mockApi({ 'POST /v1_1/demo/video/upload': { status: 401 } });
    await expect(putToStorage(presigned(), new Blob(['a']))).rejects.toThrow(/refused or has expired/);
    vi.restoreAllMocks();
    mockApi({ 'POST /v1_1/demo/video/upload': { status: 500 } });
    await expect(putToStorage(presigned(), new Blob(['a']))).rejects.toThrow(/storage responded 500/);
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(putToStorage(presigned(), new Blob(['a']))).rejects.toThrow(/Could not reach file storage/);
  });
});

describe('uploads: uploadFile', () => {
  it('signs, uploads and returns the key', async () => {
    const api = mockApi({
      'POST /uploads/presign': { body: envelope(presigned()) },
      'POST /v1_1/demo/video/upload': { status: 200 },
    });
    await expect(uploadFile('RECITATION_AUDIO', new Blob(['a'], { type: 'audio/webm' }))).resolves.toBe('recitations/2026/abc.webm');
    expect(api.calls.map((c) => c.method)).toEqual(['POST', 'POST']);
  });

  it('fails without a key when the upload fails', async () => {
    mockApi({
      'POST /uploads/presign': { body: envelope(presigned()) },
      'POST /v1_1/demo/video/upload': { status: 500 },
    });
    await expect(uploadFile('RECITATION_AUDIO', new Blob(['a'], { type: 'audio/webm' }))).rejects.toThrow(/could not be uploaded/);
  });
});
