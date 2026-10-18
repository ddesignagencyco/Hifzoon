import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly signedUrlTtlSeconds: number;

  constructor(config: AppConfigService) {
    const s = config.storage;
    this.bucket = s.bucket;
    this.signedUrlTtlSeconds = s.signedUrlTtlSeconds;
    this.client = new S3Client({
      endpoint: s.endpoint,
      region: s.region,
      forcePathStyle: s.forcePathStyle,
      credentials: { accessKeyId: s.accessKey, secretAccessKey: s.secretKey },
    });
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

  async signedDownloadUrl(key: string): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: this.signedUrlTtlSeconds,
    });
  }

  /**
   * A signed PUT the browser can send a file to directly (M34).
   *
   * `ContentType` is part of the signature, so a client cannot upload audio bytes under
   * a document's key and content type and then have a later reader believe the type. The
   * URL is short-lived and the object stays private: it is read back through
   * `signedDownloadUrl`, never served from the bucket directly.
   */
  async signedUploadUrl(key: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: this.signedUrlTtlSeconds },
    );
  }

  /** How long a signed upload or download URL stays valid. */
  get signedUploadTtlSeconds(): number {
    return this.signedUrlTtlSeconds;
  }
}
