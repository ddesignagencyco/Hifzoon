import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { StorageService } from './storage.service';

/**
 * The storage layer is the only thing standing between a signed URL request and an
 * object that should not be public (CMP-BE-05). These tests pin the contract callers
 * rely on: keys are built predictably, and `objectExists` distinguishes "gone" from
 * "storage is down" — the classroom reconciler treats those two completely differently
 * (a missing object marks a recording FAILED; an outage must not).
 */
function buildService(overrides: Partial<Record<string, unknown>> = {}): StorageService {
  const config = {
    storage: {
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'hifzoon',
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      forcePathStyle: true,
      signedUrlTtlSeconds: 900,
      ...overrides,
    },
  };
  return new StorageService(config as never);
}

describe('StorageService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('buildKey', () => {
    it('joins segments and strips stray leading/trailing slashes', () => {
      const service = buildService();
      expect(service.buildKey('recordings', '/class-1/', 'clip.mp4')).toBe(
        'recordings/class-1/clip.mp4',
      );
    });

    it('drops empty segments instead of leaving double slashes', () => {
      const service = buildService();
      expect(service.buildKey('a', '', 'b')).toBe('a/b');
    });
  });

  describe('upload', () => {
    it('puts the object with the bucket, key and content type', async () => {
      const service = buildService();
      const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

      await service.upload('recordings/class-1/clip.mp4', Buffer.from('bytes'), 'video/mp4');

      const command = send.mock.calls[0][0] as PutObjectCommand;
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toMatchObject({
        Bucket: 'hifzoon',
        Key: 'recordings/class-1/clip.mp4',
        ContentType: 'video/mp4',
      });
    });
  });

  describe('remove', () => {
    it('deletes the object by key', async () => {
      const service = buildService();
      const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

      await service.remove('recordings/class-1/clip.mp4');

      const command = send.mock.calls[0][0] as DeleteObjectCommand;
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toMatchObject({
        Bucket: 'hifzoon',
        Key: 'recordings/class-1/clip.mp4',
      });
    });
  });

  describe('objectExists', () => {
    it('returns true when HEAD succeeds', async () => {
      const service = buildService();
      const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

      await expect(service.objectExists('k')).resolves.toBe(true);
      expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    });

    it('returns false when the object is genuinely absent (NotFound)', async () => {
      const service = buildService();
      const notFound = Object.assign(new Error('gone'), { name: 'NotFound' });
      jest.spyOn(S3Client.prototype, 'send').mockRejectedValue(notFound as never);

      await expect(service.objectExists('k')).resolves.toBe(false);
    });

    it('returns false when the provider reports a 404', async () => {
      const service = buildService();
      const notFound = Object.assign(new Error('nope'), { $metadata: { httpStatusCode: 404 } });
      jest.spyOn(S3Client.prototype, 'send').mockRejectedValue(notFound as never);

      await expect(service.objectExists('k')).resolves.toBe(false);
    });

    it('rethrows a non-404 error so an outage is not mistaken for a missing object', async () => {
      const service = buildService();
      const outage = Object.assign(new Error('connection reset'), { name: 'TimeoutError' });
      jest.spyOn(S3Client.prototype, 'send').mockRejectedValue(outage as never);

      await expect(service.objectExists('k')).rejects.toThrow(/connection reset/);
    });
  });

  describe('signedDownloadUrl', () => {
    it('returns a time-limited URL for the object', async () => {
      const service = buildService();
      // Signing is pure crypto; it never calls send. Mock it away to be explicit.
      jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

      const url = await service.signedDownloadUrl('recordings/class-1/clip.mp4');

      expect(url).toContain('recordings/class-1/clip.mp4');
      expect(url).toMatch(/X-Amz-Expires=900/);
    });
  });
});

describe('StorageService signed links (B30, Q26)', () => {
  it('signs browser links for the public endpoint, not the in-network one', async () => {
    const service = buildService({
      endpoint: 'http://minio:9000',
      publicEndpoint: 'http://localhost:9000',
    });

    const upload = await service.signedUploadUrl('recitations/2026/a.webm', 'audio/webm', 1234);
    const download = await service.signedDownloadUrl('recitations/2026/a.webm');

    expect(new URL(upload).host).toBe('localhost:9000');
    expect(new URL(download).host).toBe('localhost:9000');
  });

  it('falls back to the server endpoint when no public one is set', async () => {
    const service = buildService({ endpoint: 'http://minio:9000', publicEndpoint: undefined });
    const url = await service.signedUploadUrl('documents/2026/a.pdf', 'application/pdf');
    expect(new URL(url).host).toBe('minio:9000');
  });

  it('signs the content length so a larger PUT than approved is rejected by storage', async () => {
    const service = buildService();
    const url = new URL(
      await service.signedUploadUrl('documents/2026/a.pdf', 'application/pdf', 500),
    );
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
  });
});
