import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';

/**
 * Thin wrapper over the S3 client (works against AWS S3 and MinIO). Callers deal in
 * object keys and short-lived signed URLs only; objects are never publicly readable
 * (CMP-BE-05).
 */
@Injectable()
export class StorageService {
  /** Talks to storage from the server (upload, head, delete). */
  private readonly client: S3Client;
  /**
   * Signs links handed to browsers. The host is part of an S3 signature, so it cannot be
   * rewritten afterwards: a link signed for `minio:9000` is unreachable from a browser (B30).
   */
  private readonly signingClient: S3Client;
  private readonly bucket: string;
  private readonly signedUrlTtlSeconds: number;

  constructor(config: AppConfigService) {
    const s = config.storage;
    this.bucket = s.bucket;
    this.signedUrlTtlSeconds = s.signedUrlTtlSeconds;
    const base = {
      region: s.region,
      forcePathStyle: s.forcePathStyle,
      credentials: { accessKeyId: s.accessKey, secretAccessKey: s.secretKey },
    };
    this.client = new S3Client({ ...base, endpoint: s.endpoint });
    this.signingClient =
      !s.publicEndpoint || s.publicEndpoint === s.endpoint
        ? this.client
        : new S3Client({ ...base, endpoint: s.publicEndpoint });
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
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** The object's bytes, for server-side processing (a practice recording sent for scoring). */
  async getObjectBytes(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error(`Storage object ${key} has no body`);
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return false;
      throw error;
    }
  }

  /**
   * Objects under `prefix` with when they were written, up to `max` of them. Paged through
   * so a sweep sees more than one S3 page (1,000 keys), and capped so it cannot run away.
   */
  async listObjects(
    prefix: string,
    max = 5_000,
  ): Promise<Array<{ key: string; lastModified: Date }>> {
    const objects: Array<{ key: string; lastModified: Date }> = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const item of page.Contents ?? []) {
        if (item.Key && item.LastModified) {
          objects.push({ key: item.Key, lastModified: item.LastModified });
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token && objects.length < max);
    return objects.slice(0, max);
  }

  async signedDownloadUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      {
        expiresIn: this.signedUrlTtlSeconds,
      },
    );
  }

  /**
   * A signed PUT the browser can send a file to directly (M34).
   *
   * `ContentType` is part of the signature, so a client cannot upload audio bytes under
   * a document's key and content type and then have a later reader believe the type. The
   * URL is short-lived and the object stays private: it is read back through
   * `signedDownloadUrl`, never served from the bucket directly.
   */
  async signedUploadUrl(key: string, contentType: string, size?: number): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        // Signed so storage rejects a PUT larger (or smaller) than the size the API approved (Q26).
        ...(size !== undefined ? { ContentLength: size } : {}),
      }),
      {
        expiresIn: this.signedUrlTtlSeconds,
        ...(size !== undefined ? { unhoistableHeaders: new Set(['content-length']) } : {}),
      },
    );
  }

  /** How long a signed upload or download URL stays valid. */
  get signedUploadTtlSeconds(): number {
    return this.signedUrlTtlSeconds;
  }
}
