import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@hifzoon/shared';
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary';

import { AppConfigService } from '../config/app-config.service';
import { AppError } from '../common/errors/app-error';

/** Cloudinary's three upload resource types. Audio and video both use `video`. */
export type StorageResourceType = 'image' | 'video' | 'raw';

export interface SignedUploadTarget {
  /** Cloudinary's upload endpoint for this resource type. */
  url: string;
  /** Form fields the browser must send alongside the file. */
  fields: Record<string, string>;
}

export interface StoredObjectInfo {
  bytes: number;
  format?: string;
  resourceType: StorageResourceType;
}

interface ObjectLocation {
  publicId: string;
  format: string;
  resourceType: StorageResourceType;
}

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'heic',
  'heif',
  'bmp',
  'tif',
  'tiff',
  'svg',
]);

// Cloudinary treats every audio format as a `video` resource.
const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'm4v',
  'mov',
  'webm',
  'ogv',
  'mkv',
  'mp3',
  'm4a',
  'wav',
  'ogg',
  'aac',
  'flac',
]);

/**
 * Cloudinary-backed object storage (PLAT-BE-06, CMP-BE-05).
 *
 * Callers deal in object keys and short-lived URLs only; objects are uploaded as
 * Cloudinary `authenticated` assets, so they are not publicly readable. The key is the
 * stable identifier recorded in the database:
 *
 * - image/video keys keep their extension in the key, but Cloudinary strips it from the
 *   `public_id` and records it as the asset format.
 * - raw keys (PDF, JSON, …) keep the extension in the `public_id`, which is how Cloudinary
 *   identifies raw assets.
 *
 * Browser uploads use a signed POST form because Cloudinary does not have S3-style
 * presigned PUTs. The signature pins the `public_id`, type and format, so a client cannot
 * choose where the bytes land.
 */
@Injectable()
export class StorageService {
  private readonly credentials:
    { cloudName: string; apiKey: string; apiSecret: string } | undefined;
  private readonly signedUrlTtlSeconds: number;

  constructor(config: AppConfigService) {
    const c = config.cloudinary;
    this.signedUrlTtlSeconds = c.signedUrlTtlSeconds;

    if (c.cloudName && c.apiKey && c.apiSecret) {
      this.credentials = {
        cloudName: c.cloudName,
        apiKey: c.apiKey,
        apiSecret: c.apiSecret,
      };
      cloudinary.config({
        cloud_name: c.cloudName,
        api_key: c.apiKey,
        api_secret: c.apiSecret,
        secure: true,
      });
    }
  }

  /** Joins path segments into an object key, dropping empty parts and stray slashes. */
  buildKey(...parts: string[]): string {
    return parts
      .map((p) => p.replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/');
  }

  async upload(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType: string,
  ): Promise<void> {
    this.assertConfigured();
    const location = this.locate(key);
    const options: UploadApiOptions = {
      public_id: location.publicId,
      resource_type: location.resourceType,
      type: 'authenticated',
      overwrite: true,
      invalidate: true,
      ...(location.resourceType !== 'raw' && location.format ? { format: location.format } : {}),
    };
    // Content type is not a Cloudinary upload parameter; the key extension and format
    // already pin it. Kept in the signature because callers use it for their own checks.
    void contentType;

    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error) reject(error);
        else if (result) resolve(result);
        else reject(new Error(`Cloudinary returned no result for ${key}`));
      });
      stream.on('error', reject);
      stream.end(buffer);
    });
  }

  async remove(key: string): Promise<void> {
    this.assertConfigured();
    const location = this.locate(key);
    try {
      await cloudinary.uploader.destroy(location.publicId, {
        resource_type: location.resourceType,
        type: 'authenticated',
        invalidate: true,
      });
    } catch (error) {
      // Deleting an object that is already gone is a success: retention jobs retry.
      if (this.isNotFound(error)) return;
      throw error;
    }
  }

  async objectExists(key: string): Promise<boolean> {
    return (await this.objectInfo(key)) !== null;
  }

  /**
   * Size and format of a stored object, or null when it does not exist.
   *
   * The direct-upload flow validates the client's declared size before signing, but
   * Cloudinary cannot enforce a size limit from signed form fields. Callers that accept
   * an upload key from a client can use this to confirm what actually arrived.
   */
  async objectInfo(key: string): Promise<StoredObjectInfo | null> {
    this.assertConfigured();
    const location = this.locate(key);
    try {
      const resource = await cloudinary.api.resource(location.publicId, {
        resource_type: location.resourceType,
        type: 'authenticated',
      });
      return {
        bytes: Number(resource.bytes ?? 0),
        format: typeof resource.format === 'string' ? resource.format : undefined,
        resourceType: location.resourceType,
      };
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw error;
    }
  }

  async signedDownloadUrl(key: string): Promise<string> {
    this.assertConfigured();
    const location = this.locate(key);
    return cloudinary.utils.private_download_url(
      location.publicId,
      // Raw assets already carry their extension in the public id.
      location.resourceType === 'raw' ? '' : location.format,
      {
        resource_type: location.resourceType,
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + this.signedUrlTtlSeconds,
      },
    );
  }

  /**
   * The Cloudinary signed-upload form for a browser (M34).
   *
   * The signature covers the public id, type and format, so the browser cannot upload to
   * a different key or make the asset public. The returned timestamp is Cloudinary's, and
   * Cloudinary refuses uploads with an old timestamp; the API still exposes
   * `signedUploadTtlSeconds` for the client's own retry logic.
   */
  async signedUploadUrl(
    key: string,
    contentType: string,
    size?: number,
  ): Promise<SignedUploadTarget> {
    this.assertConfigured();
    const location = this.locate(key);
    // Size is validated before signing; Cloudinary has no signed size limit. Keeping the
    // parameter preserves the call-site contract and makes that intent explicit.
    void contentType;
    void size;

    const params: Record<string, string> = {
      timestamp: String(Math.floor(Date.now() / 1000)),
      public_id: location.publicId,
      type: 'authenticated',
      overwrite: 'true',
      invalidate: 'true',
      ...(location.resourceType !== 'raw' && location.format ? { format: location.format } : {}),
    };
    const credentials = this.credentials!;
    const signature = cloudinary.utils.api_sign_request(params, credentials.apiSecret);

    return {
      url: `https://api.cloudinary.com/v1_1/${encodeURIComponent(credentials.cloudName)}/${location.resourceType}/upload`,
      fields: {
        ...params,
        api_key: credentials.apiKey,
        signature,
      },
    };
  }

  /** How long a signed upload or download URL stays valid. */
  get signedUploadTtlSeconds(): number {
    return this.signedUrlTtlSeconds;
  }

  private assertConfigured(): void {
    if (!this.credentials) {
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        'Object storage is not configured: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET',
      );
    }
  }

  private locate(key: string): ObjectLocation {
    const clean = key.replace(/^\/+/, '');
    const lastSlash = clean.lastIndexOf('/');
    const lastDot = clean.lastIndexOf('.');
    const hasExtension = lastDot > lastSlash;
    const format = hasExtension ? clean.slice(lastDot + 1).toLowerCase() : '';
    const resourceType = this.resourceTypeFor(format);

    return {
      // Raw public ids keep their extension; image/video formats are separate.
      publicId:
        resourceType === 'raw' || !hasExtension ? clean : clean.slice(0, -(format.length + 1)),
      format,
      resourceType,
    };
  }

  private resourceTypeFor(extension: string): StorageResourceType {
    if (IMAGE_EXTENSIONS.has(extension)) return 'image';
    if (VIDEO_EXTENSIONS.has(extension)) return 'video';
    if (extension) return 'raw';
    // No extension: the callers only use this for exports/recordings, which always have
    // one. Treating it as raw is the safest fallback because it needs no transformation.
    return 'raw';
  }

  private isNotFound(error: unknown): boolean {
    const e = error as {
      http_code?: number;
      status?: number;
      name?: string;
    };
    return e?.http_code === 404 || e?.status === 404 || e?.name === 'ResourceNotFound';
  }
}
