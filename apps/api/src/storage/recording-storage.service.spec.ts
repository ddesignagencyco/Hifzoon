import { S3Client } from '@aws-sdk/client-s3';

import { RecordingStorageService } from './recording-storage.service';

/**
 * Recordings are the one thing that cannot live in Cloudinary: LiveKit Egress only writes
 * to S3/GCS. These tests pin the two behaviours retention depends on — a genuine 404 is
 * "gone", an outage is not — and that an unconfigured bucket throws instead of pretending
 * the object was removed.
 */
function buildService(configured = true): RecordingStorageService {
  const config = {
    recordingStorage: configured
      ? {
          endpoint: 'http://minio:9000',
          region: 'us-east-1',
          bucket: 'hifzoon-recordings',
          accessKey: 'minioadmin',
          secretKey: 'minioadmin',
          forcePathStyle: true,
        }
      : null,
  };
  return new RecordingStorageService(config as never);
}

describe('RecordingStorageService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports whether a recording bucket is configured', () => {
    expect(buildService().configured).toBe(true);
    expect(buildService(false).configured).toBe(false);
  });

  it('returns true when the object exists', async () => {
    const service = buildService();
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

    await expect(service.objectExists('recordings/class-1/class.mp4')).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { Bucket: 'hifzoon-recordings', Key: 'recordings/class-1/class.mp4' },
      }),
    );
  });

  it('returns false only for a genuine 404', async () => {
    const service = buildService();
    jest
      .spyOn(S3Client.prototype, 'send')
      .mockRejectedValue(
        Object.assign(new Error('gone'), { $metadata: { httpStatusCode: 404 } }) as never,
      );

    await expect(service.objectExists('recordings/class-1/class.mp4')).resolves.toBe(false);
  });

  it('rethrows an outage instead of reporting a missing recording', async () => {
    const service = buildService();
    jest.spyOn(S3Client.prototype, 'send').mockRejectedValue(
      Object.assign(new Error('connection reset'), {
        $metadata: { httpStatusCode: 503 },
      }) as never,
    );

    await expect(service.objectExists('recordings/class-1/class.mp4')).rejects.toThrow(
      /connection reset/,
    );
  });

  it('removes the object and tolerates an already-absent one', async () => {
    const service = buildService();
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    await service.remove('recordings/class-1/class.mp4');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { Bucket: 'hifzoon-recordings', Key: 'recordings/class-1/class.mp4' },
      }),
    );

    send.mockRejectedValueOnce(Object.assign(new Error('gone'), { name: 'NotFound' }) as never);
    await expect(service.remove('recordings/class-1/class.mp4')).resolves.toBeUndefined();
  });

  it('throws a clear error when recording storage is not configured', async () => {
    const service = buildService(false);
    await expect(service.remove('recordings/class-1/class.mp4')).rejects.toThrow(
      /Recording storage is not configured/,
    );
    await expect(service.objectExists('recordings/class-1/class.mp4')).rejects.toThrow(
      /Recording storage is not configured/,
    );
  });
});
