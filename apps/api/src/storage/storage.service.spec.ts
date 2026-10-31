import { v2 as cloudinary } from 'cloudinary';

import { StorageService } from './storage.service';

/**
 * The storage layer is the only thing standing between a signed upload request and an
 * asset that should not be public (CMP-BE-05). These tests pin the contract callers rely
 * on: keys are built predictably, image/video/raw assets map to the right Cloudinary
 * resource type, and `objectExists` distinguishes "gone" from "storage is down" — the
 * classroom reconciler treats those two completely differently (a missing object marks a
 * recording FAILED; an outage must not).
 */
function buildService(overrides: Record<string, unknown> = {}): StorageService {
  const config = {
    cloudinary: {
      cloudName: 'hifzoon-demo',
      apiKey: 'api-key',
      apiSecret: 'api-secret',
      signedUrlTtlSeconds: 900,
      ...overrides,
    },
  };
  return new StorageService(config as never);
}

function uploadStreamMock(onEnd?: (options: Record<string, unknown>, body: Buffer) => void) {
  const implementation = (
    options: Record<string, unknown>,
    callback: (error: Error | null, result?: unknown) => void,
  ) => {
    const stream = {
      end: (body: Buffer) => {
        onEnd?.(options, body);
        callback(null, { public_id: String(options.public_id) });
        return true;
      },
      on: () => stream,
    };
    return stream;
  };
  return jest
    .spyOn(cloudinary.uploader, 'upload_stream')
    .mockImplementation(implementation as never);
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
    it('streams an mp4 as an authenticated video asset without the extension in public_id', async () => {
      const service = buildService();
      let seen: { options: Record<string, unknown>; body: Buffer } | undefined;
      uploadStreamMock((options, body) => {
        seen = { options, body };
      });

      const body = Buffer.from('bytes');
      await service.upload('recordings/class-1/clip.mp4', body, 'video/mp4');

      expect(seen?.body).toBe(body);
      expect(seen?.options).toMatchObject({
        public_id: 'recordings/class-1/clip',
        resource_type: 'video',
        type: 'authenticated',
        format: 'mp4',
      });
    });

    it('keeps the extension in a raw public_id (JSON export)', async () => {
      const service = buildService();
      let seen: Record<string, unknown> | undefined;
      uploadStreamMock((options) => {
        seen = options;
      });

      await service.upload('exports/request-1.json', '{}', 'application/json');

      expect(seen).toMatchObject({
        public_id: 'exports/request-1.json',
        resource_type: 'raw',
        type: 'authenticated',
      });
      expect(seen).not.toHaveProperty('format');
    });

    it('maps images to the image resource type', async () => {
      const service = buildService();
      let seen: Record<string, unknown> | undefined;
      uploadStreamMock((options) => {
        seen = options;
      });

      await service.upload('documents/2026/id.png', Buffer.from('png'), 'image/png');

      expect(seen).toMatchObject({
        public_id: 'documents/2026/id',
        resource_type: 'image',
        format: 'png',
      });
    });
  });

  describe('remove', () => {
    it('destroys the authenticated asset by public id', async () => {
      const service = buildService();
      const destroy = jest
        .spyOn(cloudinary.uploader, 'destroy')
        .mockResolvedValue({ result: 'ok' } as never);

      await service.remove('recordings/class-1/clip.mp4');

      expect(destroy).toHaveBeenCalledWith('recordings/class-1/clip', {
        resource_type: 'video',
        type: 'authenticated',
        invalidate: true,
      });
    });

    it('treats an already-deleted asset as success', async () => {
      const service = buildService();
      jest
        .spyOn(cloudinary.uploader, 'destroy')
        .mockRejectedValue(Object.assign(new Error('not found'), { http_code: 404 }));

      await expect(service.remove('exports/request-1.json')).resolves.toBeUndefined();
    });

    it('rethrows a non-404 error so an outage is visible to the caller', async () => {
      const service = buildService();
      jest
        .spyOn(cloudinary.uploader, 'destroy')
        .mockRejectedValue(Object.assign(new Error('connection reset'), { http_code: 503 }));

      await expect(service.remove('exports/request-1.json')).rejects.toThrow(/connection reset/);
    });
  });

  describe('objectExists / objectInfo', () => {
    it('returns true and reports size when the asset exists', async () => {
      const service = buildService();
      jest
        .spyOn(cloudinary.api, 'resource')
        .mockResolvedValue({ bytes: 1234, format: 'mp4' } as never);

      await expect(service.objectExists('recordings/class-1/clip.mp4')).resolves.toBe(true);
      await expect(service.objectInfo('recordings/class-1/clip.mp4')).resolves.toEqual({
        bytes: 1234,
        format: 'mp4',
        resourceType: 'video',
      });
    });

    it('returns null/false when the asset is genuinely absent', async () => {
      const service = buildService();
      jest
        .spyOn(cloudinary.api, 'resource')
        .mockRejectedValue(Object.assign(new Error('gone'), { http_code: 404 }));

      await expect(service.objectExists('k')).resolves.toBe(false);
      await expect(service.objectInfo('k')).resolves.toBeNull();
    });

    it('rethrows a non-404 error so an outage is not mistaken for a missing object', async () => {
      const service = buildService();
      jest
        .spyOn(cloudinary.api, 'resource')
        .mockRejectedValue(Object.assign(new Error('connection reset'), { name: 'TimeoutError' }));

      await expect(service.objectExists('k')).rejects.toThrow(/connection reset/);
    });
  });

  describe('signedDownloadUrl', () => {
    it('returns a time-limited private download URL for the asset', async () => {
      const service = buildService();
      const before = Math.floor(Date.now() / 1000);
      const privateDownload = jest
        .spyOn(cloudinary.utils, 'private_download_url')
        .mockReturnValue('https://api.cloudinary.com/v1_1/hifzoon-demo/video/download?sig');

      const url = await service.signedDownloadUrl('recordings/class-1/clip.mp4');

      expect(url).toBe('https://api.cloudinary.com/v1_1/hifzoon-demo/video/download?sig');
      const [publicId, format, options] = privateDownload.mock.calls[0];
      expect(publicId).toBe('recordings/class-1/clip');
      expect(format).toBe('mp4');
      expect(options).toMatchObject({
        resource_type: 'video',
        type: 'authenticated',
      });
      expect(options.expires_at).toBeGreaterThanOrEqual(before + 900);
    });

    it('does not append a format to a raw public id', async () => {
      const service = buildService();
      const privateDownload = jest
        .spyOn(cloudinary.utils, 'private_download_url')
        .mockReturnValue('https://download.test');

      await service.signedDownloadUrl('documents/2026/id.pdf');

      expect(privateDownload.mock.calls[0][0]).toBe('documents/2026/id.pdf');
      expect(privateDownload.mock.calls[0][1]).toBe('');
      expect(privateDownload.mock.calls[0][2]).toMatchObject({ resource_type: 'raw' });
    });
  });

  describe('signedUploadUrl', () => {
    it('returns a signed Cloudinary form pinned to the private key and format', async () => {
      const service = buildService();
      const sign = jest.spyOn(cloudinary.utils, 'api_sign_request').mockReturnValue('signature');

      const target = await service.signedUploadUrl('recitations/2026/a.webm', 'audio/webm', 1234);

      expect(target.url).toBe('https://api.cloudinary.com/v1_1/hifzoon-demo/video/upload');
      expect(target.fields).toMatchObject({
        api_key: 'api-key',
        signature: 'signature',
        public_id: 'recitations/2026/a',
        type: 'authenticated',
        format: 'webm',
      });
      expect(target.fields.timestamp).toMatch(/^\d+$/);
      expect(sign).toHaveBeenCalledWith(
        expect.objectContaining({
          public_id: 'recitations/2026/a',
          type: 'authenticated',
          format: 'webm',
        }),
        'api-secret',
      );
    });

    it('uses the raw endpoint and keeps the extension for a PDF', async () => {
      const service = buildService();
      jest.spyOn(cloudinary.utils, 'api_sign_request').mockReturnValue('signature');

      const target = await service.signedUploadUrl('documents/2026/a.pdf', 'application/pdf');

      expect(target.url).toBe('https://api.cloudinary.com/v1_1/hifzoon-demo/raw/upload');
      expect(target.fields).toMatchObject({ public_id: 'documents/2026/a.pdf' });
      expect(target.fields).not.toHaveProperty('format');
    });

    it('refuses to sign when Cloudinary is not configured', async () => {
      const service = buildService({ cloudName: '', apiKey: '', apiSecret: '' });

      await expect(
        service.signedUploadUrl('documents/2026/a.pdf', 'application/pdf'),
      ).rejects.toThrow(/Object storage is not configured/);
    });
  });
});
